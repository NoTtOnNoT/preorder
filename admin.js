import { subscribeOrderSummaries, prepareOrderIndex, loadOrderDetail, updateIndexedOrder, updateIndexedRoot } from "./order-data.js?v=20261103-usage2";
import { createOrderControls } from "./order-ui.js?v=20261103-usage2";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SESSION_KEY = "preorder_admin_session";
const SESSION_DAYS = 7;

const loginScreen = document.getElementById("loginScreen");
const adminApp = document.getElementById("adminApp");
const loginForm = document.getElementById("loginForm");
const username = document.getElementById("username");
const password = document.getElementById("password");
const rememberLogin = document.getElementById("rememberLogin");
const logoutBtn = document.getElementById("logoutBtn");

const navs = [...document.querySelectorAll(".nav")];
const dashboardView = document.getElementById("dashboardView");
const ordersView = document.getElementById("ordersView");
const pageTitle = document.getElementById("pageTitle");
const refreshBtn = document.getElementById("refreshBtn");

const totalOrders = document.getElementById("totalOrders");
const totalBags = document.getElementById("totalBags");
const totalRevenue = document.getElementById("totalRevenue");
const pendingCount = document.getElementById("pendingCount");
const verifiedCount = document.getElementById("verifiedCount");
const todayCount = document.getElementById("todayCount");
const pickedUpCount = document.getElementById("pickedUpCount");
const sitePageViews = document.getElementById("sitePageViews");
const siteTodayViews = document.getElementById("siteTodayViews");
const siteViewsTotalLarge = document.getElementById("siteViewsTotalLarge");
const siteViewsTodayLarge = document.getElementById("siteViewsTodayLarge");
const siteLastOpened = document.getElementById("siteLastOpened");

const recentOrders = document.getElementById("recentOrders");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const levelFilter = document.getElementById("levelFilter");
const orderTableBody = document.getElementById("orderTableBody");

const detailModal = document.getElementById("detailModal");
const dReference = document.getElementById("dReference");
const dStudentId = document.getElementById("dStudentId");
const dName = document.getElementById("dName");
const dClass = document.getElementById("dClass");
const dPhone = document.getElementById("dPhone");
const dContact = document.getElementById("dContact");
const dQuantity = document.getElementById("dQuantity");
const dTotal = document.getElementById("dTotal");
const dSlip = document.getElementById("dSlip");
const globalPickupStatus = document.getElementById("globalPickupStatus");
const globalPickupMeta = document.getElementById("globalPickupMeta");
const openPickupBtn = document.getElementById("openPickupBtn");
const closePickupBtn = document.getElementById("closePickupBtn");
const dPickupStatus = document.getElementById("dPickupStatus");
const dPickupCode = document.getElementById("dPickupCode");
const setReadyBtn = document.getElementById("setReadyBtn");
const markPickedUpBtn = document.getElementById("markPickedUpBtn");
const lockPickupBtn = document.getElementById("lockPickupBtn");

let orders = [];
let selectedId = null;
let currentAdmin = null;
let unsubscribe = null;
let unsubscribeConfig = null;
let unsubscribeSiteStats = null;
let pickupOpen = false;
let pickupOpenedAt = null;
let pickupOpenedBy = null;
const slipCache = new Map();
let orderListReady=false,detailRequest=0;
const dataControls=createOrderControls(adminApp.querySelector("main"),orderTableBody,
  ()=>subscribeOrders(),()=>rebuildOrderList(),()=>renderTable());

restoreSession();

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const user = normalizeUsername(username.value);
  const pass = password.value;

  try {
    const snap = await get(ref(db, `adminAccounts/${user}`));

    if (!snap.exists()) throw new Error("INVALID");

    const account = snap.val();
    const hash = await sha256(pass);

    if (!account.passwordHash || hash.toLowerCase() !== String(account.passwordHash).toLowerCase()) {
      throw new Error("INVALID");
    }

    const role = String(account.role || "").trim();

    if (role !== "admin") {
      throw new Error("NO_ADMIN_ACCESS");
    }

    currentAdmin = { username: user, role };

    saveSession(currentAdmin, rememberLogin.checked);

    loginScreen.classList.add("hidden");
    adminApp.classList.remove("hidden");

    subscribeOrders();
  } catch (error) {
    if (error?.message === "NO_ADMIN_ACCESS") {
      showToast("บัญชีนี้ไม่มีสิทธิ์เข้า Admin");
    } else {
      showToast("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }
  }
});

function saveSession(admin, remember) {
  const data = JSON.stringify({
    ...admin,
    expiresAt: Date.now() + (remember ? SESSION_DAYS * 86400000 : 12 * 60 * 60 * 1000)
  });

  if (remember) {
    localStorage.setItem(SESSION_KEY, data);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, data);
    localStorage.removeItem(SESSION_KEY);
  }
}

function restoreSession() {
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);

    if (!data.expiresAt || Date.now() > data.expiresAt) {
      clearSession();
      return;
    }

    if (data.role !== "admin") {
      clearSession();
      showToast("บัญชีนี้ไม่มีสิทธิ์เข้า Admin");
      return;
    }

    currentAdmin = data;
    loginScreen.classList.add("hidden");
    adminApp.classList.remove("hidden");
    subscribeOrders();
  } catch {
    clearSession();
  }
}

function clearSession() {
  currentAdmin=null;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (unsubscribeConfig) {
    unsubscribeConfig();
    unsubscribeConfig = null;
  }
  if (unsubscribeSiteStats) {
    unsubscribeSiteStats();
    unsubscribeSiteStats = null;
  }
}

logoutBtn.addEventListener("click", () => {
  clearSession();
  location.reload();
});

navs.forEach((btn) => {
  btn.addEventListener("click", () => {
    navs.forEach((n) => n.classList.remove("active"));
    btn.classList.add("active");

    const dashboard = btn.dataset.view === "dashboard";

    dashboardView.classList.toggle("active", dashboard);
    ordersView.classList.toggle("active", !dashboard);

    pageTitle.textContent = dashboard ? "ภาพรวมพรีออเดอร์" : "คำสั่งซื้อทั้งหมด";
  });
});

function subscribeOrders() {
  if (unsubscribe) unsubscribe();
  orderListReady=false;
  dataControls.loading();
  [totalOrders,totalBags,totalRevenue,pendingCount,verifiedCount,todayCount,pickedUpCount].forEach(el=>{if(el)el.textContent="—";});
  unsubscribe=subscribeOrderSummaries(db,raw=>{
    orders=Object.entries(raw).map(([id,value])=>({id,...value}))
      .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
    orderListReady=true;dataControls.ready();renderAll();
  },error=>{orderListReady=false;dataControls.error(error);},count=>dataControls.loading(count));
  if(!unsubscribeConfig)unsubscribeConfig=onValue(ref(db,"systemConfig"),snap=>{
    const config=snap.val()||{};
    pickupOpen=config.pickupOpen===true;
    pickupOpenedAt=config.pickupOpenedAt||null;
    pickupOpenedBy=config.pickupOpenedBy||null;
    renderPickupControl();
  },error=>{console.warn("pickup config",error);globalPickupStatus.textContent="โหลดสถานะไม่สำเร็จ";});
  // Subscribe to three scalar values, not the complete history of site visits.
  if(!unsubscribeSiteStats){
    const state={days:{[adminDateKey()]:{}}};
    let dayTimer;
    const stops=[
      onValue(ref(db,"siteStats/pageViews"),snap=>{state.pageViews=snap.val();renderSiteStats(state);}),
      onValue(ref(db,"siteStats/lastOpenedAt"),snap=>{state.lastOpenedAt=snap.val();renderSiteStats(state);}),
      onValue(ref(db,`siteStats/days/${adminDateKey()}/pageViews`),snap=>{state.days[adminDateKey()]={pageViews:snap.val()};renderSiteStats(state);})
    ];
    unsubscribeSiteStats=()=>{clearTimeout(dayTimer);stops.forEach(stop=>stop());};
    const midnight=new Date();midnight.setHours(24,0,0,0);
    dayTimer=setTimeout(()=>{
      unsubscribeSiteStats?.();unsubscribeSiteStats=null;
      if(currentAdmin&&!document.hidden)subscribeOrders();
    },Math.max(1000,midnight.getTime()-Date.now()+100));
  }
}
async function rebuildOrderList(){
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  orderListReady=false;dataControls.loading();
  try{await prepareOrderIndex(db,count=>dataControls.loading(count),true);subscribeOrders();}
  catch(error){dataControls.error(error);}
}
function stopAdminReads(){
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  if(unsubscribeConfig){unsubscribeConfig();unsubscribeConfig=null;}
  if(unsubscribeSiteStats){unsubscribeSiteStats();unsubscribeSiteStats=null;}
}
document.addEventListener("visibilitychange",()=>{
  if(document.hidden)stopAdminReads();
  else if(currentAdmin&&!adminApp.classList.contains("hidden"))subscribeOrders();
});
window.addEventListener("pagehide",stopAdminReads);
window.addEventListener("pageshow",event=>{if(event.persisted&&!document.hidden&&currentAdmin&&!adminApp.classList.contains("hidden"))subscribeOrders();});

function adminDateKey(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function renderSiteStats(stats){
  const total=Number(stats.pageViews||0);
  const today=Number(stats.days?.[adminDateKey()]?.pageViews||0);
  const lastOpened=stats.lastOpenedAt;

  if(sitePageViews) sitePageViews.textContent=total.toLocaleString("th-TH");
  if(siteTodayViews) siteTodayViews.textContent=today.toLocaleString("th-TH");
  if(siteViewsTotalLarge) siteViewsTotalLarge.textContent=total.toLocaleString("th-TH");
  if(siteViewsTodayLarge) siteViewsTodayLarge.textContent=today.toLocaleString("th-TH");
  if(siteLastOpened){
    siteLastOpened.textContent=typeof lastOpened==="number"
      ? new Intl.DateTimeFormat("th-TH",{dateStyle:"medium",timeStyle:"short"}).format(new Date(lastOpened))
      : "-";
  }
}

function renderPickupControl() {
  if (!globalPickupStatus) return;

  globalPickupStatus.textContent = pickupOpen
    ? "เปิดรับสินค้าแล้ว"
    : "ยังไม่เปิดรับสินค้า";
  globalPickupStatus.className = pickupOpen ? "open" : "closed";

  if (pickupOpen && pickupOpenedAt) {
    globalPickupMeta.textContent = `เปิดโดย ${pickupOpenedBy || "admin"} · ${formatDate(new Date(pickupOpenedAt))}`;
  } else {
    globalPickupMeta.textContent = "รอแอดมินเปิดหลังจบช่วงพรีออเดอร์และสินค้าพร้อม";
  }

  closePickupBtn.disabled = !pickupOpen;
  openPickupBtn.textContent = pickupOpen
    ? "ซิงก์รายการที่ชำระผ่าน"
    : "เปิดรับสินค้า / ซิงก์รายการ";
}

function createPickupCode(order) {
  const source = String(order.referenceCode || order.id || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-6)
    .toUpperCase();

  return `PK-${source}`;
}

function renderAll() {
  renderStats();
  renderRecent();
  renderTable();
}

function renderStats() {
  totalOrders.textContent = orders.length;
  totalBags.textContent = orders.reduce((s, o) => s + Number(o.order?.quantity || 0), 0);
  totalRevenue.textContent = money(orders.reduce((s, o) => s + Number(o.order?.totalAmount || 0), 0));

  pendingCount.textContent = orders.filter((o) => statusOf(o) === "pending").length;
  verifiedCount.textContent = orders.filter((o) => statusOf(o) === "verified").length;
  if (pickedUpCount) {
    pickedUpCount.textContent = orders.filter((o) => (o.pickup?.status || "locked") === "picked_up").length;
  }

  const today = key(new Date());
  todayCount.textContent = orders.filter((o) => {
    const d = toDate(o.createdAt);
    return d && key(d) === today;
  }).length;
}

function renderRecent() {
  recentOrders.innerHTML = "";

  orders.slice(0, 6).forEach((o) => {
    const row = document.createElement("div");
    row.className = "recent-row";

    row.innerHTML = `
      <div><strong>${escapeHTML(nameOf(o))}</strong><span>${escapeHTML(o.referenceCode || "-")}</span></div>
      <div><span>จำนวน</span><strong>${Number(o.order?.quantity || 0)} ใบ</strong></div>
      <div><span>ยอด</span><strong>${money(o.order?.totalAmount || 0)}</strong></div>
      <button data-id="${o.id}">รายละเอียด</button>
    `;

    recentOrders.appendChild(row);
  });

  attachButtons();
}

function renderTable() {
  const q = searchInput.value.trim().toLowerCase();
  const s = statusFilter.value;
  const l = levelFilter.value;

  const filtered = orders.filter((o) => {
    const c = o.customer || {};

    if (s && statusOf(o) !== s) return false;
    if (l && c.level !== l) return false;

    if (!q) return true;

    return [
      o.referenceCode,
      nameOf(o),
      c.studentId,
      c.phone,
      c.level,
      c.room,
      c.contact?.value
    ].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  orderTableBody.innerHTML = "";

  dataControls.page(filtered).forEach((o) => {
    const c = o.customer || {};
    const d = toDate(o.createdAt);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong>${escapeHTML(nameOf(o))}</strong><br><small>${escapeHTML(c.studentId || c.phone || "-")}</small></td>
      <td>${({student:"นักเรียน",teacher:"ครู",director:"ผอ."})[o.buyerType]||"-"}</td>
      <td>${c.level ? `${escapeHTML(c.level)} / ${escapeHTML(c.room || "-")}` : "-"}</td>
      <td>${Number(o.order?.quantity || 0)} ใบ</td>
      <td>${money(o.order?.totalAmount || 0)}</td>
      <td>${statusBadge(o)}</td>
      <td>${pickupBadge(o)}</td>
      <td>${d ? formatDate(d) : "-"}</td>
      <td><button class="small-btn" data-id="${o.id}">ดู</button></td>
    `;

    orderTableBody.appendChild(tr);
  });

  attachButtons();
}

searchInput.addEventListener("input",()=>{dataControls.resetPage();renderTable();});
statusFilter.addEventListener("change",()=>{dataControls.resetPage();renderTable();});
levelFilter.addEventListener("change",()=>{dataControls.resetPage();renderTable();});
refreshBtn.addEventListener("click",()=>subscribeOrders());

function attachButtons() {
  document.querySelectorAll("[data-id]").forEach((btn) => {
    btn.onclick = () => openDetail(btn.dataset.id);
  });
}


openPickupBtn.addEventListener("click", async () => {
  if(!orderListReady)return showToast("กรุณารอโหลดรายการให้สำเร็จก่อน");
  const verified = orders.filter((order) =>
    statusOf(order) === "verified" &&
    (order.pickup?.status || "locked") !== "picked_up"
  );

  const message = pickupOpen
    ? `ต้องการซิงก์ ${verified.length} รายการที่ชำระผ่านให้พร้อมรับสินค้าใช่หรือไม่?`
    : `ต้องการเปิดการรับสินค้าใช่หรือไม่?\n\nระบบจะทำให้รายการที่ฝ่ายการเงินยืนยันแล้ว ${verified.length} รายการพร้อมรับ`;

  if (!confirm(message)) return;

  const updates = {
    "systemConfig/pickupOpen": true,
    "systemConfig/pickupOpenedAt": Date.now(),
    "systemConfig/pickupOpenedBy": currentAdmin?.username || "admin"
  };

  verified.forEach((order) => {
    updates[`preorders/${order.id}/pickup/status`] = "ready";
    updates[`preorders/${order.id}/pickup/code`] =
      order.pickup?.code || createPickupCode(order);
  });

  try {
    openPickupBtn.disabled = true;
    await updateIndexedRoot(db, updates);
    showToast(`เปิดรับสินค้าแล้ว · พร้อมรับ ${verified.length} รายการ`);
  } catch (error) {
    console.error(error);
    showToast("เปิดการรับสินค้าไม่สำเร็จ");
  } finally {
    openPickupBtn.disabled = false;
  }
});

closePickupBtn.addEventListener("click", async () => {
  if(!orderListReady)return showToast("กรุณารอโหลดรายการให้สำเร็จก่อน");
  if (!confirm("ต้องการปิดการรับสินค้าชั่วคราวใช่หรือไม่?\nรายการที่รับไปแล้วจะไม่ถูกเปลี่ยน")) return;

  const updates = {
    "systemConfig/pickupOpen": false,
    "systemConfig/pickupClosedAt": Date.now(),
    "systemConfig/pickupClosedBy": currentAdmin?.username || "admin"
  };

  orders.forEach((order) => {
    if ((order.pickup?.status || "locked") === "ready") {
      updates[`preorders/${order.id}/pickup/status`] = "locked";
    }
  });

  try {
    closePickupBtn.disabled = true;
    await updateIndexedRoot(db, updates);
    showToast("ปิดการรับสินค้าแล้ว");
  } catch (error) {
    console.error(error);
    showToast("ปิดการรับสินค้าไม่สำเร็จ");
  } finally {
    closePickupBtn.disabled = false;
  }
});

async function openDetail(id) {
  if(!orders.some(order=>order.id===id))return;
  const request=++detailRequest;
  selectedId=id;
  detailModal.classList.add("hidden");
  let o;
  try{o=await loadOrderDetail(db,id);}
  catch(error){console.error(error);showToast("โหลดรายละเอียดไม่สำเร็จ กรุณาลองใหม่");return;}
  if(request!==detailRequest||selectedId!==id)return;
  if(!o){showToast("ไม่พบคำสั่งซื้อนี้");return;}
  const c = o.customer || {};

  dReference.textContent = o.referenceCode || "-";
  dStudentId.textContent = c.studentId || (o.buyerType === "teacher" ? "ครู" : "-");
  dName.textContent = nameOf(o);
  dClass.textContent = c.level ? `${c.level} / ห้อง ${c.room || "-"}` : "ครู";
  dPhone.textContent = c.phone || "-";
  dContact.textContent = c.contact ? `${c.contact?.type === "instagram" ? "Instagram" : "Facebook"} · ${c.contact?.value || "-"}` : "-";
  dQuantity.textContent = `${Number(o.order?.quantity || 0)} ใบ`;
  dTotal.textContent = money(o.order?.totalAmount || 0);
  // Old orders may still contain payment.slipData.
  // New orders keep the large image under orderSlips/{orderId}, so the
  // dashboard/table remains lightweight and the image is fetched on demand.
  const oldSlip=o.payment?.slipData||"";
  if(oldSlip){
    dSlip.src=oldSlip;
  }else{
    dSlip.removeAttribute("src");
    dSlip.alt="กำลังโหลดสลิป...";
    try{
      let slip=slipCache.get(o.id);
      if(!slip){
        const slipSnap=await get(ref(db,`orderSlips/${o.id}/data`));
        slip=slipSnap.exists()?slipSnap.val():"";
        if(slip) slipCache.set(o.id,slip);
        if(request!==detailRequest||selectedId!==id)return;
      }
      dSlip.src=slip||"";
      dSlip.alt=slip?"สลิปการชำระเงิน":"ไม่พบสลิป";
    }catch(error){
      console.error("load slip",error);
      dSlip.alt="โหลดสลิปไม่สำเร็จ";
    }
  }

  const pickupStatus = o.pickup?.status || "locked";
  dPickupStatus.textContent = {
    locked: "ยังไม่พร้อมรับ",
    ready: "พร้อมรับ",
    picked_up: "รับสินค้าแล้ว"
  }[pickupStatus] || pickupStatus;
  dPickupCode.textContent = o.pickup?.code || "ยังไม่มีรหัส";

  setReadyBtn.disabled = statusOf(o) !== "verified";
  markPickedUpBtn.disabled = pickupStatus !== "ready";
  lockPickupBtn.disabled = pickupStatus === "picked_up";

  detailModal.classList.remove("hidden");
}

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => detailModal.classList.add("hidden"));
});

document.querySelectorAll("[data-status]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!selectedId) return;

    const s = btn.dataset.status;

    await updateIndexedOrder(db, selectedId, {
      "payment/status": s,
      status: s === "verified" ? "payment_verified" : s === "rejected" ? "payment_issue" : "pending_review",
      reviewedAt: Date.now(),
      reviewedBy: currentAdmin?.username || "admin"
    });

    detailModal.classList.add("hidden");
    showToast("อัปเดตสถานะแล้ว");
  });
});


setReadyBtn.addEventListener("click", async () => {
  const order = orders.find((item) => item.id === selectedId);
  if (!order) return;

  if (statusOf(order) !== "verified") {
    showToast("ต้องให้ฝ่ายการเงินยืนยันการชำระเงินก่อน");
    return;
  }

  if (!pickupOpen) {
    showToast("ต้องเปิดการรับสินค้าจากหน้า Dashboard ก่อน");
    return;
  }

  if (!confirm(`ยืนยันให้ ${nameOf(order)} พร้อมรับสินค้าใช่หรือไม่?`)) return;

  await updateIndexedOrder(db, order.id, {
    "pickup/status": "ready",
    "pickup/code": order.pickup?.code || createPickupCode(order)
  });

  detailModal.classList.add("hidden");
  showToast("ตั้งสถานะพร้อมรับแล้ว");
});

markPickedUpBtn.addEventListener("click", async () => {
  const order = orders.find((item) => item.id === selectedId);
  if (!order) return;

  if ((order.pickup?.status || "locked") !== "ready") {
    showToast("รายการนี้ยังไม่อยู่ในสถานะพร้อมรับ");
    return;
  }

  if (!confirm(`ยืนยันว่าได้มอบกระเป๋า ${Number(order.order?.quantity || 0)} ใบให้ ${nameOf(order)} แล้วใช่หรือไม่?`)) return;

  await updateIndexedOrder(db, order.id, {
    "pickup/status": "picked_up",
    "pickup/pickedUpAt": Date.now(),
    "pickup/pickedUpBy": currentAdmin?.username || "admin",
    status: "completed"
  });

  detailModal.classList.add("hidden");
  showToast("บันทึกว่ารับสินค้าแล้ว");
});

lockPickupBtn.addEventListener("click", async () => {
  const order = orders.find((item) => item.id === selectedId);
  if (!order) return;

  if (!confirm(`ต้องการล็อกการรับสินค้าของ ${nameOf(order)} ใช่หรือไม่?`)) return;

  await updateIndexedOrder(db, order.id, {"pickup/status": "locked"});

  detailModal.classList.add("hidden");
  showToast("ล็อกการรับสินค้าแล้ว");
});

function statusOf(o) {
  return o.payment?.status || "pending";
}

function pickupBadge(o) {
  const s = o.pickup?.status || "locked";
  const label = {
    locked: "ยังไม่พร้อม",
    ready: "พร้อมรับ",
    picked_up: "รับแล้ว"
  }[s] || s;

  return `<span class="pickup-status ${s}">${label}</span>`;
}

function statusBadge(o) {
  const s = statusOf(o);
  const label = {
    pending: "รอตรวจสอบ",
    verified: "ยืนยันแล้ว",
    rejected: "มีปัญหา"
  }[s] || "รอตรวจสอบ";

  return `<span class="status ${s}">${label}</span>`;
}

function nameOf(o) {
  const c = o.customer || {};
  return `${c.prefix || ""}${c.firstName || ""} ${c.lastName || ""}`.trim();
}

function normalizeUsername(v) {
  return String(v || "").trim().toLowerCase().replace(/[.#$\[\]\/]/g, "");
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);

  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function money(v) {
  return `฿${Number(v || 0).toLocaleString("th-TH")}`;
}

function toDate(v) {
  return typeof v === "number" ? new Date(v) : null;
}

function key(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDate(d) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

function escapeHTML(v = "") {
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function showToast(message) {
  const container = document.getElementById("toastContainer");
  container.innerHTML = `<div class="toast">${escapeHTML(message)}</div>`;

  setTimeout(() => {
    container.innerHTML = "";
  }, 3500);
}
