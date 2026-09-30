import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, push, set, get, query, orderByChild, equalTo, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const UNIT_PRICE=139,MAX_QTY=10,MAX_SLIP_BYTES=900*1024;
const firebaseApp=initializeApp(firebaseConfig),db=getDatabase(firebaseApp);
const $=id=>document.getElementById(id);
const screens=["landing","studentHub","studentPreorderScreen","pickupScreen","teacherHubScreen","teacherScreen","teacherPickupScreen"];
const roomLimits={"ม.1":12,"ม.2":12,"ม.3":12,"ม.4":8,"ม.5":7,"ม.6":7,"ปวช.1":2,"ปวช.2":2,"ปวช.3":2};
const secondaryLevels=["ม.1","ม.2","ม.3","ม.4","ม.5","ม.6"],vocationalLevels=["ปวช.1","ปวช.2","ปวช.3"];
let studentSession=null,studentOrders=[],studentOrder=null,studentStep=1,studentContactType="facebook",studentSlip=null,studentSlipMeta=null,studentSubmitting=false;
let teacherStep=1,teacherSlip=null,teacherSlipMeta=null,teacherOrders=[],teacherOrder=null,teacherLookupPhone="",teacherSubmitting=false;let lastFlow="";

function showScreen(id){screens.forEach(s=>$(s).classList.toggle("hidden",s!==id));window.scrollTo({top:0,behavior:"auto"});}
function money(v){return `฿${Number(v||0).toLocaleString("th-TH")}`;}
function paymentLabel(s){return ({pending:"รอตรวจสอบ",verified:"ตรวจสอบแล้ว",rejected:"มีปัญหา"})[s]||"รอตรวจสอบ";}
function orderDate(v){if(typeof v!=="number")return "-";return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(v));}
function sortOrders(list){return [...list].sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));}
function orderRef(prefix="PO"){const d=new Date();return `${prefix}${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;}
function toast(msg,type=""){const c=$("toastContainer"),e=document.createElement("div");e.className=`toast ${type}`;e.textContent=msg;c.appendChild(e);setTimeout(()=>e.remove(),3500);}
function onlyDigits(el,max){el.value=el.value.replace(/\D/g,"").slice(0,max);}
function escapeHtml(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function fillQty(el){el.innerHTML="";for(let i=1;i<=10;i++){const o=document.createElement("option");o.value=i;o.textContent=`${i} ใบ`;el.appendChild(o);}}
fillQty($("sQuantity"));fillQty($("tQuantity"));

// Student login
$("studentLoginId").addEventListener("input",()=>{onlyDigits($("studentLoginId"),6);const id=$("studentLoginId").value,st=$("studentLoginStatus");$("studentLoginBtn").disabled=true;st.className="detect waiting";if(!id){st.innerHTML="<i></i><span>รอกรอกรหัสนักเรียน</span>";return;}if(id.length<5){st.innerHTML="<i></i><span>กรอกให้ครบอย่างน้อย 5 หลัก</span>";return;}if(id.length===5){st.className="detect secondary";st.innerHTML="<i></i><span>ตรวจพบ: นักเรียนมัธยม</span>";$("studentLoginBtn").disabled=false;return;}st.className="detect vocational";st.innerHTML="<i></i><span>ตรวจพบ: นักเรียน ปวช.</span>";$("studentLoginBtn").disabled=false;});
$("studentLoginForm").addEventListener("submit",async e=>{e.preventDefault();const id=$("studentLoginId").value.trim();if(!/^\d{5,6}$/.test(id))return toast("กรุณากรอกรหัสนักเรียนให้ถูกต้อง","error");studentSession={studentId:id,type:id.length===5?"secondary":"vocational"};$("hubStudentId").textContent=id;$("hubStudentType").textContent=studentSession.type==="secondary"?"นักเรียนมัธยม":"นักเรียน ปวช.";$("studentOrderHeaderId").textContent=id;$("sideStudentId").textContent=id;populateLevels();await refreshStudentOrder();showScreen("studentHub");});
$("studentLogoutBtn").addEventListener("click",()=>{studentSession=null;studentOrders=[];studentOrder=null;$("studentLoginId").value="";showScreen("landing");});
$("backToHubFromOrder").addEventListener("click",async()=>{closeStudentDrawer();await refreshStudentOrder();showScreen("studentHub");});
$("backToHubFromPickup").addEventListener("click",()=>showScreen("studentHub"));

function populateLevels(){const levels=studentSession.type==="secondary"?secondaryLevels:vocationalLevels;$("sLevel").innerHTML='<option value="">เลือกชั้น</option>';levels.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;$("sLevel").appendChild(o);});$("sRoom").innerHTML='<option value="">เลือกชั้นก่อน</option>';$("sRoom").disabled=true;}
$("sLevel").addEventListener("change",()=>{const max=roomLimits[$("sLevel").value];if(!max){$("sRoom").disabled=true;$("sRoom").innerHTML='<option value="">เลือกชั้นก่อน</option>';updateStudentSide();return;}$("sRoom").disabled=false;$("sRoom").innerHTML='<option value="">เลือกห้อง</option>';for(let i=1;i<=max;i++){const o=document.createElement("option");o.value=i;o.textContent=`ห้อง ${i}`;$("sRoom").appendChild(o);}updateStudentSide();});
["sPrefix","sFirstName","sLastName","sLevel","sRoom","sPhone","sContactValue"].forEach(id=>{$(id).addEventListener("input",updateStudentSide);$(id).addEventListener("change",updateStudentSide);});
$("sPhone").addEventListener("input",()=>onlyDigits($("sPhone"),10));
document.querySelectorAll("[data-scontact]").forEach(btn=>btn.addEventListener("click",()=>{studentContactType=btn.dataset.scontact;document.querySelectorAll("[data-scontact]").forEach(b=>b.classList.remove("active"));btn.classList.add("active");$("sContactLabel").textContent=studentContactType==="facebook"?"Facebook":"Instagram";$("sContactValue").placeholder=studentContactType==="facebook"?"ชื่อ Facebook หรือ URL":"@username หรือ URL";updateStudentSide();}));
$("sQuantity").addEventListener("change",()=>{const q=Number($("sQuantity").value),total=q*UNIT_PRICE;$("sTotal").textContent=money(total);$("sPayAmount").textContent=money(total);$("sQr").src=`./qr/qr-${q}.svg`;$("sQrInfo").textContent=`สำหรับ ${q} ใบ`;updateStudentSide();});
function updateStudentSide(){const name=`${$("sPrefix").value||""}${$("sFirstName").value||""} ${$("sLastName").value||""}`.trim();$("sideName").textContent=name||"ยังไม่ได้กรอก";$("sideClass").textContent=$("sLevel").value?`${$("sLevel").value}${$("sRoom").value?` / ห้อง ${$("sRoom").value}`:""}`:"ยังไม่ได้เลือก";$("sidePhone").textContent=$("sPhone").value||"ยังไม่ได้กรอก";const q=Number($("sQuantity").value||1);$("sideQty").textContent=`${q} ใบ`;$("sideTotal").textContent=money(q*UNIT_PRICE);}

document.querySelectorAll(".next-student").forEach(b=>b.addEventListener("click",()=>{if(validateStudentStep(studentStep)){if(studentStep===4)renderStudentReview();goStudentStep(studentStep+1);}}));
document.querySelectorAll(".prev-student").forEach(b=>b.addEventListener("click",()=>goStudentStep(studentStep-1)));
function goStudentStep(n){if(n<1||n>5)return;studentStep=n;document.querySelectorAll("[data-ss]").forEach(x=>x.classList.toggle("active",Number(x.dataset.ss)===n));document.querySelectorAll("[data-sp]").forEach(x=>{const v=Number(x.dataset.sp);x.classList.toggle("active",v===n);x.classList.toggle("done",v<n);});window.scrollTo({top:0,behavior:"smooth"});}
function validateStudentStep(n){if(n===1){for(const id of ["sPrefix","sFirstName","sLastName","sLevel","sRoom"]){if(!$(id).value.trim()){toast("กรุณากรอกข้อมูลผู้สั่งซื้อให้ครบ","error");$(id).focus();return false;}}}if(n===2){if(!$("sContactValue").value.trim())return toast("กรุณากรอกช่องทางติดต่อ","error"),false;if(!/^\d{9,10}$/.test($("sPhone").value))return toast("กรุณากรอกเบอร์โทร 9–10 หลัก","error"),false;}if(n===4&&!studentSlip)return toast("กรุณาแนบสลิป","error"),false;return true;}
function renderStudentReview(){const q=Number($("sQuantity").value);$("studentReview").innerHTML=`<div><strong>ชื่อ:</strong> ${escapeHtml(`${$("sPrefix").value}${$("sFirstName").value} ${$("sLastName").value}`)}</div><div><strong>รหัสนักเรียน:</strong> ${escapeHtml(studentSession.studentId)}</div><div><strong>ชั้น:</strong> ${escapeHtml($("sLevel").value)} / ห้อง ${escapeHtml($("sRoom").value)}</div><div><strong>เบอร์:</strong> ${escapeHtml($("sPhone").value)}</div><div><strong>ช่องทาง:</strong> ${escapeHtml(studentContactType)} · ${escapeHtml($("sContactValue").value)}</div><div><strong>จำนวน:</strong> ${q} ใบ</div><div><strong>ยอด:</strong> ${money(q*UNIT_PRICE)}</div>`;}

$("studentPreorderCard").addEventListener("click",()=>{resetStudentOrder();showScreen("studentPreorderScreen");});

// Drawers
$("openStudentSummary").addEventListener("click",openStudentDrawer);$("closeStudentSummary").addEventListener("click",closeStudentDrawer);$("studentDrawerBackdrop").addEventListener("click",closeStudentDrawer);
function openStudentDrawer(){$("studentSummaryDrawer").classList.add("open");$("studentDrawerBackdrop").classList.remove("hidden");}
function closeStudentDrawer(){$("studentSummaryDrawer").classList.remove("open");$("studentDrawerBackdrop").classList.add("hidden");}
$("openTeacherSummary").addEventListener("click",openTeacherDrawer);$("closeTeacherSummary").addEventListener("click",closeTeacherDrawer);$("teacherDrawerBackdrop").addEventListener("click",closeTeacherDrawer);
function openTeacherDrawer(){$("teacherSummaryDrawer").classList.add("open");$("teacherDrawerBackdrop").classList.remove("hidden");}
function closeTeacherDrawer(){$("teacherSummaryDrawer").classList.remove("open");$("teacherDrawerBackdrop").classList.add("hidden");}

// Pickup detailed
$("pickupCard").addEventListener("click",()=>{
  renderStudentPickupOrders();
  if(studentOrders.length){
    studentOrder=studentOrders[0];
  }else{
    studentOrder=null;
  }
  renderPickup();
  showScreen("pickupScreen");
});
function renderPickup(){const o=studentOrder,c=o?.customer||{},status=o?.payment?.status||"none";$("pickupStudentId").textContent=studentSession?.studentId||"-";$("pickupStudentName").textContent=o?`${c.prefix||""}${c.firstName||""} ${c.lastName||""}`.trim():"ยังไม่มีข้อมูลผู้สั่งซื้อ";$("pickupStudentClass").textContent=o?`${c.level||"-"} / ห้อง ${c.room||"-"}`:"-";$("pickupStudentPhone").textContent=c.phone||"-";$("pickupOrderRef").textContent=o?.referenceCode||"-";$("pickupQty").textContent=o?`${o.order?.quantity||0} ใบ`:"-";$("pickupAmount").textContent=o?money(o.order?.totalAmount):"-";const hero=$("pickupStatusHero");$("pickupReadyPanel").classList.add("hidden");hero.className="pickup-status-hero waiting-status";
  if(!o){$("pickupHeroIcon").textContent="!";$("pickupHeroTitle").textContent="ยังไม่ได้พรีออเดอร์";$("pickupHeroText").textContent="ต้องพรีออเดอร์กระเป๋าให้เรียบร้อยก่อนจึงจะใช้ฟังก์ชันการรับกระเป๋าได้";$("pickupFinanceStatus").textContent="ยังไม่มีรายการ";return;}
  if(status==="pending"){$("pickupHeroIcon").textContent="⌛";$("pickupHeroTitle").textContent="รอฝ่ายการเงินตรวจสอบ";$("pickupHeroText").textContent="ได้รับคำสั่งซื้อและสลิปแล้ว ฝ่ายการเงินกำลังตรวจสอบยอดกับบัญชีธนาคาร";$("pickupFinanceStatus").textContent="รอตรวจสอบ";return;}
  if(status==="rejected"){hero.className="pickup-status-hero rejected-status";$("pickupHeroIcon").textContent="!";$("pickupHeroTitle").textContent="การชำระเงินมีปัญหา";$("pickupHeroText").textContent=o.payment?.financeNote||"ฝ่ายการเงินไม่สามารถยืนยันการชำระเงินได้ กรุณาติดต่อฝ่ายการเงิน";$("pickupFinanceStatus").textContent="มีปัญหา";return;}
  hero.className="pickup-status-hero verified-status";$("pickupHeroIcon").textContent="✓";$("pickupHeroTitle").textContent="ตรวจสอบการชำระเงินแล้ว";$("pickupHeroText").textContent="ฝ่ายการเงินยืนยันยอดเรียบร้อย สามารถใช้รหัสด้านล่างเพื่อรับกระเป๋าได้";$("pickupFinanceStatus").textContent="ยืนยันแล้ว";$("pickupReadyPanel").classList.remove("hidden");$("pickupCode").textContent=o.pickup?.code||"รอสร้างรหัส";
}

async function refreshStudentOrder(){
  studentOrders=[];
  studentOrder=null;
  try{
    const snap=await get(ref(db,"preorders"));
    const all=Object.entries(snap.val()||{}).map(([id,v])=>({id,...v}));
    studentOrders=sortOrders(
      all.filter(o=>o.buyerType!=="teacher" && String(o.customer?.studentId||"")===String(studentSession.studentId))
    );
    studentOrder=studentOrders[0]||null;
  }catch(e){
    console.error(e);
    toast("โหลดข้อมูลพรีออเดอร์ไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules","error");
  }
  renderStudentHub();
}
function renderStudentHub(){
  const section=$("studentOrdersSection");
  $("studentOrdersCount").textContent=`${studentOrders.length} รายการ`;

  if(!studentOrders.length){
    section.classList.add("hidden");
    $("preorderStatusBadge").className="status-pill neutral";
    $("preorderStatusBadge").textContent="ยังไม่มีคำสั่งซื้อ";
    $("pickupStatusBadge").className="status-pill locked-pill";
    $("pickupStatusBadge").textContent="ยังไม่พร้อมใช้งาน";
    $("pickupCard").classList.add("locked");
    $("pickupCardText").textContent="ต้องพรีออเดอร์และผ่านการตรวจสอบจากฝ่ายการเงินก่อน";
    return;
  }

  section.classList.remove("hidden");
  renderStudentOrdersList();

  const verifiedCount=studentOrders.filter(o=>(o.payment?.status||"pending")==="verified").length;
  const pendingCount=studentOrders.filter(o=>(o.payment?.status||"pending")==="pending").length;
  const rejectedCount=studentOrders.filter(o=>(o.payment?.status||"pending")==="rejected").length;

  $("preorderStatusBadge").className="status-pill neutral";
  $("preorderStatusBadge").textContent=`มี ${studentOrders.length} คำสั่งซื้อ · พรีออเดอร์เพิ่มได้`;

  if(verifiedCount>0){
    $("pickupCard").classList.remove("locked");
    $("pickupStatusBadge").className="status-pill verified";
    $("pickupStatusBadge").textContent=`พร้อมรับ ${verifiedCount} รายการ`;
    $("pickupCardText").textContent="แตะเพื่อดูสถานะและรหัสรับสินค้าของแต่ละคำสั่งซื้อ";
  }else{
    $("pickupCard").classList.add("locked");
    $("pickupStatusBadge").className=`status-pill ${rejectedCount>0?"rejected":"locked-pill"}`;
    $("pickupStatusBadge").textContent=pendingCount>0?`รอตรวจ ${pendingCount} รายการ`:"ยังไม่มีรายการพร้อมรับ";
    $("pickupCardText").textContent="แตะเพื่อดูสถานะของคำสั่งซื้อทั้งหมด";
  }
}

function renderStudentOrdersList(){
  $("studentOrdersList").innerHTML=studentOrders.map((o,i)=>{
    const st=o.payment?.status||"pending";
    return `<article class="order-history-card">
      <div class="order-history-top">
        <div><small>ORDER ${studentOrders.length-i}</small><strong>${escapeHtml(o.referenceCode||"-")}</strong></div>
        <span class="status-pill ${st}">${paymentLabel(st)}</span>
      </div>
      <div class="order-history-info">
        <div><span>จำนวน</span><strong>${Number(o.order?.quantity||0)} ใบ</strong></div>
        <div><span>ยอด</span><strong>${money(o.order?.totalAmount||0)}</strong></div>
        <div><span>วันที่</span><strong>${orderDate(o.createdAt)}</strong></div>
      </div>
      <button type="button" class="order-view-btn" data-student-order="${o.id}">ดูสถานะการรับ →</button>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-student-order]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      studentOrder=studentOrders.find(o=>o.id===btn.dataset.studentOrder)||studentOrders[0]||null;
      renderStudentPickupOrders();
      renderPickup();
      showScreen("pickupScreen");
    });
  });
}

function renderStudentPickupOrders(){
  const box=$("studentPickupOrderSelector");
  $("studentPickupOrderCount").textContent=`${studentOrders.length} รายการ`;
  if(studentOrders.length<=1){
    box.classList.toggle("hidden",studentOrders.length===0);
  }else{
    box.classList.remove("hidden");
  }

  $("studentPickupOrderList").innerHTML=studentOrders.map(o=>{
    const st=o.payment?.status||"pending";
    const active=studentOrder?.id===o.id?"active":"";
    return `<button type="button" class="pickup-order-item ${active}" data-pick-student="${o.id}">
      <strong>${escapeHtml(o.referenceCode||"-")}</strong>
      <span>${Number(o.order?.quantity||0)} ใบ · ${money(o.order?.totalAmount||0)}</span>
      <em class="${st}">${paymentLabel(st)}</em>
    </button>`;
  }).join("");

  document.querySelectorAll("[data-pick-student]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      studentOrder=studentOrders.find(o=>o.id===btn.dataset.pickStudent)||null;
      renderStudentPickupOrders();
      renderPickup();
    });
  });
}

function resetStudentOrder(){$("studentOrderForm").reset();studentContactType="facebook";studentSlip=null;studentSlipMeta=null;studentStep=1;populateLevels();fillQty($("sQuantity"));$("sSlipPreview").classList.add("hidden");$("sTotal").textContent="฿139";$("sPayAmount").textContent="฿139";$("sQr").src="./qr/qr-1.svg";$("sQrInfo").textContent="สำหรับ 1 ใบ";$("sideStudentId").textContent=studentSession.studentId;updateStudentSide();goStudentStep(1);}
$("studentOrderForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(studentSubmitting) return;

  for(let i=1;i<=4;i++){
    if(!validateStudentStep(i)){goStudentStep(i);return;}
  }
  if(!$("sConfirm").checked) return toast("กรุณายืนยันข้อมูลก่อนส่ง","error");

  studentSubmitting=true;
  const submitBtn=$("submitStudentOrderBtn");
  if(submitBtn){submitBtn.disabled=true;submitBtn.textContent="กำลังบันทึก...";}

  const qty=Number($("sQuantity").value),total=qty*UNIT_PRICE,r=push(ref(db,"preorders")),refCode=orderRef("ST");
  const data={
    buyerType:"student",
    referenceCode:refCode,
    customer:{
      prefix:$("sPrefix").value,
      firstName:$("sFirstName").value.trim(),
      lastName:$("sLastName").value.trim(),
      studentId:studentSession.studentId,
      level:$("sLevel").value,
      room:$("sRoom").value,
      phone:$("sPhone").value,
      contact:{type:studentContactType,value:$("sContactValue").value.trim()}
    },
    order:{unitPrice:UNIT_PRICE,quantity:qty,totalAmount:total},
    payment:{method:"qr",status:"pending",qrNumber:qty,slipData:studentSlip,slipMeta:studentSlipMeta},
    pickup:{status:"locked",code:null},
    status:"pending_review",
    createdAt:serverTimestamp()
  };

  try{
    await set(r,data);
    const localOrder={id:r.key,...data,createdAt:Date.now()};
    studentOrders=sortOrders([localOrder,...studentOrders.filter(o=>o.id!==r.key)]);
    studentOrder=localOrder;

    $("successRef").textContent=refCode;
    $("successText").textContent=`พรีออเดอร์สำเร็จ ตอนนี้มี ${studentOrders.length} คำสั่งซื้อในบัญชีนี้`;
    lastFlow="student";
    $("successModal").classList.remove("hidden");
  }catch(err){
    console.error(err);
    toast("บันทึกไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules","error");
  }finally{
    studentSubmitting=false;
    if(submitBtn){submitBtn.disabled=false;submitBtn.textContent="ยืนยันพรีออเดอร์";}
  }
});


// Teacher Hub / Pickup
$("teacherHubBack").addEventListener("click",()=>showScreen("landing"));
$("backToTeacherHubFromPickup").addEventListener("click",()=>showScreen("teacherHubScreen"));
$("teacherLookupPhone").addEventListener("input",()=>onlyDigits($("teacherLookupPhone"),10));

$("teacherLookupBtn").addEventListener("click",async()=>{
  const phone=$("teacherLookupPhone").value.trim();
  if(!/^\d{9,10}$/.test(phone)) return toast("กรุณากรอกเบอร์โทร 9–10 หลัก","error");
  teacherLookupPhone=phone;
  await refreshTeacherOrder(phone);
});

$("teacherPreorderCard").addEventListener("click",()=>{
  resetTeacher();
  if(/^\d{9,10}$/.test(teacherLookupPhone)) $("tPhone").value=teacherLookupPhone;
  updateTeacherSide();
  lastFlow="teacher";
  showScreen("teacherScreen");
});

$("teacherPickupCard").addEventListener("click",()=>{
  if(!teacherOrders.length){
    toast("กรุณาค้นหาคำสั่งซื้อด้วยเบอร์โทรก่อน","error");
    return;
  }
  teacherOrder=teacherOrders[0]||null;
  renderTeacherPickupOrders();
  renderTeacherPickup();
  showScreen("teacherPickupScreen");
});

async function loadAllPreorders(){
  const snap=await get(ref(db,"preorders"));
  return Object.entries(snap.val()||{}).map(([id,v])=>({id,...v}));
}

async function refreshTeacherOrder(phone){
  teacherOrders=[];
  teacherOrder=null;
  try{
    const all=await loadAllPreorders();
    teacherOrders=sortOrders(
      all.filter(o=>o.buyerType==="teacher" && String(o.customer?.phone||"")===String(phone))
    );
    teacherOrder=teacherOrders[0]||null;
  }catch(e){
    console.error(e);
    toast("ไม่สามารถโหลดคำสั่งซื้อได้ กรุณาตรวจสอบ Firebase Rules","error");
  }
  renderTeacherHub();
}

function renderTeacherHub(){
  const result=$("teacherLookupResult");
  const section=$("teacherOrdersSection");
  $("teacherOrdersCount").textContent=`${teacherOrders.length} รายการ`;

  if(!teacherOrders.length){
    section.classList.add("hidden");
    result.className="teacher-lookup-result neutral";
    result.textContent=teacherLookupPhone ? "ไม่พบคำสั่งซื้อจากเบอร์นี้" : "ยังไม่ได้ค้นหาคำสั่งซื้อ";
    $("teacherPreorderStatusBadge").className="status-pill neutral";
    $("teacherPreorderStatusBadge").textContent="เริ่มพรีออเดอร์";
    $("teacherPickupCard").classList.add("locked");
    $("teacherPickupStatusBadge").className="status-pill locked-pill";
    $("teacherPickupStatusBadge").textContent="ยังไม่พร้อมใช้งาน";
    $("teacherPickupCardText").textContent="กรอกเบอร์โทรและค้นหาคำสั่งซื้อก่อน";
    return;
  }

  section.classList.remove("hidden");
  renderTeacherOrdersList();

  const verifiedCount=teacherOrders.filter(o=>(o.payment?.status||"pending")==="verified").length;
  const pendingCount=teacherOrders.filter(o=>(o.payment?.status||"pending")==="pending").length;

  result.className="teacher-lookup-result verified";
  result.textContent=`พบ ${teacherOrders.length} คำสั่งซื้อจากเบอร์นี้`;

  $("teacherPreorderStatusBadge").className="status-pill neutral";
  $("teacherPreorderStatusBadge").textContent=`มี ${teacherOrders.length} คำสั่งซื้อ · สั่งเพิ่มได้`;

  if(verifiedCount>0){
    $("teacherPickupCard").classList.remove("locked");
    $("teacherPickupStatusBadge").className="status-pill verified";
    $("teacherPickupStatusBadge").textContent=`พร้อมรับ ${verifiedCount} รายการ`;
    $("teacherPickupCardText").textContent="แตะเพื่อดูสถานะและรหัสรับสินค้าของแต่ละคำสั่งซื้อ";
  }else{
    $("teacherPickupCard").classList.add("locked");
    $("teacherPickupStatusBadge").className="status-pill locked-pill";
    $("teacherPickupStatusBadge").textContent=pendingCount>0?`รอตรวจ ${pendingCount} รายการ`:"ยังไม่มีรายการพร้อมรับ";
    $("teacherPickupCardText").textContent="แตะเพื่อดูสถานะของคำสั่งซื้อทั้งหมด";
  }
}

function renderTeacherOrdersList(){
  $("teacherOrdersList").innerHTML=teacherOrders.map((o,i)=>{
    const st=o.payment?.status||"pending";
    return `<article class="order-history-card">
      <div class="order-history-top">
        <div><small>ORDER ${teacherOrders.length-i}</small><strong>${escapeHtml(o.referenceCode||"-")}</strong></div>
        <span class="status-pill ${st}">${paymentLabel(st)}</span>
      </div>
      <div class="order-history-info">
        <div><span>จำนวน</span><strong>${Number(o.order?.quantity||0)} ใบ</strong></div>
        <div><span>ยอด</span><strong>${money(o.order?.totalAmount||0)}</strong></div>
        <div><span>วันที่</span><strong>${orderDate(o.createdAt)}</strong></div>
      </div>
      <button type="button" class="order-view-btn" data-teacher-order="${o.id}">ดูสถานะการรับ →</button>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-teacher-order]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      teacherOrder=teacherOrders.find(o=>o.id===btn.dataset.teacherOrder)||teacherOrders[0]||null;
      renderTeacherPickupOrders();
      renderTeacherPickup();
      showScreen("teacherPickupScreen");
    });
  });
}

function renderTeacherPickupOrders(){
  const box=$("teacherPickupOrderSelector");
  $("teacherPickupOrderCount").textContent=`${teacherOrders.length} รายการ`;
  if(teacherOrders.length<=1){
    box.classList.toggle("hidden",teacherOrders.length===0);
  }else{
    box.classList.remove("hidden");
  }

  $("teacherPickupOrderList").innerHTML=teacherOrders.map(o=>{
    const st=o.payment?.status||"pending";
    const active=teacherOrder?.id===o.id?"active":"";
    return `<button type="button" class="pickup-order-item ${active}" data-pick-teacher="${o.id}">
      <strong>${escapeHtml(o.referenceCode||"-")}</strong>
      <span>${Number(o.order?.quantity||0)} ใบ · ${money(o.order?.totalAmount||0)}</span>
      <em class="${st}">${paymentLabel(st)}</em>
    </button>`;
  }).join("");

  document.querySelectorAll("[data-pick-teacher]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      teacherOrder=teacherOrders.find(o=>o.id===btn.dataset.pickTeacher)||null;
      renderTeacherPickupOrders();
      renderTeacherPickup();
    });
  });
}

function renderTeacherPickup(){
  const o=teacherOrder,c=o?.customer||{},status=o?.payment?.status||"none";
  $("teacherPickupName").textContent=o?`${c.prefix||""}${c.firstName||""} ${c.lastName||""}`.trim():"-";
  $("teacherPickupPhone").textContent=c.phone||"-";
  $("teacherPickupOrderRef").textContent=o?.referenceCode||"-";
  $("teacherPickupQty").textContent=o?`${o.order?.quantity||0} ใบ`:"-";
  $("teacherPickupAmount").textContent=o?money(o.order?.totalAmount):"-";

  const hero=$("teacherPickupStatusHero");
  $("teacherPickupReadyPanel").classList.add("hidden");
  hero.className="pickup-status-hero waiting-status";

  if(!o){
    $("teacherPickupHeroIcon").textContent="!";
    $("teacherPickupHeroTitle").textContent="ไม่พบคำสั่งซื้อ";
    $("teacherPickupHeroText").textContent="กรุณากลับไปค้นหาด้วยเบอร์โทรศัพท์ที่ใช้พรีออเดอร์";
    $("teacherPickupFinanceStatus").textContent="ไม่มีรายการ";
    return;
  }

  if(status==="pending"){
    $("teacherPickupHeroIcon").textContent="⌛";
    $("teacherPickupHeroTitle").textContent="รอฝ่ายการเงินตรวจสอบ";
    $("teacherPickupHeroText").textContent="ได้รับคำสั่งซื้อและสลิปแล้ว ฝ่ายการเงินกำลังตรวจสอบยอด";
    $("teacherPickupFinanceStatus").textContent="รอตรวจสอบ";
    return;
  }

  if(status==="rejected"){
    hero.className="pickup-status-hero rejected-status";
    $("teacherPickupHeroIcon").textContent="!";
    $("teacherPickupHeroTitle").textContent="การชำระเงินมีปัญหา";
    $("teacherPickupHeroText").textContent=o.payment?.financeNote||"ฝ่ายการเงินไม่สามารถยืนยันการชำระเงินได้ กรุณาติดต่อฝ่ายการเงิน";
    $("teacherPickupFinanceStatus").textContent="มีปัญหา";
    return;
  }

  hero.className="pickup-status-hero verified-status";
  $("teacherPickupHeroIcon").textContent="✓";
  $("teacherPickupHeroTitle").textContent="ตรวจสอบการชำระเงินแล้ว";
  $("teacherPickupHeroText").textContent="ฝ่ายการเงินยืนยันยอดเรียบร้อย สามารถใช้รหัสด้านล่างเพื่อรับกระเป๋าได้";
  $("teacherPickupFinanceStatus").textContent="ยืนยันแล้ว";
  $("teacherPickupReadyPanel").classList.remove("hidden");
  $("teacherPickupCode").textContent=o.pickup?.code||"รอสร้างรหัส";
}


// Teacher wizard
$("teacherStartBtn").addEventListener("click",()=>{showScreen("teacherHubScreen");});
$("backToLandingTeacher").addEventListener("click",()=>{closeTeacherDrawer();renderTeacherHub();showScreen("teacherHubScreen");});
$("tPhone").addEventListener("input",()=>{onlyDigits($("tPhone"),10);updateTeacherSide();});
["tPrefix","tFirstName","tLastName"].forEach(id=>{$(id).addEventListener("input",updateTeacherSide);$(id).addEventListener("change",updateTeacherSide);});
$("tQuantity").addEventListener("change",()=>{setTeacherQty(Number($("tQuantity").value));updateTeacherSide();});
$("teacherNext").addEventListener("click",()=>{if(!$("tPrefix").value||!$("tFirstName").value.trim()||!$("tLastName").value.trim())return toast("กรุณากรอกคำนำหน้า ชื่อ และนามสกุลให้ครบ","error");if(!/^\d{9,10}$/.test($("tPhone").value))return toast("กรุณากรอกเบอร์โทร 9–10 หลัก","error");goTeacherStep(2);});
$("teacherBack").addEventListener("click",()=>goTeacherStep(1));$("teacherPaymentNext").addEventListener("click",()=>goTeacherStep(3));$("teacherPaymentBack").addEventListener("click",()=>goTeacherStep(2));
function goTeacherStep(n){teacherStep=n;document.querySelectorAll("[data-ts]").forEach(x=>x.classList.toggle("active",Number(x.dataset.ts)===n));document.querySelectorAll("[data-tp]").forEach(x=>{const v=Number(x.dataset.tp);x.classList.toggle("active",v===n);x.classList.toggle("done",v<n);});window.scrollTo({top:0,behavior:"smooth"});}
function setTeacherQty(q){q=Math.max(1,Math.min(10,q||1));$("tQuantity").value=q;const total=q*UNIT_PRICE;$("tTotal").textContent=money(total);$("tSideTotal").textContent=money(total);$("tPayAmount").textContent=money(total);$("tQr").src=`./qr/qr-${q}.svg`;$("tQrInfo").textContent=`สำหรับ ${q} ใบ`;}
function updateTeacherSide(){const n=`${$("tPrefix").value||""}${$("tFirstName").value||""} ${$("tLastName").value||""}`.trim();$("tSideName").textContent=n||"ยังไม่ได้กรอก";$("tSidePhone").textContent=$("tPhone").value||"ยังไม่ได้กรอก";const q=Number($("tQuantity").value||1);$("tSideQty").textContent=`${q} ใบ`;$("tSideTotal").textContent=money(q*UNIT_PRICE);}
function resetTeacher(){$("teacherForm").reset();fillQty($("tQuantity"));teacherStep=1;teacherSlip=null;teacherSlipMeta=null;$("tSlipPreview").classList.add("hidden");setTeacherQty(1);updateTeacherSide();goTeacherStep(1);}
$("teacherForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(teacherSubmitting) return;

  if(!$("tPrefix").value||!$("tFirstName").value.trim()||!$("tLastName").value.trim()) return toast("กรุณากรอกข้อมูลครูให้ครบ","error");
  if(!/^\d{9,10}$/.test($("tPhone").value)) return toast("กรุณากรอกเบอร์โทร 9–10 หลัก","error");
  if(!teacherSlip) return toast("กรุณาแนบสลิป","error");
  if(!$("tConfirm").checked) return toast("กรุณายืนยันข้อมูล","error");

  teacherSubmitting=true;
  const submitBtn=$("submitTeacherOrderBtn");
  if(submitBtn){submitBtn.disabled=true;submitBtn.textContent="กำลังบันทึก...";}

  const qty=Number($("tQuantity").value),total=qty*UNIT_PRICE,r=push(ref(db,"preorders")),refCode=orderRef("TC");
  const data={
    buyerType:"teacher",
    referenceCode:refCode,
    customer:{prefix:$("tPrefix").value,firstName:$("tFirstName").value.trim(),lastName:$("tLastName").value.trim(),phone:$("tPhone").value},
    order:{unitPrice:UNIT_PRICE,quantity:qty,totalAmount:total},
    payment:{method:"qr",status:"pending",qrNumber:qty,slipData:teacherSlip,slipMeta:teacherSlipMeta},
    pickup:{status:"locked",code:null},
    status:"pending_review",
    createdAt:serverTimestamp()
  };

  try{
    await set(r,data);
    teacherLookupPhone=$("tPhone").value;
    const localOrder={id:r.key,...data,createdAt:Date.now()};
    teacherOrders=sortOrders([localOrder,...teacherOrders.filter(o=>o.id!==r.key)]);
    teacherOrder=localOrder;
    lastFlow="teacher";

    $("successRef").textContent=refCode;
    $("successText").textContent=`พรีออเดอร์สำเร็จ ตอนนี้พบ ${teacherOrders.length} คำสั่งซื้อจากเบอร์นี้`;
    $("successModal").classList.remove("hidden");
  }catch(err){
    console.error(err);
    toast("บันทึกไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules","error");
  }finally{
    teacherSubmitting=false;
    if(submitBtn){submitBtn.disabled=false;submitBtn.textContent="ยืนยันพรีออเดอร์สำหรับครู";}
  }
});

// Slip handlers
setupSlip("s",v=>{studentSlip=v.data;studentSlipMeta=v.meta;});setupSlip("t",v=>{teacherSlip=v.data;teacherSlipMeta=v.meta;});
function setupSlip(prefix,onSet){const upload=$(prefix+"Upload"),file=$(prefix+"SlipFile"),preview=$(prefix+"SlipPreview"),img=$(prefix+"SlipImg"),name=$(prefix+"SlipName"),size=$(prefix+"SlipSize"),remove=$(prefix+"RemoveSlip");upload.addEventListener("click",()=>file.click());file.addEventListener("change",async()=>{const f=file.files?.[0];if(!f)return;if(!["image/jpeg","image/png","image/webp"].includes(f.type))return toast("รองรับเฉพาะ JPG, PNG, WEBP","error");try{const result=await compressImage(f);onSet({data:result.dataUrl,meta:{originalName:f.name,originalSize:f.size,compressedSize:result.bytes,mimeType:result.mimeType}});img.src=result.dataUrl;name.textContent=f.name;size.textContent=formatBytes(result.bytes);preview.classList.remove("hidden");toast("แนบสลิปแล้ว","success");}catch(err){console.error(err);toast("ไม่สามารถประมวลผลรูปได้","error");}});remove.addEventListener("click",()=>{file.value="";preview.classList.add("hidden");onSet({data:null,meta:null});});}
async function compressImage(file){const src=await readData(file),image=await loadImg(src);let w=image.width,h=image.height,max=1400;if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r);}const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d",{alpha:false});x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(image,0,0,w,h);let quality=.82,data=c.toDataURL("image/jpeg",quality),bytes=dataBytes(data);while(bytes>MAX_SLIP_BYTES&&quality>.42){quality-=.08;data=c.toDataURL("image/jpeg",quality);bytes=dataBytes(data);}return{dataUrl:data,bytes,mimeType:"image/jpeg"};}
function readData(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});}function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});}function dataBytes(d){return Math.ceil(((d.split(",")[1]||"").length*3)/4);}function formatBytes(b){return b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(2)} MB`;}

$("successClose").addEventListener("click",async()=>{
  $("successModal").classList.add("hidden");
  if(lastFlow==="teacher"){
    if(teacherLookupPhone) await refreshTeacherOrder(teacherLookupPhone);
    showScreen("teacherHubScreen");
    return;
  }
  if(studentSession){
    await refreshStudentOrder();
    showScreen("studentHub");
  }else{
    showScreen("landing");
  }
});
setTeacherQty(1);
