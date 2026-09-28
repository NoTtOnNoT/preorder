import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, push, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const UNIT_PRICE = 139;
const MAX_QUANTITY = 10;
const MAX_SLIP_BYTES = 900 * 1024;

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

const studentGate = document.getElementById("studentGate");
const mainApp = document.getElementById("mainApp");
const studentGateForm = document.getElementById("studentGateForm");
const gateStudentId = document.getElementById("gateStudentId");
const gateStatus = document.getElementById("gateStatus");
const gateContinueBtn = document.getElementById("gateContinueBtn");

const changeStudentId = document.getElementById("changeStudentId");
const changeStudentIdTop = document.getElementById("changeStudentIdTop");

const sidebarStudentId = document.getElementById("sidebarStudentId");
const sidebarStudentType = document.getElementById("sidebarStudentType");
const studentSummaryId = document.getElementById("studentSummaryId");
const studentSummaryType = document.getElementById("studentSummaryType");

const form = document.getElementById("preorderForm");
const formSteps = [...document.querySelectorAll(".form-step")];
const progressSteps = [...document.querySelectorAll(".progress-item")];
const progressBar = document.getElementById("progressBar");
const nextButtons = [...document.querySelectorAll(".next-btn")];
const backButtons = [...document.querySelectorAll(".back-btn")];

const studentId = document.getElementById("studentId");
const prefix = document.getElementById("prefix");
const firstName = document.getElementById("firstName");
const lastName = document.getElementById("lastName");
const level = document.getElementById("level");
const room = document.getElementById("room");

const contactCards = [...document.querySelectorAll(".contact-option")];
const contactLabel = document.getElementById("contactLabel");
const contactValue = document.getElementById("contactValue");
const phone = document.getElementById("phone");

const quantity = document.getElementById("quantity");
const qtyDisplay = document.getElementById("qtyDisplay");
const totalAmount = document.getElementById("totalAmount");
const paymentAmount = document.getElementById("paymentAmount");
const paymentQrImage = document.getElementById("paymentQrImage");
const qrQuantityText = document.getElementById("qrQuantityText");
const qrAmountText = document.getElementById("qrAmountText");

const uploadZone = document.getElementById("uploadZone");
const slipFile = document.getElementById("slipFile");
const slipPreview = document.getElementById("slipPreview");
const slipPreviewImage = document.getElementById("slipPreviewImage");
const slipFileName = document.getElementById("slipFileName");
const slipFileSize = document.getElementById("slipFileSize");
const removeSlip = document.getElementById("removeSlip");

const liveName = document.getElementById("liveName");
const liveClass = document.getElementById("liveClass");
const liveContact = document.getElementById("liveContact");
const livePhone = document.getElementById("livePhone");
const liveQuantity = document.getElementById("liveQuantity");
const liveTotal = document.getElementById("liveTotal");
const liveSlip = document.getElementById("liveSlip");

const mobileLiveName = document.getElementById("mobileLiveName");
const mobileLiveQty = document.getElementById("mobileLiveQty");
const mobileLiveTotal = document.getElementById("mobileLiveTotal");

const reviewName = document.getElementById("reviewName");
const reviewStudentId = document.getElementById("reviewStudentId");
const reviewClass = document.getElementById("reviewClass");
const reviewPhone = document.getElementById("reviewPhone");
const reviewContact = document.getElementById("reviewContact");
const reviewQuantity = document.getElementById("reviewQuantity");
const reviewTotal = document.getElementById("reviewTotal");
const reviewSlip = document.getElementById("reviewSlip");

const confirmOrder = document.getElementById("confirmOrder");
const submitOrderBtn = document.getElementById("submitOrderBtn");
const submitText = document.getElementById("submitText");
const submitLoader = document.getElementById("submitLoader");

const successModal = document.getElementById("successModal");
const successReference = document.getElementById("successReference");
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
let currentStudentType = null;
let slipData = null;
let slipMeta = null;

gateStudentId.addEventListener("input", () => {
  gateStudentId.value = gateStudentId.value.replace(/\D/g, "").slice(0, 6);
  updateGateStatus();
});

function updateGateStatus() {
  const id = gateStudentId.value.trim();

  gateStatus.className = "gate-status waiting";
  gateContinueBtn.disabled = true;

  if (id.length === 0) {
    gateStatus.innerHTML = '<span class="status-dot"></span><strong>รอกรอกรหัสนักเรียน</strong>';
    return;
  }

  if (id.length < 5) {
    gateStatus.innerHTML = '<span class="status-dot"></span><strong>กรอกให้ครบอย่างน้อย 5 หลัก</strong>';
    return;
  }

  if (id.length === 5) {
    gateStatus.className = "gate-status secondary";
    gateStatus.innerHTML = '<span class="status-dot"></span><strong>ตรวจพบ: นักเรียนมัธยม</strong>';
    gateContinueBtn.disabled = false;
    return;
  }

  if (id.length === 6) {
    gateStatus.className = "gate-status vocational";
    gateStatus.innerHTML = '<span class="status-dot"></span><strong>ตรวจพบ: นักเรียน ปวช.</strong>';
    gateContinueBtn.disabled = false;
  }
}

studentGateForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const id = gateStudentId.value.trim();

  if (!/^\d{5,6}$/.test(id)) {
    showToast("กรุณากรอกรหัสนักเรียน 5 หรือ 6 หลัก", "error");
    return;
  }

  enterApplication(id);
});

function enterApplication(id) {
  currentStudentType = id.length === 5 ? "secondary" : "vocational";

  studentId.value = id;
  sidebarStudentId.textContent = id;
  studentSummaryId.textContent = id;

  const label =
    currentStudentType === "secondary"
      ? "นักเรียนมัธยม"
      : "นักเรียน ปวช.";

  sidebarStudentType.textContent = label;
  studentSummaryType.textContent = label;

  populateLevelOptions();
  updateLiveSummary();

  studentGate.classList.add("hidden");
  mainApp.classList.remove("hidden");

  goToStep(1);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function populateLevelOptions() {
  const levels =
    currentStudentType === "secondary"
      ? secondaryLevels
      : vocationalLevels;

  level.innerHTML = '<option value="">เลือกชั้น</option>';

  levels.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    level.appendChild(option);
  });

  room.disabled = true;
  room.innerHTML = '<option value="">เลือกชั้นก่อน</option>';
}

function returnToGate() {
  mainApp.classList.add("hidden");
  studentGate.classList.remove("hidden");

  form.reset();

  studentId.value = "";
  currentStudentType = null;
  selectedContact = "facebook";

  contactCards.forEach((card) => {
    card.classList.toggle("selected", card.dataset.contact === "facebook");
  });

  contactLabel.innerHTML = 'Facebook <b>*</b>';
  contactValue.placeholder = "ชื่อ Facebook หรือ URL";

  clearSlip();
  setQuantity(1);
  confirmOrder.checked = false;

  level.innerHTML = '<option value="">เลือกชั้น</option>';
  room.disabled = true;
  room.innerHTML = '<option value="">เลือกชั้นก่อน</option>';

  gateStudentId.value = "";
  updateGateStatus();

  setTimeout(() => gateStudentId.focus(), 120);
}

changeStudentId.addEventListener("click", returnToGate);
changeStudentIdTop.addEventListener("click", returnToGate);

level.addEventListener("change", () => {
  const maxRooms = roomLimits[level.value];

  room.innerHTML = "";

  if (!maxRooms) {
    room.disabled = true;
    room.innerHTML = '<option value="">เลือกชั้นก่อน</option>';
    updateLiveSummary();
    return;
  }

  room.disabled = false;
  room.innerHTML = '<option value="">เลือกห้อง</option>';

  for (let i = 1; i <= maxRooms; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `ห้อง ${i}`;
    room.appendChild(option);
  }

  updateLiveSummary();
});

phone.addEventListener("input", () => {
  phone.value = phone.value.replace(/\D/g, "").slice(0, 10);
});

contactCards.forEach((card) => {
  card.addEventListener("click", () => {
    selectedContact = card.dataset.contact;

    contactCards.forEach((item) => item.classList.remove("selected"));
    card.classList.add("selected");

    if (selectedContact === "facebook") {
      contactLabel.innerHTML = 'Facebook <b>*</b>';
      contactValue.placeholder = "ชื่อ Facebook หรือ URL";
    } else {
      contactLabel.innerHTML = 'Instagram <b>*</b>';
      contactValue.placeholder = "@username หรือ URL Instagram";
    }

    updateLiveSummary();
  });
});

[prefix, firstName, lastName, level, room, contactValue, phone].forEach((field) => {
  field.addEventListener("input", updateLiveSummary);
  field.addEventListener("change", updateLiveSummary);
});

quantity.addEventListener("change", () => {
  setQuantity(quantity.value);
});

function setQuantity(value) {
  let qty = Math.floor(Number(value) || 1);
  qty = Math.max(1, Math.min(MAX_QUANTITY, qty));

  quantity.value = String(qty);
  qtyDisplay.textContent = qty;

  const total = qty * UNIT_PRICE;

  totalAmount.textContent = currency(total);
  paymentAmount.textContent = currency(total);

  paymentQrImage.src = `./qr/qr-${qty}.svg`;
  paymentQrImage.alt = `QR ชำระเงินสำหรับ ${qty} ใบ ยอด ${total} บาท`;

  qrQuantityText.textContent = `สำหรับ ${qty} ใบ`;
  qrAmountText.textContent = currency(total);

  liveQuantity.textContent = `${qty} ใบ`;
  liveTotal.textContent = currency(total);

  mobileLiveQty.textContent = `${qty} ใบ`;
  mobileLiveTotal.textContent = currency(total);
}

function updateLiveSummary() {
  const name =
    `${prefix.value || ""}${firstName.value || ""} ${lastName.value || ""}`.trim();

  liveName.textContent = name || "ยังไม่ได้กรอก";
  mobileLiveName.textContent = name || "-";

  if (level.value && room.value) {
    liveClass.textContent = `${level.value} / ห้อง ${room.value}`;
  } else if (level.value) {
    liveClass.textContent = `${level.value} / ยังไม่เลือกห้อง`;
  } else {
    liveClass.textContent = "ยังไม่ได้เลือก";
  }

  const contactText = contactValue.value.trim();

  liveContact.textContent = contactText
    ? `${selectedContact === "facebook" ? "Facebook" : "Instagram"} · ${contactText}`
    : "ยังไม่ได้กรอก";

  livePhone.textContent = phone.value.trim() || "ยังไม่ได้กรอก";
}

nextButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;

    if (currentStep === 4) {
      renderReview();
    }

    goToStep(currentStep + 1);
  });
});

backButtons.forEach((button) => {
  button.addEventListener("click", () => {
    goToStep(currentStep - 1);
  });
});

document.querySelectorAll("[data-edit-step]").forEach((button) => {
  button.addEventListener("click", () => {
    goToStep(Number(button.dataset.editStep));
  });
});

function validateStep(step) {
  if (step === 1) {
    const id = studentId.value.trim();

    if (!/^\d{5,6}$/.test(id)) {
      showToast("รหัสนักเรียนไม่ถูกต้อง กรุณาเริ่มใหม่", "error");
      return false;
    }

    for (const field of [prefix, firstName, lastName, level, room]) {
      if (!String(field.value || "").trim()) {
        field.focus();
        field.reportValidity?.();
        showToast("กรุณากรอกข้อมูลผู้สั่งซื้อให้ครบ", "error");
        return false;
      }
    }

    if (id.length === 5 && !secondaryLevels.includes(level.value)) {
      showToast("รหัส 5 หลักเลือกได้เฉพาะ ม.1–ม.6", "error");
      return false;
    }

    if (id.length === 6 && !vocationalLevels.includes(level.value)) {
      showToast("รหัส 6 หลักเลือกได้เฉพาะ ปวช.1–ปวช.3", "error");
      return false;
    }

    return true;
  }

  if (step === 2) {
    if (!contactValue.value.trim()) {
      contactValue.focus();
      showToast("กรุณากรอกช่องทางการติดต่อ", "error");
      return false;
    }

    if (!/^\d{9,10}$/.test(phone.value.trim())) {
      phone.focus();
      showToast("กรุณากรอกเบอร์โทรศัพท์ 9–10 หลัก", "error");
      return false;
    }

    return true;
  }

  if (step === 3) {
    const qty = Number(quantity.value);

    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
      showToast("จำนวนต้องอยู่ระหว่าง 1–10 ใบ", "error");
      return false;
    }

    return true;
  }

  if (step === 4) {
    if (!slipData) {
      showToast("กรุณาแนบหลักฐานการชำระเงิน", "error");
      return false;
    }

    return true;
  }

  return true;
}

function goToStep(step) {
  if (step < 1 || step > 5) return;

  currentStep = step;

  formSteps.forEach((section) => {
    section.classList.toggle(
      "active",
      Number(section.dataset.step) === step
    );
  });

  progressSteps.forEach((item) => {
    const number = Number(item.dataset.progress);

    item.classList.toggle("active", number === step);
    item.classList.toggle("done", number < step);
  });

  progressBar.style.width = `${((step - 1) / 4) * 100}%`;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

uploadZone.addEventListener("click", () => {
  slipFile.click();
});

uploadZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    slipFile.click();
  }
});

slipFile.addEventListener("change", async () => {
  const file = slipFile.files?.[0];

  if (!file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("รองรับเฉพาะ JPG, PNG และ WEBP", "error");
    slipFile.value = "";
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast("ไฟล์ต้นฉบับต้องไม่เกิน 10 MB", "error");
    slipFile.value = "";
    return;
  }

  try {
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

    slipPreviewImage.src = slipData;
    slipFileName.textContent = file.name;
    slipFileSize.textContent = `${formatBytes(result.bytes)} หลังย่อ`;
    slipPreview.classList.remove("hidden");

    liveSlip.textContent = "แนบแล้ว ✓";

    showToast("แนบสลิปเรียบร้อยแล้ว", "success");
  } catch (error) {
    console.error(error);
    clearSlip();

    showToast(
      error?.message === "TOO_LARGE"
        ? "รูปสลิปยังใหญ่เกินไป กรุณาใช้รูปที่เล็กลง"
        : "ไม่สามารถประมวลผลรูปสลิปได้",
      "error"
    );
  }
});

removeSlip.addEventListener("click", clearSlip);

function clearSlip() {
  slipData = null;
  slipMeta = null;
  slipFile.value = "";
  slipPreviewImage.removeAttribute("src");
  slipPreview.classList.add("hidden");

  if (liveSlip) {
    liveSlip.textContent = "ยังไม่แนบ";
  }
}

async function compressImage(file) {
  const source = await fileToDataURL(file);
  const image = await loadImage(source);

  let width = image.width;
  let height = image.height;

  const maxDimension = 1400;

  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(
      maxDimension / width,
      maxDimension / height
    );

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

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  let bytes = dataURLBytes(dataUrl);

  while (bytes > MAX_SLIP_BYTES && quality > 0.42) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
    bytes = dataURLBytes(dataUrl);
  }

  return {
    dataUrl,
    bytes,
    mimeType: "image/jpeg"
  };
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

function dataURLBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function renderReview() {
  const qty = Number(quantity.value);
  const total = qty * UNIT_PRICE;

  reviewName.textContent =
    `${prefix.value}${firstName.value} ${lastName.value}`;

  reviewStudentId.textContent =
    studentId.value.trim();

  reviewClass.textContent =
    `${level.value} / ห้อง ${room.value}`;

  reviewPhone.textContent =
    phone.value.trim();

  reviewContact.textContent =
    `${selectedContact === "facebook" ? "Facebook" : "Instagram"} · ${contactValue.value.trim()}`;

  reviewQuantity.textContent =
    `${qty} ใบ`;

  reviewTotal.textContent =
    currency(total);

  reviewSlip.src =
    slipData || "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  for (let step = 1; step <= 4; step++) {
    if (!validateStep(step)) {
      goToStep(step);
      return;
    }
  }

  if (!confirmOrder.checked) {
    showToast("กรุณายืนยันข้อมูลก่อนส่งคำสั่งซื้อ", "error");
    return;
  }

  setSubmitLoading(true);

  try {
    const preorderRef = push(ref(database, "preorders"));
    const referenceCode = createReference(preorderRef.key);

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
        qrNumber: qty,
        slipData,
        slipMeta
      },

      status: "pending_review",
      createdAt: serverTimestamp()
    };

    await set(preorderRef, data);

    successReference.textContent =
      referenceCode;

    successQty.textContent =
      `${qty} ใบ`;

    successTotal.textContent =
      currency(total);

    successModal.classList.remove("hidden");

    showToast("บันทึกคำสั่งซื้อสำเร็จ", "success");
  } catch (error) {
    console.error(error);

    showToast(
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
  returnToGate();
});

function setSubmitLoading(loading) {
  submitOrderBtn.disabled = loading;
  submitText.classList.toggle("hidden", loading);
  submitLoader.classList.toggle("hidden", !loading);
}

function createReference(key = "") {
  const compact =
    String(key)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-7)
      .toUpperCase();

  const now = new Date();

  const yy =
    String(now.getFullYear()).slice(-2);

  const mm =
    String(now.getMonth() + 1).padStart(2, "0");

  const dd =
    String(now.getDate()).padStart(2, "0");

  return `PO${yy}${mm}${dd}-${compact}`;
}

function currency(value) {
  return `฿${Number(value).toLocaleString("th-TH")}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function showToast(message, type = "") {
  const container = document.getElementById("toastContainer");

  const toast = document.createElement("div");

  toast.className =
    `toast ${type}`.trim();

  toast.textContent =
    message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

setQuantity(1);
updateGateStatus();
