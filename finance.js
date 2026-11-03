import { subscribeOrderSummaries, prepareOrderIndex, loadOrderDetail, updateIndexedOrder } from "./order-data.js?v=20261103-complete3";
import { createOrderControls } from "./order-ui.js?v=20261103-complete3";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const $ = (id) => document.getElementById(id);

const SESSION = "finance_session_v2";
let user = null;
let orders = [];
let selected = null;
let unsubscribe = null;
let currentView = "all";
let pendingStatus = null;
const slipCache = new Map();
let detailRequest=0;
const dataControls=createOrderControls($("financeApp").querySelector("main"),$("financeTable"),
  ()=>subscribeOrders(),()=>rebuildOrderList(),()=>renderTable(),()=>{
    ["fSearch","fType","fStatus"].forEach(id=>$(id).value="");currentView="all";
    document.querySelectorAll(".nav").forEach(button=>button.classList.toggle("active",button.dataset.view==="all"));
    dataControls.resetPage();renderTable();
  });

restoreSession();

$("financeLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = normalizeUsername($("financeUsername").value);
  const password = $("financePassword").value;

  try {
    const snap = await get(ref(db, `adminAccounts/${username}`));
    if (!snap.exists()) throw new Error("INVALID");

    const account = snap.val();
    const hash = await sha256(password);

    if (String(account.passwordHash || "").toLowerCase() !== hash.toLowerCase()) {
      throw new Error("INVALID");
    }

    if (!["admin_finance", "finance", "admin"].includes(account.role || "")) {
      throw new Error("ROLE");
    }

    user = { username, role: account.role || "admin" };
    saveSession();
    openApp();
  } catch (error) {
    toast(error?.message === "ROLE"
      ? "บัญชีนี้ไม่มีสิทธิ์ฝ่ายการเงิน"
      : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }
});

function saveSession() {
  const remember = $("financeRemember").checked;
  const data = JSON.stringify({
    ...user,
    expiresAt: Date.now() + (remember ? 7 * 86400000 : 12 * 3600000)
  });

  if (remember) {
    localStorage.setItem(SESSION, data);
    sessionStorage.removeItem(SESSION);
  } else {
    sessionStorage.setItem(SESSION, data);
    localStorage.removeItem(SESSION);
  }
}

function restoreSession() {
  const raw = localStorage.getItem(SESSION) || sessionStorage.getItem(SESSION);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    if (!data.expiresAt || Date.now() > data.expiresAt) {
      clearSession();
      return;
    }

    if (!["admin_finance", "finance", "admin"].includes(data.role || "")) {
      clearSession();
      return;
    }

    user = data;
    openApp();
  } catch {
    clearSession();
  }
}

function clearSession() {
  user=null;
  localStorage.removeItem(SESSION);
  sessionStorage.removeItem(SESSION);
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

function openApp() {
  $("financeLogin").classList.add("hidden");
  $("financeApp").classList.remove("hidden");
  subscribeOrders();
}

$("financeLogout").addEventListener("click", () => {
  clearSession();
  location.reload();
});

function subscribeOrders(){
  if(unsubscribe)unsubscribe();
  dataControls.loading();
  ["fPending","navPending","fVerified","fRejected","fTotal"].forEach(id=>$(id).textContent="—");
  unsubscribe=subscribeOrderSummaries(db,raw=>{
    orders=Object.entries(raw).map(([id,value])=>({id,...value}))
      .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
    dataControls.ready(orders.length);render();
  },error=>dataControls.error(error),(count,total)=>dataControls.loading(count,total));
}
async function rebuildOrderList(){
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  dataControls.loading();
  try{await prepareOrderIndex(db,(count,total)=>dataControls.loading(count,total),true);subscribeOrders();}
  catch(error){dataControls.error(error);}
}
function stopFinanceReads(){if(unsubscribe){unsubscribe();unsubscribe=null;}}
document.addEventListener("visibilitychange",()=>{
  if(document.hidden)stopFinanceReads();
  else if(user&&!$("financeApp").classList.contains("hidden"))subscribeOrders();
});
window.addEventListener("pagehide",stopFinanceReads);
window.addEventListener("pageshow",event=>{if(event.persisted&&!document.hidden&&user&&!$("financeApp").classList.contains("hidden"))subscribeOrders();});

$("financeRefresh").addEventListener("click",()=>subscribeOrders());

["fSearch", "fType", "fStatus"].forEach((id) => {
  $(id).addEventListener("input",()=>{dataControls.resetPage();renderTable();});
  $(id).addEventListener("change",()=>{dataControls.resetPage();renderTable();});
});

document.querySelectorAll(".nav").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    currentView = button.dataset.view;
    dataControls.resetPage();
    renderTable();
  });
});

function render() {
  const pending = orders.filter((o) => paymentStatus(o) === "pending").length;
  const verified = orders.filter((o) => paymentStatus(o) === "verified").length;
  const rejected = orders.filter((o) => paymentStatus(o) === "rejected").length;

  $("fPending").textContent = pending;
  $("navPending").textContent = pending;
  $("fVerified").textContent = verified;
  $("fRejected").textContent = rejected;
  $("fTotal").textContent = money(
    orders.reduce((sum, order) => sum + Number(order.order?.totalAmount || 0), 0)
  );

  renderTable();
}

function renderTable() {
  const q = $("fSearch").value.trim().toLowerCase();
  const type = $("fType").value;
  const status = $("fStatus").value;

  const list = orders.filter((order) => {
    if (currentView === "pending" && paymentStatus(order) !== "pending") return false;
    if (type && order.buyerType !== type) return false;
    if (status && paymentStatus(order) !== status) return false;

    const customer = order.customer || {};

    return !q || [
      order.referenceCode,
      fullName(order),
      customer.studentId,
      customer.phone,
      customer.level
    ].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  $("financeTable").innerHTML = dataControls.page(list).map((order) => `
    <tr>
      <td><strong>${escapeHTML(fullName(order))}</strong><br><small>${escapeHTML(order.referenceCode || "-")}</small></td>
      <td>${({student:"นักเรียน",teacher:"ครู",director:"ผอ."})[order.buyerType]||"-"}</td>
      <td>${Number(order.order?.quantity || 0)} ใบ</td>
      <td>${money(order.order?.totalAmount)}</td>
      <td>${statusBadge(paymentStatus(order))}</td>
      <td>${formatDate(order.createdAt)}</td>
      <td><button class="view-btn" data-open="${order.id}">ตรวจสอบ</button></td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openOrder(button.dataset.open));
  });
}

async function openOrder(id) {
  if(!orders.some(order=>order.id===id))return;
  const request=++detailRequest;
  $("financeModal").classList.add("hidden");
  let order;
  try{order=await loadOrderDetail(db,id);}
  catch(error){console.error(error);toast("โหลดรายละเอียดไม่สำเร็จ กรุณาลองใหม่");return;}
  if(request!==detailRequest)return;
  if(!order){toast("ไม่พบคำสั่งซื้อนี้");return;}
  selected = order;
  const customer = order.customer || {};

  $("fmName").textContent = fullName(order);
  $("fmAmount").textContent = money(order.order?.totalAmount);
  $("fmRef").textContent = order.referenceCode || "-";
  $("fmType").textContent = ({student:"นักเรียน",teacher:"ครู",director:"ผอ."})[order.buyerType]||"-";
  $("fmStudent").textContent = customer.studentId || "-";
  $("fmClass").textContent = customer.level
    ? `${customer.level} / ห้อง ${customer.room || "-"}`
    : "ครู";
  $("fmPhone").textContent = customer.phone || "-";
  $("fmQty").textContent = `${Number(order.order?.quantity || 0)} ใบ`;
  $("fmDate").textContent = formatDate(order.createdAt);
  $("fmStatus").textContent = statusLabel(paymentStatus(order));
  const slipImg=$("fmSlip");
  const oldSlip=order.payment?.slipData||"";
  if(oldSlip){
    slipImg.src=oldSlip;
    slipImg.alt="สลิปการชำระเงิน";
  }else{
    slipImg.removeAttribute("src");
    slipImg.alt="กำลังโหลดสลิป...";
    try{
      let slip=slipCache.get(order.id);
      if(!slip){
        const slipSnap=await get(ref(db,`orderSlips/${order.id}/data`));
        slip=slipSnap.exists()?slipSnap.val():"";
        if(slip) slipCache.set(order.id,slip);
        if(request!==detailRequest)return;
      }
      slipImg.src=slip||"";
      slipImg.alt=slip?"สลิปการชำระเงิน":"ไม่พบสลิป";
    }catch(error){
      console.error("load slip",error);
      slipImg.alt="โหลดสลิปไม่สำเร็จ";
    }
  }
  $("fmBankRef").value = order.payment?.bankReference || "";
  $("fmNote").value = order.payment?.financeNote || "";

  $("financeModal").classList.remove("hidden");
}

document.querySelectorAll("[data-close-finance]").forEach((el) => {
  el.addEventListener("click", () => $("financeModal").classList.add("hidden"));
});

/* กดเลือกสถานะ -> ยังไม่บันทึกทันที แต่เปิดหน้าต่างยืนยันก่อน */
document.querySelectorAll("[data-finance-status]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!selected) return;

    pendingStatus = button.dataset.financeStatus;
    openStatusConfirmation(pendingStatus);
  });
});

function openStatusConfirmation(status) {
  const labels = {
    pending: {
      title: "ยืนยันให้กลับเป็นรอตรวจสอบ?",
      text: "รายการนี้จะกลับไปอยู่ในคิวรอฝ่ายการเงินตรวจสอบ",
      icon: "⌛"
    },
    verified: {
      title: "ยืนยันว่าการชำระเงินถูกต้อง?",
      text: "ระบบจะบันทึกว่าเงินเข้าถูกต้องแล้ว แต่จะยังไม่เปิดให้รับสินค้า จนกว่าแอดมินจะเปิดการรับสินค้า",
      icon: "✓"
    },
    rejected: {
      title: "ยืนยันว่าการชำระเงินมีปัญหา?",
      text: "ผู้สั่งซื้อจะเห็นสถานะว่าการชำระเงินมีปัญหา พร้อมหมายเหตุของฝ่ายการเงิน",
      icon: "!"
    }
  };

  const info = labels[status];

  $("confirmStatusIcon").textContent = info.icon;
  $("confirmStatusTitle").textContent = info.title;
  $("confirmStatusText").textContent = info.text;
  $("confirmOrderName").textContent = fullName(selected);
  $("confirmOrderAmount").textContent = money(selected.order?.totalAmount);

  const confirmButton = $("confirmFinanceStatus");
  confirmButton.className = status === "verified"
    ? "confirm-verified"
    : status === "rejected"
      ? "confirm-rejected"
      : "confirm-pending";
  confirmButton.textContent = status === "verified"
    ? "ยืนยันยอดถูกต้อง"
    : status === "rejected"
      ? "ยืนยันว่ามีปัญหา"
      : "ยืนยันรอตรวจสอบ";

  $("financeConfirmModal").classList.remove("hidden");
}

function closeStatusConfirmation() {
  pendingStatus = null;
  $("financeConfirmModal").classList.add("hidden");
}

$("cancelFinanceStatus").addEventListener("click", closeStatusConfirmation);
document.querySelectorAll("[data-close-confirm]").forEach((el) => {
  el.addEventListener("click", closeStatusConfirmation);
});

$("confirmFinanceStatus").addEventListener("click", async () => {
  if (!selected || !pendingStatus) return;

  const status = pendingStatus;
  const button = $("confirmFinanceStatus");

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "กำลังบันทึก...";

  /* ฝ่ายการเงินแก้เฉพาะสถานะการเงินเท่านั้น
     ไม่แตะ pickup/status และไม่สร้าง pickup code */
  const patch = {
    "payment/status": status,
    "payment/reviewedAt": Date.now(),
    "payment/reviewedBy": user?.username || "finance",
    "payment/bankReference": $("fmBankRef").value.trim(),
    "payment/financeNote": $("fmNote").value.trim(),
    status: status === "verified"
      ? "payment_verified"
      : status === "rejected"
        ? "payment_issue"
        : "pending_review"
  };

  try {
    await updateIndexedOrder(db, selected.id, patch);

    closeStatusConfirmation();
    $("financeModal").classList.add("hidden");

    toast(
      status === "verified"
        ? "ยืนยันการชำระเงินแล้ว · รอแอดมินเปิดรับสินค้า"
        : "อัปเดตสถานะการเงินแล้ว"
    );
  } catch (error) {
    console.error(error);
    toast("อัปเดตสถานะไม่สำเร็จ");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

function paymentStatus(order) {
  return order.payment?.status || "pending";
}

function statusLabel(status) {
  return {
    pending: "รอตรวจสอบ",
    verified: "ผ่านแล้ว",
    rejected: "มีปัญหา"
  }[status] || status;
}

function statusBadge(status) {
  return `<span class="pill ${status}">${statusLabel(status)}</span>`;
}

function fullName(order) {
  const c = order.customer || {};
  return `${c.prefix || ""}${c.firstName || ""} ${c.lastName || ""}`.trim() || "-";
}

function money(value) {
  return `฿${Number(value || 0).toLocaleString("th-TH")}`;
}

function formatDate(value) {
  if (typeof value !== "number") return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.#$\[\]\/]/g, "");
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  $("financeToast").innerHTML = `<div class="toast">${escapeHTML(message)}</div>`;
  setTimeout(() => {
    $("financeToast").innerHTML = "";
  }, 3400);
}
