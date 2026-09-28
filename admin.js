import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
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

let orders = [];
let selectedId = null;
let currentAdmin = null;
let unsubscribe = null;

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

    currentAdmin = { username: user, role: account.role || "admin" };

    saveSession(currentAdmin, rememberLogin.checked);

    loginScreen.classList.add("hidden");
    adminApp.classList.remove("hidden");

    subscribeOrders();
  } catch (error) {
    showToast("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
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

    currentAdmin = data;
    loginScreen.classList.add("hidden");
    adminApp.classList.remove("hidden");
    subscribeOrders();
  } catch {
    clearSession();
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
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

  unsubscribe = onValue(ref(db, "preorders"), (snap) => {
    const raw = snap.val() || {};

    orders = Object.entries(raw)
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    renderAll();
  });
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

  filtered.forEach((o) => {
    const c = o.customer || {};
    const d = toDate(o.createdAt);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><strong>${escapeHTML(nameOf(o))}</strong><br><small>${escapeHTML(c.studentId || "-")}</small></td>
      <td>${escapeHTML(c.level || "-")} / ${escapeHTML(c.room || "-")}</td>
      <td>${Number(o.order?.quantity || 0)} ใบ</td>
      <td>${money(o.order?.totalAmount || 0)}</td>
      <td>${statusBadge(o)}</td>
      <td>${d ? formatDate(d) : "-"}</td>
      <td><button class="small-btn" data-id="${o.id}">ดู</button></td>
    `;

    orderTableBody.appendChild(tr);
  });

  attachButtons();
}

searchInput.addEventListener("input", renderTable);
statusFilter.addEventListener("change", renderTable);
levelFilter.addEventListener("change", renderTable);
refreshBtn.addEventListener("click", renderAll);

function attachButtons() {
  document.querySelectorAll("[data-id]").forEach((btn) => {
    btn.onclick = () => openDetail(btn.dataset.id);
  });
}

function openDetail(id) {
  const o = orders.find((x) => x.id === id);
  if (!o) return;

  selectedId = id;

  const c = o.customer || {};

  dReference.textContent = o.referenceCode || "-";
  dStudentId.textContent = c.studentId || "-";
  dName.textContent = nameOf(o);
  dClass.textContent = `${c.level || "-"} / ห้อง ${c.room || "-"}`;
  dPhone.textContent = c.phone || "-";
  dContact.textContent = `${c.contact?.type === "instagram" ? "Instagram" : "Facebook"} · ${c.contact?.value || "-"}`;
  dQuantity.textContent = `${Number(o.order?.quantity || 0)} ใบ`;
  dTotal.textContent = money(o.order?.totalAmount || 0);
  dSlip.src = o.payment?.slipData || "";

  detailModal.classList.remove("hidden");
}

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => detailModal.classList.add("hidden"));
});

document.querySelectorAll("[data-status]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!selectedId) return;

    const s = btn.dataset.status;

    await update(ref(db, `preorders/${selectedId}`), {
      "payment/status": s,
      status: s === "verified" ? "payment_verified" : s === "rejected" ? "payment_issue" : "pending_review",
      reviewedAt: Date.now(),
      reviewedBy: currentAdmin?.username || "admin"
    });

    detailModal.classList.add("hidden");
    showToast("อัปเดตสถานะแล้ว");
  });
});

function statusOf(o) {
  return o.payment?.status || "pending";
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
