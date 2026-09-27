import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const UNIT_PRICE = 139;
const MAX_QTY = 20;
const MAX_SLIP_BYTES = 900 * 1024;

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const form = document.getElementById("preorderForm");
const steps = [...document.querySelectorAll(".form-step")];
const psteps = [...document.querySelectorAll(".pstep")];
const progressBar = document.getElementById("progressBar");
const nextBtns = [...document.querySelectorAll(".next")];
const backBtns = [...document.querySelectorAll(".back")];

const studentId = document.getElementById("studentId");
const studentTypeBadge = document.getElementById("studentTypeBadge");
const buyerFields = document.getElementById("buyerFields");
const prefix = document.getElementById("prefix");
const firstName = document.getElementById("firstName");
const lastName = document.getElementById("lastName");
const level = document.getElementById("level");
const room = document.getElementById("room");

const contactButtons = [...document.querySelectorAll(".contact")];
const contactLabel = document.getElementById("contactLabel");
const contactValue = document.getElementById("contactValue");
const phone = document.getElementById("phone");

const minus = document.getElementById("minus");
const plus = document.getElementById("plus");
const quantity = document.getElementById("quantity");
const qtyText = document.getElementById("qtyText");
const totalAmount = document.getElementById("totalAmount");
const paymentAmount = document.getElementById("paymentAmount");

const uploadZone = document.getElementById("uploadZone");
const slipFile = document.getElementById("slipFile");
const slipPreview = document.getElementById("slipPreview");
const slipImg = document.getElementById("slipImg");
const slipName = document.getElementById("slipName");
const slipSize = document.getElementById("slipSize");
const removeSlip = document.getElementById("removeSlip");

const rName = document.getElementById("rName");
const rStudent = document.getElementById("rStudent");
const rClass = document.getElementById("rClass");
const rPhone = document.getElementById("rPhone");
const rContact = document.getElementById("rContact");
const rQty = document.getElementById("rQty");
const rTotal = document.getElementById("rTotal");
const rSlip = document.getElementById("rSlip");

const confirmOrder = document.getElementById("confirmOrder");
const submitBtn = document.getElementById("submitBtn");
const submitText = document.getElementById("submitText");
const loader = document.getElementById("loader");

const successModal = document.getElementById("successModal");
const successRef = document.getElementById("successRef");
const successQty = document.getElementById("successQty");
const successTotal = document.getElementById("successTotal");
const finishBtn = document.getElementById("finishBtn");

const roomLimits = {
  "ม.1": 12, "ม.2": 12, "ม.3": 12,
  "ม.4": 8,
  "ม.5": 7, "ม.6": 7,
  "ปวช.1": 2, "ปวช.2": 2, "ปวช.3": 2
};

const secondaryLevels = ["ม.1","ม.2","ม.3","ม.4","ม.5","ม.6"];
const vocationalLevels = ["ปวช.1","ปวช.2","ปวช.3"];

let currentStep = 1;
let selectedContact = "facebook";
let slipData = null;
let slipMeta = null;

studentId.addEventListener("input", () => {
  studentId.value = studentId.value.replace(/\D/g, "").slice(0, 6);
  applyStudentType();
});

phone.addEventListener("input", () => {
  phone.value = phone.value.replace(/\D/g, "").slice(0, 10);
});

function applyStudentType() {
  const id = studentId.value.trim();

  if (id.length === 5) {
    unlockBuyer("secondary");
  } else if (id.length === 6) {
    unlockBuyer("vocational");
  } else {
    lockBuyer();
  }
}

function unlockBuyer(type) {
  buyerFields.classList.remove("locked");

  [prefix, firstName, lastName, level].forEach(el => el.disabled = false);

  const values = type === "secondary" ? secondaryLevels : vocationalLevels;

  level.innerHTML = '<option value="">เลือกชั้น</option>';
  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    level.appendChild(option);
  });

  room.disabled = true;
  room.innerHTML = '<option value="">เลือกชั้นก่อน</option>';

  if (type === "secondary") {
    studentTypeBadge.className = "type-badge secondary";
    studentTypeBadge.textContent = "✓ นักเรียนมัธยม · รหัส 5 หลัก";
  } else {
    studentTypeBadge.className = "type-badge vocational";
    studentTypeBadge.textContent = "✓ นักเรียน ปวช. · รหัส 6 หลัก";
  }
}

function lockBuyer() {
  buyerFields.classList.add("locked");
  [prefix, firstName, lastName, level, room].forEach(el => el.disabled = true);

  level.innerHTML = '<option value="">กรอกรหัสนักเรียนก่อน</option>';
  room.innerHTML = '<option value="">เลือกชั้นก่อน</option>';

  studentTypeBadge.className = "type-badge neutral";
  studentTypeBadge.textContent =
    studentId.value.length === 0
      ? "รอกรอกรหัสนักเรียน"
      : "กรอกให้ครบ 5 หลัก (มัธยม) หรือ 6 หลัก (ปวช.)";
}

level.addEventListener("change", () => {
  const max = roomLimits[level.value];
  room.innerHTML = "";

  if (!max) {
    room.disabled = true;
    room.innerHTML = '<option value="">เลือกชั้นก่อน</option>';
    return;
  }

  room.disabled = false;
  room.innerHTML = '<option value="">เลือกห้อง</option>';

  for (let i = 1; i <= max; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `ห้อง ${i}`;
    room.appendChild(option);
  }
});

contactButtons.forEach(button => {
  button.addEventListener("click", () => {
    selectedContact = button.dataset.contact;

    contactButtons.forEach(btn => btn.classList.remove("selected"));
    button.classList.add("selected");

    if (selectedContact === "facebook") {
      contactLabel.textContent = "Facebook";
      contactValue.placeholder = "ชื่อ Facebook หรือ URL";
    } else {
      contactLabel.textContent = "Instagram";
      contactValue.placeholder = "@username หรือ URL Instagram";
    }
  });
});

minus.addEventListener("click", () => setQty(Number(quantity.value) - 1));
plus.addEventListener("click", () => setQty(Number(quantity.value) + 1));
quantity.addEventListener("input", () => setQty(quantity.value));

function setQty(value) {
  let qty = Math.floor(Number(value) || 1);
  qty = Math.min(MAX_QTY, Math.max(1, qty));

  quantity.value = qty;
  qtyText.textContent = qty;

  const total = qty * UNIT_PRICE;
  totalAmount.textContent = money(total);
  paymentAmount.textContent = money(total);
}

nextBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;

    if (currentStep === 4) renderReview();
    goTo(currentStep + 1);
  });
});

backBtns.forEach(btn => {
  btn.addEventListener("click", () => goTo(currentStep - 1));
});

document.querySelectorAll("[data-edit]").forEach(btn => {
  btn.addEventListener("click", () => goTo(Number(btn.dataset.edit)));
});

function validateStep(step) {
  if (step === 1) {
    const id = studentId.value.trim();

    if (!/^\d{5,6}$/.test(id)) {
      studentId.focus();
      toast("กรุณากรอกรหัสนักเรียน 5 หลักสำหรับมัธยม หรือ 6 หลักสำหรับ ปวช.", "error");
      return false;
    }

    for (const field of [prefix, firstName, lastName, level, room]) {
      if (!String(field.value || "").trim()) {
        field.focus();
        toast("กรุณากรอกข้อมูลผู้สั่งซื้อให้ครบ", "error");
        return false;
      }
    }

    if (id.length === 5 && !secondaryLevels.includes(level.value)) {
      toast("รหัสนักเรียน 5 หลักเลือกได้เฉพาะ ม.1–ม.6", "error");
      return false;
    }

    if (id.length === 6 && !vocationalLevels.includes(level.value)) {
      toast("รหัสนักเรียน 6 หลักเลือกได้เฉพาะ ปวช.1–ปวช.3", "error");
      return false;
    }

    return true;
  }

  if (step === 2) {
    if (!contactValue.value.trim()) {
      contactValue.focus();
      toast("กรุณากรอกช่องทางการติดต่อ", "error");
      return false;
    }

    if (!/^\d{9,10}$/.test(phone.value.trim())) {
      phone.focus();
      toast("กรุณากรอกเบอร์โทรศัพท์ 9–10 หลัก", "error");
      return false;
    }

    return true;
  }

  if (step === 3) {
    const qty = Number(quantity.value);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      toast(`จำนวนสินค้าต้องอยู่ระหว่าง 1–${MAX_QTY} ใบ`, "error");
      return false;
    }
    return true;
  }

  if (step === 4) {
    if (!slipData) {
      toast("กรุณาแนบหลักฐานการชำระเงิน", "error");
      return false;
    }
    return true;
  }

  return true;
}

function goTo(step) {
  if (step < 1 || step > 5) return;

  currentStep = step;

  steps.forEach(section => {
    section.classList.toggle("active", Number(section.dataset.step) === step);
  });

  psteps.forEach(item => {
    const n = Number(item.dataset.p);
    item.classList.toggle("active", n === step);
    item.classList.toggle("done", n < step);
  });

  progressBar.style.width = `${((step - 1) / 4) * 100}%`;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

uploadZone.addEventListener("click", () => slipFile.click());

uploadZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    slipFile.click();
  }
});

slipFile.addEventListener("change", async () => {
  const file = slipFile.files?.[0];
  if (!file) return;

  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
    toast("รองรับเฉพาะ JPG, PNG และ WEBP", "error");
    slipFile.value = "";
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    toast("ไฟล์ต้นฉบับต้องไม่เกิน 10 MB", "error");
    slipFile.value = "";
    return;
  }

  try {
    uploadZone.classList.add("busy");

    const result = await compressImage(file);

    if (result.bytes > MAX_SLIP_BYTES) {
      throw new Error("TOO_LARGE");
    }

    slipData = result.dataUrl;
    slipMeta = {
      originalName: file.name,
      originalSize: file.size,
      compressedSize: result.bytes,
      mimeType: result.mimeType
    };

    slipImg.src = slipData;
    slipName.textContent = file.name;
    slipSize.textContent = `${formatBytes(result.bytes)} หลังย่อ`;
    slipPreview.classList.remove("hidden");

    toast("แนบสลิปเรียบร้อยแล้ว", "success");
  } catch (error) {
    console.error(error);
    clearSlip();
    toast(
      error?.message === "TOO_LARGE"
        ? "รูปสลิปยังใหญ่เกินไป กรุณาใช้รูปที่เล็กลง"
        : "ไม่สามารถประมวลผลรูปสลิปได้",
      "error"
    );
  } finally {
    uploadZone.classList.remove("busy");
  }
});

removeSlip.addEventListener("click", clearSlip);

function clearSlip() {
  slipData = null;
  slipMeta = null;
  slipFile.value = "";
  slipImg.removeAttribute("src");
  slipPreview.classList.add("hidden");
}

async function compressImage(file) {
  const src = await fileToDataURL(file);
  const image = await loadImage(src);

  let width = image.width;
  let height = image.height;
  const max = 1400;

  if (width > max || height > max) {
    const ratio = Math.min(max / width, max / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  let quality = .82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  let bytes = dataUrlBytes(dataUrl);

  while (bytes > MAX_SLIP_BYTES && quality > .42) {
    quality -= .08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    bytes = dataUrlBytes(dataUrl);
  }

  return { dataUrl, bytes, mimeType: "image/jpeg" };
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function dataUrlBytes(url) {
  const base64 = url.split(",")[1] || "";
  return Math.ceil(base64.length * 3 / 4);
}

function renderReview() {
  const qty = Number(quantity.value);
  const total = qty * UNIT_PRICE;

  rName.textContent = `${prefix.value}${firstName.value} ${lastName.value}`;
  rStudent.textContent = studentId.value.trim();
  rClass.textContent = `${level.value} / ห้อง ${room.value}`;
  rPhone.textContent = phone.value.trim();
  rContact.textContent =
    `${selectedContact === "facebook" ? "Facebook" : "Instagram"} · ${contactValue.value.trim()}`;
  rQty.textContent = `${qty} ใบ`;
  rTotal.textContent = money(total);
  rSlip.src = slipData || "";
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  for (let step = 1; step <= 4; step++) {
    if (!validateStep(step)) {
      goTo(step);
      return;
    }
  }

  if (!confirmOrder.checked) {
    toast("กรุณายืนยันข้อมูลก่อนส่งคำสั่งซื้อ", "error");
    return;
  }

  setSubmitLoading(true);

  try {
    const orderRef = push(ref(db, "preorders"));
    const referenceCode = createReference(orderRef.key);

    const qty = Number(quantity.value);
    const total = qty * UNIT_PRICE;

    const data = {
      referenceCode,
      customer: {
        prefix: prefix.value.trim(),
        firstName: firstName.value.trim(),
        lastName: lastName.value.trim(),
        studentId: studentId.value.trim(),
        level: level.value,
        room: room.value,
        phone: phone.value.trim(),
        contact: {
          type: selectedContact,
          value: contactValue.value.trim()
        }
      },
      order: {
        unitPrice: UNIT_PRICE,
        quantity: qty,
        totalAmount: total
      },
      payment: {
        method: "qr",
        status: "pending",
        slipData,
        slipMeta
      },
      status: "pending_review",
      createdAt: serverTimestamp()
    };

    await set(orderRef, data);

    successRef.textContent = referenceCode;
    successQty.textContent = `${qty} ใบ`;
    successTotal.textContent = money(total);
    successModal.classList.remove("hidden");

    toast("บันทึกคำสั่งซื้อสำเร็จ", "success");
  } catch (error) {
    console.error(error);
    toast(
      error?.code === "PERMISSION_DENIED"
        ? "Firebase ปฏิเสธการบันทึก กรุณาตรวจสอบ Database Rules"
        : "ส่งคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่",
      "error"
    );
  } finally {
    setSubmitLoading(false);
  }
});

finishBtn.addEventListener("click", () => {
  successModal.classList.add("hidden");
  form.reset();

  selectedContact = "facebook";
  contactButtons.forEach(btn =>
    btn.classList.toggle("selected", btn.dataset.contact === "facebook")
  );

  contactLabel.textContent = "Facebook";
  contactValue.placeholder = "ชื่อ Facebook หรือ URL";

  clearSlip();
  setQty(1);
  lockBuyer();
  confirmOrder.checked = false;
  goTo(1);
});

function setSubmitLoading(loading) {
  submitBtn.disabled = loading;
  submitText.classList.toggle("hidden", loading);
  loader.classList.toggle("hidden", !loading);
}

function createReference(key = "") {
  const tail = String(key).replace(/[^A-Za-z0-9]/g, "").slice(-7).toUpperCase();
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `PO${yy}${mm}${dd}-${tail}`;
}

function money(value) {
  return `฿${Number(value).toLocaleString("th-TH")}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function toast(message, type = "") {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

lockBuyer();
setQty(1);
goTo(1);
