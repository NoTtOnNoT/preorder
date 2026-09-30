import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, push, set, get, query, orderByChild, equalTo, serverTimestamp, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const UNIT_PRICE=129,MAX_QTY=10,MAX_SLIP_BYTES=900*1024;
const firebaseApp=initializeApp(firebaseConfig),db=getDatabase(firebaseApp);
const $=id=>document.getElementById(id);
const screens=["landing","teacherLoginScreen","studentHub","studentPreorderScreen","pickupScreen","teacherHubScreen","teacherScreen","teacherPickupScreen"];
const roomLimits={"ม.1":12,"ม.2":12,"ม.3":12,"ม.4":8,"ม.5":7,"ม.6":7,"ปวช.1":2,"ปวช.2":2,"ปวช.3":2};
const secondaryLevels=["ม.1","ม.2","ม.3","ม.4","ม.5","ม.6"],vocationalLevels=["ปวช.1","ปวช.2","ปวช.3"];
let studentSession=null,studentOrders=[],studentOrder=null,studentStep=1,studentContactType="facebook",studentSlip=null,studentSlipMeta=null,studentSubmitting=false;
let teacherStep=1,teacherSlip=null,teacherSlipMeta=null,teacherOrders=[],teacherOrder=null,teacherLookupPhone="",teacherSubmitting=false;let lastFlow="";let pickupOpen=false;
let currentScreen="landing";
let studentOrdersUnsub=null,teacherOrdersUnsub=null,pickupConfigUnsub=null;
const STUDENT_SESSION_KEY="sckc_student_session_v1";
const LAST_PORTAL_KEY="sckc_last_portal_v1";
const TEACHER_SESSION_KEY="sckc_teacher_session_v1";
const SESSION_MS=7*24*60*60*1000;

function showScreen(id){currentScreen=id;screens.forEach(s=>$(s).classList.toggle("hidden",s!==id));window.scrollTo({top:0,behavior:"auto"});}
function money(v){return `฿${Number(v||0).toLocaleString("th-TH")}`;}
function setText(id,value){const el=$(id);if(el)el.textContent=value;}
function paymentLabel(s){return ({pending:"รอตรวจสอบ",verified:"ตรวจสอบแล้ว",rejected:"มีปัญหา",picked_up:"รับสินค้าแล้ว"})[s]||"รอตรวจสอบ";}
function pickupLabel(s){return ({locked:"ยังไม่พร้อม",ready:"พร้อมรับ",picked_up:"รับสินค้าแล้ว"})[s]||"ยังไม่พร้อม";}
function orderDate(v){if(typeof v!=="number")return "-";return new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(v));}
function sortOrders(list){return [...list].sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));}
function orderRef(prefix="PO"){const d=new Date();return `${prefix}${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;}
function toast(msg,type=""){const c=$("toastContainer"),e=document.createElement("div");e.className=`toast ${type}`;e.textContent=msg;c.appendChild(e);setTimeout(()=>e.remove(),3500);}
function onlyDigits(el,max){el.value=el.value.replace(/\D/g,"").slice(0,max);}
function setLoading(show,text="กำลังโหลดข้อมูล..."){const el=$("loadingOverlay");if(!el)return;$("loadingText").textContent=text;el.classList.toggle("hidden",!show);}
function updateNetworkBanner(){
  const offline=!navigator.onLine;
  $("networkBanner")?.classList.toggle("hidden",!offline);
}

async function refreshPickupAvailability(){
  try{
    const snap=await get(ref(db,"systemConfig/pickupOpen"));
    pickupOpen=snap.exists() && snap.val()===true;
  }catch(error){
    console.warn("Unable to load pickup availability",error);
    pickupOpen=false;
  }
  return pickupOpen;
}

window.addEventListener("online",()=>{
  updateNetworkBanner();
  toast("กลับมาออนไลน์แล้ว","success");
});

window.addEventListener("offline",()=>{
  updateNetworkBanner();
  toast("ไม่มีการเชื่อมต่ออินเทอร์เน็ต","error");
});

updateNetworkBanner();

function localDateKey(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

async function trackSiteOpen(){
  // นับทุกครั้งที่เปิด/รีเฟรชหน้า index.html เป็น 1 page view
  // ใช้ transaction เพื่อป้องกันยอดชนกันเมื่อมีหลายคนเปิดพร้อมกัน
  const day=localDateKey();

  try{
    await Promise.all([
      runTransaction(ref(db,"siteStats/pageViews"),current=>(Number(current)||0)+1),
      runTransaction(ref(db,`siteStats/days/${day}/pageViews`),current=>(Number(current)||0)+1),
      set(ref(db,"siteStats/lastOpenedAt"),Date.now())
    ]);
  }catch(error){
    console.warn("Unable to update site stats",error);
  }
}

function saveStudentSession(){
  if(!studentSession)return;
  localStorage.setItem(STUDENT_SESSION_KEY,JSON.stringify({...studentSession,expiresAt:Date.now()+SESSION_MS}));
}

function clearStudentSession(){
  localStorage.removeItem(STUDENT_SESSION_KEY);
  if(localStorage.getItem(LAST_PORTAL_KEY)==="student")localStorage.removeItem(LAST_PORTAL_KEY);
  if(studentOrdersUnsub){studentOrdersUnsub();studentOrdersUnsub=null;}
}

function saveTeacherSession(phone){
  if(!phone)return;
  localStorage.setItem(TEACHER_SESSION_KEY,JSON.stringify({phone,expiresAt:Date.now()+SESSION_MS}));
  localStorage.setItem(LAST_PORTAL_KEY,"teacher");
}

function clearTeacherSession(){
  localStorage.removeItem(TEACHER_SESSION_KEY);
  if(localStorage.getItem(LAST_PORTAL_KEY)==="teacher")localStorage.removeItem(LAST_PORTAL_KEY);
  if(teacherOrdersUnsub){teacherOrdersUnsub();teacherOrdersUnsub=null;}
  teacherLookupPhone="";
  teacherOrders=[];
  teacherOrder=null;
}

function readValidSession(key){
  try{
    const data=JSON.parse(localStorage.getItem(key)||"null");
    if(!data||!data.expiresAt||Date.now()>data.expiresAt){
      localStorage.removeItem(key);
      return null;
    }
    return data;
  }catch{
    localStorage.removeItem(key);
    return null;
  }
}

function subscribePickupConfigRealtime(){
  if(pickupConfigUnsub)pickupConfigUnsub();
  pickupConfigUnsub=onValue(ref(db,"systemConfig/pickupOpen"),snap=>{
    pickupOpen=snap.exists()&&snap.val()===true;

    if(studentSession){
      renderStudentHub();
      if(currentScreen==="pickupScreen"&&studentOrder)renderPickup();
    }

    if(teacherLookupPhone){
      renderTeacherHub();
      if(currentScreen==="teacherPickupScreen"&&teacherOrder)renderTeacherPickup();
    }
  },err=>console.warn("pickup realtime",err));
}

function subscribeStudentRealtime(){
  if(studentOrdersUnsub)studentOrdersUnsub();
  if(!studentSession)return;

  const qy=query(
    ref(db,"preorders"),
    orderByChild("customer/studentId"),
    equalTo(studentSession.studentId)
  );

  studentOrdersUnsub=onValue(qy,snap=>{
    studentOrders=sortOrders(
      Object.entries(snap.val()||{})
        .map(([id,v])=>({id,...v}))
        .filter(o=>o.buyerType!=="teacher")
    );

    const selectedId=studentOrder?.id;
    studentOrder=studentOrders.find(o=>o.id===selectedId)||studentOrders[0]||null;

    renderStudentHub();
    if(currentScreen==="pickupScreen"){
      renderStudentOrdersList();
      renderStudentPickupOrders();
      renderPickup();
    }
  },err=>console.warn("student realtime",err));
}

function subscribeTeacherRealtime(phone){
  if(teacherOrdersUnsub)teacherOrdersUnsub();
  if(!phone)return;

  const qy=query(
    ref(db,"preorders"),
    orderByChild("customer/phone"),
    equalTo(phone)
  );

  teacherOrdersUnsub=onValue(qy,snap=>{
    teacherOrders=sortOrders(
      Object.entries(snap.val()||{})
        .map(([id,v])=>({id,...v}))
        .filter(o=>o.buyerType==="teacher")
    );

    const selectedId=teacherOrder?.id;
    teacherOrder=teacherOrders.find(o=>o.id===selectedId)||teacherOrders[0]||null;

    renderTeacherHub();
    if(currentScreen==="teacherPickupScreen"){
      renderTeacherOrdersList();
      renderTeacherPickupOrders();
      renderTeacherPickup();
    }
  },err=>console.warn("teacher realtime",err));
}

async function restorePersistentLogin(){
  subscribePickupConfigRealtime();

  const lastPortal=localStorage.getItem(LAST_PORTAL_KEY);
  const teacherSaved=readValidSession(TEACHER_SESSION_KEY);
  const studentSaved=readValidSession(STUDENT_SESSION_KEY);

  if(teacherSaved?.phone){
    teacherLookupPhone=teacherSaved.phone;
    subscribeTeacherRealtime(teacherSaved.phone);
  }

  if(lastPortal==="teacher" && teacherSaved?.phone){
    setLoading(true,"กำลังเข้าสู่ระบบสำหรับครู...");
    try{
      await refreshPickupAvailability();
      await refreshTeacherOrder(teacherSaved.phone);
      showScreen("teacherHubScreen");
    }finally{
      setLoading(false);
    }
    return;
  }

  if(studentSaved?.studentId){
    studentSession={
      studentId:studentSaved.studentId,
      type:studentSaved.type||((studentSaved.studentId.length===5)?"secondary":"vocational")
    };

    $("studentLoginId").value=studentSession.studentId;
    $("studentHubGreeting").textContent=`สวัสดี ${studentSession.studentId}`;
    $("studentOrderHeaderId").textContent=studentSession.studentId;
    $("sideStudentId").textContent=studentSession.studentId;
    populateLevels();

    setLoading(true,"กำลังเข้าสู่ระบบนักเรียน...");
    try{
      await refreshPickupAvailability();
      await refreshStudentOrder();
      subscribeStudentRealtime();
      showScreen("studentHub");
    }finally{
      setLoading(false);
    }
  }
}

function escapeHtml(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function fillQty(el){el.innerHTML="";for(let i=1;i<=10;i++){const o=document.createElement("option");o.value=i;o.textContent=`${i} ใบ`;el.appendChild(o);}}
fillQty($("sQuantity"));fillQty($("tQuantity"));

function setPaymentQr(imgId, quantity){
  const q=Math.max(1,Math.min(10,Number(quantity)||1));
  const img=$(imgId);

  if(!img) return;

  img.onerror=()=>{
    img.onerror=null;
    img.src="./payment-qr.svg";
  };

  img.src=`./qr/qr-${q}.png`;
}

// Student login
$("studentLoginId").addEventListener("input",()=>{onlyDigits($("studentLoginId"),6);const id=$("studentLoginId").value,st=$("studentLoginStatus");$("studentLoginBtn").disabled=true;st.className="detect waiting";if(!id){st.innerHTML="<i></i><span>รอกรอกรหัสนักเรียน</span>";return;}if(id.length<5){st.innerHTML="<i></i><span>กรอกให้ครบอย่างน้อย 5 หลัก</span>";return;}if(id.length===5){st.className="detect secondary";st.innerHTML="<i></i><span>ตรวจพบ: นักเรียนมัธยม</span>";$("studentLoginBtn").disabled=false;return;}st.className="detect vocational";st.innerHTML="<i></i><span>ตรวจพบ: นักเรียน ปวช.</span>";$("studentLoginBtn").disabled=false;});
$("studentLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();

  const id=$("studentLoginId").value.trim();
  if(!/^\d{5,6}$/.test(id)){
    toast("กรุณากรอกรหัสนักเรียนให้ถูกต้อง","error");
    return;
  }

  studentSession={
    studentId:id,
    type:id.length===5?"secondary":"vocational"
  };

  saveStudentSession();
  localStorage.setItem(LAST_PORTAL_KEY,"student");

  $("studentHubGreeting").textContent=`สวัสดี ${id}`;
  $("hubStudentType").textContent=studentSession.type==="secondary"
    ? `นักเรียนมัธยม · รหัส ${id}`
    : `นักเรียน ปวช. · รหัส ${id}`;
  $("studentOrderHeaderId").textContent=id;
  $("sideStudentId").textContent=id;
  populateLevels();

  setLoading(true,"กำลังโหลดคำสั่งซื้อของคุณ...");

  try{
    await refreshPickupAvailability();
    await refreshStudentOrder();
    subscribeStudentRealtime();
    subscribePickupConfigRealtime();
    showScreen("studentHub");
  }catch(error){
    console.error(error);
    toast("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่","error");
  }finally{
    setLoading(false);
  }
});
$("studentLogoutBtn").addEventListener("click",()=>{clearStudentSession();studentSession=null;studentOrders=[];studentOrder=null;$("studentLoginId").value="";showScreen("landing");});
$("backToHubFromOrder").addEventListener("click",async()=>{closeStudentDrawer();await refreshPickupAvailability();await refreshStudentOrder();showScreen("studentHub");});
$("backToHubFromPickup").addEventListener("click",()=>showScreen("studentHub"));

function populateLevels(){const levels=studentSession.type==="secondary"?secondaryLevels:vocationalLevels;$("sLevel").innerHTML='<option value="">เลือกชั้น</option>';levels.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;$("sLevel").appendChild(o);});$("sRoom").innerHTML='<option value="">เลือกชั้นก่อน</option>';$("sRoom").disabled=true;}
$("sLevel").addEventListener("change",()=>{const max=roomLimits[$("sLevel").value];if(!max){$("sRoom").disabled=true;$("sRoom").innerHTML='<option value="">เลือกชั้นก่อน</option>';updateStudentSide();return;}$("sRoom").disabled=false;$("sRoom").innerHTML='<option value="">เลือกห้อง</option>';for(let i=1;i<=max;i++){const o=document.createElement("option");o.value=i;o.textContent=`ห้อง ${i}`;$("sRoom").appendChild(o);}updateStudentSide();});
["sPrefix","sFirstName","sLastName","sLevel","sRoom","sPhone","sContactValue"].forEach(id=>{$(id).addEventListener("input",updateStudentSide);$(id).addEventListener("change",updateStudentSide);});
$("sPhone").addEventListener("input",()=>onlyDigits($("sPhone"),10));
document.querySelectorAll("[data-scontact]").forEach(btn=>btn.addEventListener("click",()=>{studentContactType=btn.dataset.scontact;document.querySelectorAll("[data-scontact]").forEach(b=>b.classList.remove("active"));btn.classList.add("active");$("sContactLabel").textContent=studentContactType==="facebook"?"Facebook":"Instagram";$("sContactValue").placeholder=studentContactType==="facebook"?"ชื่อ Facebook หรือ URL":"@username หรือ URL";updateStudentSide();}));
$("sQuantity").addEventListener("change",()=>{const q=Number($("sQuantity").value),total=q*UNIT_PRICE;$("sTotal").textContent=money(total);$("sPayAmount").textContent=money(total);setPaymentQr("sQr",q);$("sQrInfo").textContent=`สำหรับ ${q} ใบ`;updateStudentSide();});
function updateStudentSide(){const name=`${$("sPrefix").value||""}${$("sFirstName").value||""} ${$("sLastName").value||""}`.trim();$("sideName").textContent=name||"ยังไม่ได้กรอก";$("sideClass").textContent=$("sLevel").value?`${$("sLevel").value}${$("sRoom").value?` / ห้อง ${$("sRoom").value}`:""}`:"ยังไม่ได้เลือก";$("sidePhone").textContent=$("sPhone").value||"ยังไม่ได้กรอก";const q=Number($("sQuantity").value||1);$("sideQty").textContent=`${q} ใบ`;$("sideTotal").textContent=money(q*UNIT_PRICE);}

document.querySelectorAll(".next-student").forEach(b=>b.addEventListener("click",()=>{if(validateStudentStep(studentStep)){if(studentStep===4)renderStudentReview();goStudentStep(studentStep+1);}}));
document.querySelectorAll(".prev-student").forEach(b=>b.addEventListener("click",()=>goStudentStep(studentStep-1)));
function goStudentStep(n){if(n<1||n>5)return;studentStep=n;const labels=["ข้อมูลผู้สั่งซื้อ","ข้อมูลการติดต่อ","เลือกจำนวน","ชำระเงิน","ตรวจสอบและยืนยัน"];if($("studentProgressText"))$("studentProgressText").textContent=`ขั้นตอน ${n} จาก 5 · ${labels[n-1]}`;document.querySelectorAll("[data-ss]").forEach(x=>x.classList.toggle("active",Number(x.dataset.ss)===n));document.querySelectorAll("[data-sp]").forEach(x=>{const v=Number(x.dataset.sp);x.classList.toggle("active",v===n);x.classList.toggle("done",v<n);});window.scrollTo({top:0,behavior:"smooth"});}
function validateStudentStep(n){if(n===1){for(const id of ["sPrefix","sFirstName","sLastName","sLevel","sRoom"]){if(!$(id).value.trim()){toast("กรุณากรอกข้อมูลผู้สั่งซื้อให้ครบ","error");$(id).focus();return false;}}}if(n===2){if(!$("sContactValue").value.trim())return toast("กรุณากรอกช่องทางติดต่อ","error"),false;if(!/^\d{9,10}$/.test($("sPhone").value))return toast("กรุณากรอกเบอร์โทร 9–10 หลัก","error"),false;}if(n===4&&!studentSlip)return toast("กรุณาแนบสลิป","error"),false;return true;}
function renderStudentReview(){const q=Number($("sQuantity").value);$("studentReview").innerHTML=`<div><strong>ชื่อ:</strong> ${escapeHtml(`${$("sPrefix").value}${$("sFirstName").value} ${$("sLastName").value}`)}</div><div><strong>รหัสนักเรียน:</strong> ${escapeHtml(studentSession.studentId)}</div><div><strong>ชั้น:</strong> ${escapeHtml($("sLevel").value)} / ห้อง ${escapeHtml($("sRoom").value)}</div><div><strong>เบอร์:</strong> ${escapeHtml($("sPhone").value)}</div><div><strong>ช่องทาง:</strong> ${escapeHtml(studentContactType)} · ${escapeHtml($("sContactValue").value)}</div><div><strong>จำนวน:</strong> ${q} ใบ</div><div><strong>ยอด:</strong> ${money(q*UNIT_PRICE)}</div>`;}

$("studentPreorderCard").addEventListener("click",()=>{
  const pending=studentOrders.filter(o=>(o.payment?.status||"pending")==="pending");
  if(pending.length){
    $("duplicateOrderText").textContent=`คุณมี ${pending.length} คำสั่งซื้อที่ยังรอฝ่ายการเงินตรวจสอบอยู่ ต้องการสร้างคำสั่งซื้อใหม่อีกหรือไม่?`;
    $("duplicateOrderModal").dataset.flow="student";
    $("duplicateOrderModal").classList.remove("hidden");
    return;
  }
  resetStudentOrder();restoreStudentDraft();showScreen("studentPreorderScreen");
});

// Drawers
$("openStudentSummary").addEventListener("click",openStudentDrawer);$("closeStudentSummary").addEventListener("click",closeStudentDrawer);$("studentDrawerBackdrop").addEventListener("click",closeStudentDrawer);
function openStudentDrawer(){$("studentSummaryDrawer").classList.add("open");$("studentDrawerBackdrop").classList.remove("hidden");}
function closeStudentDrawer(){$("studentSummaryDrawer").classList.remove("open");$("studentDrawerBackdrop").classList.add("hidden");}
$("openTeacherSummary").addEventListener("click",openTeacherDrawer);$("closeTeacherSummary").addEventListener("click",closeTeacherDrawer);$("teacherDrawerBackdrop").addEventListener("click",closeTeacherDrawer);
function openTeacherDrawer(){$("teacherSummaryDrawer").classList.add("open");$("teacherDrawerBackdrop").classList.remove("hidden");}
function closeTeacherDrawer(){$("teacherSummaryDrawer").classList.remove("open");$("teacherDrawerBackdrop").classList.add("hidden");}

// Pickup detailed
$("pickupCard").addEventListener("click",async()=>{
  await refreshPickupAvailability();
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
  if((o.pickup?.status||"")==="picked_up"){hero.className="pickup-status-hero verified-status";$("pickupHeroIcon").textContent="✓";$("pickupHeroTitle").textContent="รับสินค้าเรียบร้อยแล้ว";$("pickupHeroText").textContent=`รับกระเป๋าแล้ว${o.pickup?.pickedUpAt?` เมื่อ ${orderDate(o.pickup.pickedUpAt)}`:""}`;$("pickupFinanceStatus").textContent="เสร็จสิ้น";return;}
  if(!pickupOpen || (o.pickup?.status||"locked")!=="ready"){
    $("pickupHeroIcon").textContent="⌛";
    $("pickupHeroTitle").textContent="ยังไม่เปิดรับสินค้า";
    $("pickupHeroText").textContent="ฝ่ายการเงินยืนยันการชำระเงินแล้ว แต่สินค้ายังอยู่ในช่วงพรีออเดอร์ กรุณารอแอดมินประกาศเปิดรับสินค้า";
    $("pickupFinanceStatus").textContent="ชำระเงินผ่านแล้ว";
    return;
  }
  hero.className="pickup-status-hero verified-status";$("pickupHeroIcon").textContent="✓";$("pickupHeroTitle").textContent="ตรวจสอบการชำระเงินแล้ว";$("pickupHeroText").textContent="ฝ่ายการเงินยืนยันยอดเรียบร้อย สามารถใช้รหัสด้านล่างเพื่อรับกระเป๋าได้";$("pickupFinanceStatus").textContent="ยืนยันแล้ว";$("pickupReadyPanel").classList.remove("hidden");$("pickupCode").textContent=o.pickup?.code||"รอสร้างรหัส";
}

async function refreshStudentOrder(){
  studentOrders=[];
  studentOrder=null;

  try{
    // โหลดเฉพาะออเดอร์ของรหัสนักเรียนนี้ก่อน เพื่อลดการดาวน์โหลดข้อมูลทั้งหมด
    const qy=query(
      ref(db,"preorders"),
      orderByChild("customer/studentId"),
      equalTo(studentSession.studentId)
    );
    const snap=await get(qy);

    if(snap.exists()){
      studentOrders=sortOrders(
        Object.entries(snap.val())
          .map(([id,v])=>({id,...v}))
          .filter(o=>o.buyerType!=="teacher")
      );
    }

    studentOrder=studentOrders[0]||null;
  }catch(e){
    console.warn("Indexed student query failed, using fallback.",e);

    // fallback สำหรับกรณี Rules/Index ยังไม่ได้อัปเดต
    try{
      const snap=await get(ref(db,"preorders"));
      const all=Object.entries(snap.val()||{}).map(([id,v])=>({id,...v}));

      studentOrders=sortOrders(
        all.filter(o=>
          o.buyerType!=="teacher" &&
          String(o.customer?.studentId||"")===String(studentSession.studentId)
        )
      );
      studentOrder=studentOrders[0]||null;
    }catch(fallbackError){
      console.error(fallbackError);
      toast("โหลดข้อมูลพรีออเดอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตหรือ Firebase Rules","error");
    }
  }

  renderStudentHub();
}
function renderStudentHub(){
  const section=$("studentOrdersSection");
  const latestCustomer=studentOrders[0]?.customer||null;
  const studentName=latestCustomer
    ? `${latestCustomer.prefix||""}${latestCustomer.firstName||""} ${latestCustomer.lastName||""}`.trim()
    : "";

  if($("studentHubGreeting")){
    $("studentHubGreeting").textContent=studentName
      ? `สวัสดี ${studentName}`
      : `สวัสดี ${studentSession?.studentId||""}`;
  }

  if($("hubStudentType")){
    const typeText=studentSession?.type==="secondary"?"นักเรียนมัธยม":"นักเรียน ปวช.";
    $("hubStudentType").textContent=studentName
      ? `${typeText} · รหัส ${studentSession?.studentId||"-"}`
      : typeText;
  }
  $("studentOrdersCount").textContent=`${studentOrders.length} รายการ`;
  const statPending=studentOrders.filter(o=>(o.payment?.status||"pending")==="pending").length;
  const statReady=pickupOpen?studentOrders.filter(o=>(o.pickup?.status||"locked")==="ready").length:0;
  $("studentStatTotal").textContent=studentOrders.length;
  $("studentStatPending").textContent=statPending;
  $("studentStatReady").textContent=statReady;

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

  if(verifiedCount>0 && pickupOpen){
    const readyCount=studentOrders.filter(o=>(o.pickup?.status||"locked")==="ready").length;
    $("pickupCard").classList.remove("locked");
    $("pickupStatusBadge").className="status-pill verified";
    $("pickupStatusBadge").textContent=readyCount>0?`พร้อมรับ ${readyCount} รายการ`:"รอแอดมินอัปเดต";
    $("pickupCardText").textContent="แตะเพื่อดูสถานะและรหัสรับสินค้าของแต่ละคำสั่งซื้อ";
  }else if(verifiedCount>0 && !pickupOpen){
    $("pickupCard").classList.remove("locked");
    $("pickupStatusBadge").className="status-pill pending";
    $("pickupStatusBadge").textContent="ชำระเงินผ่านแล้ว · รอเปิดรับ";
    $("pickupCardText").textContent="สินค้ายังอยู่ในช่วงพรีออเดอร์ รอแอดมินประกาศเปิดรับสินค้า";
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
      <div class="order-card-actions"><button type="button" class="order-view-btn" data-detail-student="${o.id}">รายละเอียด</button><button type="button" class="order-view-btn" data-student-order="${o.id}">สถานะการรับ →</button></div>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-detail-student]").forEach(btn=>btn.addEventListener("click",()=>openOrderDetail(studentOrders.find(o=>o.id===btn.dataset.detailStudent))));
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

function resetStudentOrder(){$("studentOrderForm").reset();studentContactType="facebook";studentSlip=null;studentSlipMeta=null;studentStep=1;populateLevels();fillQty($("sQuantity"));$("sSlipPreview").classList.add("hidden");$("sTotal").textContent="฿129";$("sPayAmount").textContent="฿129";$("sQr").src="./qr/qr-1.png";$("sQrInfo").textContent="สำหรับ 1 ใบ";$("sideStudentId").textContent=studentSession.studentId;updateStudentSide();goStudentStep(1);}
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
    renderStudentHub();

    localStorage.removeItem(STUDENT_DRAFT_KEY);
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
$("backToTeacherHubFromPickup").addEventListener("click",()=>showScreen("teacherHubScreen"));



$("teacherPreorderCard").addEventListener("click",()=>{
  const pending=teacherOrders.filter(o=>(o.payment?.status||"pending")==="pending");
  if(pending.length){
    $("duplicateOrderText").textContent=`พบ ${pending.length} คำสั่งซื้อที่ยังรอฝ่ายการเงินตรวจสอบ ต้องการพรีออเดอร์เพิ่มอีกหรือไม่?`;
    $("duplicateOrderModal").dataset.flow="teacher";
    $("duplicateOrderModal").classList.remove("hidden");
    return;
  }
  startTeacherOrder();
});
function startTeacherOrder(){
  if(!teacherLookupPhone){
    showScreen("teacherLoginScreen");
    return;
  }

  resetTeacher();
  restoreTeacherDraft();

  // ถ้ามีข้อมูลจากออเดอร์เดิม ให้ใช้เป็นค่าเริ่มต้นในกรณี draft ว่าง
  if(!$("tFirstName").value.trim()&&!$("tLastName").value.trim()){
    prefillTeacherProfile();
  }

  $("tPhone").value=teacherLookupPhone;
  updateTeacherSide();
  lastFlow="teacher";
  showScreen("teacherScreen");
}

$("teacherPickupCard").addEventListener("click",async()=>{
  await refreshPickupAvailability();

  if(teacherLookupPhone){
    await refreshTeacherOrder(teacherLookupPhone);
  }

  teacherOrder=teacherOrders[0]||null;
  renderTeacherOrdersList();
  $("teacherOrdersSection").classList.toggle("hidden",teacherOrders.length===0);
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
    const qy=query(
      ref(db,"preorders"),
      orderByChild("customer/phone"),
      equalTo(phone)
    );
    const snap=await get(qy);

    if(snap.exists()){
      teacherOrders=sortOrders(
        Object.entries(snap.val())
          .map(([id,v])=>({id,...v}))
          .filter(o=>o.buyerType==="teacher")
      );
    }

    teacherOrder=teacherOrders[0]||null;
  }catch(e){
    console.warn("Indexed teacher query failed, using fallback.",e);

    try{
      const all=await loadAllPreorders();
      teacherOrders=sortOrders(
        all.filter(o=>
          o.buyerType==="teacher" &&
          String(o.customer?.phone||"")===String(phone)
        )
      );
      teacherOrder=teacherOrders[0]||null;
    }catch(fallbackError){
      console.error(fallbackError);
      toast("ไม่สามารถโหลดคำสั่งซื้อได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือ Firebase Rules","error");
    }
  }

  renderTeacherHub();
}

function renderTeacherHub(){
  const latestCustomer=teacherOrders[0]?.customer||null;
  const teacherName=latestCustomer
    ? `${latestCustomer.prefix||""}${latestCustomer.firstName||""} ${latestCustomer.lastName||""}`.trim()
    : "";

  if($("teacherHubGreeting")){
    $("teacherHubGreeting").textContent=teacherName
      ? `สวัสดี ${teacherName}`
      : "สำหรับคุณครู";
  }

  if($("teacherHubIdentity")){
    $("teacherHubIdentity").textContent=teacherName
      ? `เข้าสู่ระบบด้วยเบอร์ ${teacherLookupPhone} · เลือกพรีออเดอร์ใหม่หรือดูรายการเดิม`
      : `เข้าสู่ระบบด้วยเบอร์ ${teacherLookupPhone} · ยังไม่มีข้อมูลชื่อจากการพรีออเดอร์`;
  }

  if($("teacherTopbarPhone"))$("teacherTopbarPhone").textContent=teacherLookupPhone||"-";

  $("teacherStatTotal").textContent=teacherOrders.length;
  $("teacherStatPending").textContent=teacherOrders.filter(o=>(o.payment?.status||"pending")==="pending").length;
  $("teacherStatReady").textContent=pickupOpen
    ? teacherOrders.filter(o=>(o.pickup?.status||"locked")==="ready").length
    : 0;

  if(!teacherOrders.length){
    $("teacherPreorderStatusBadge").className="status-pill neutral";
    $("teacherPreorderStatusBadge").textContent="เริ่มพรีออเดอร์";
    $("teacherPickupCard").classList.remove("locked");
    $("teacherPickupStatusBadge").className="status-pill neutral";
    $("teacherPickupStatusBadge").textContent="ยังไม่มีรายการ";
    $("teacherPickupCardText").textContent="เมื่อพรีออเดอร์แล้ว รายการของคุณจะแสดงที่นี่";
    return;
  }

  const verifiedCount=teacherOrders.filter(o=>(o.payment?.status||"pending")==="verified").length;
  const pendingCount=teacherOrders.filter(o=>(o.payment?.status||"pending")==="pending").length;
  const rejectedCount=teacherOrders.filter(o=>(o.payment?.status||"pending")==="rejected").length;

  $("teacherPreorderStatusBadge").className="status-pill neutral";
  $("teacherPreorderStatusBadge").textContent=`มี ${teacherOrders.length} คำสั่งซื้อ · สั่งเพิ่มได้`;

  $("teacherPickupCard").classList.remove("locked");

  if(verifiedCount>0 && pickupOpen){
    const readyCount=teacherOrders.filter(o=>(o.pickup?.status||"locked")==="ready").length;
    $("teacherPickupStatusBadge").className="status-pill verified";
    $("teacherPickupStatusBadge").textContent=readyCount>0?`พร้อมรับ ${readyCount} รายการ`:"ดูรายการของฉัน";
    $("teacherPickupCardText").textContent="ดูสถานะการเงินและสถานะการรับสินค้าของทุกคำสั่งซื้อ";
  }else if(verifiedCount>0){
    $("teacherPickupStatusBadge").className="status-pill pending";
    $("teacherPickupStatusBadge").textContent="ชำระเงินผ่านแล้ว · รอเปิดรับ";
    $("teacherPickupCardText").textContent="ดูรายการที่ชำระผ่านแล้วและรายการอื่น ๆ";
  }else{
    $("teacherPickupStatusBadge").className=`status-pill ${rejectedCount>0?"rejected":"pending"}`;
    $("teacherPickupStatusBadge").textContent=pendingCount>0?`รอตรวจ ${pendingCount} รายการ`:"ดูรายการของฉัน";
    $("teacherPickupCardText").textContent="ดูรายการพรีออเดอร์และสถานะของแต่ละรายการ";
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
      <div class="order-card-actions"><button type="button" class="order-view-btn" data-detail-teacher="${o.id}">รายละเอียด</button><button type="button" class="order-view-btn" data-teacher-order="${o.id}">สถานะการรับ →</button></div>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-detail-teacher]").forEach(btn=>btn.addEventListener("click",()=>openOrderDetail(teacherOrders.find(o=>o.id===btn.dataset.detailTeacher))));
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

  if((o.pickup?.status||"")==="picked_up"){hero.className="pickup-status-hero verified-status";$("teacherPickupHeroIcon").textContent="✓";$("teacherPickupHeroTitle").textContent="รับสินค้าเรียบร้อยแล้ว";$("teacherPickupHeroText").textContent=`รับกระเป๋าแล้ว${o.pickup?.pickedUpAt?` เมื่อ ${orderDate(o.pickup.pickedUpAt)}`:""}`;$("teacherPickupFinanceStatus").textContent="เสร็จสิ้น";return;}
  if(!pickupOpen || (o.pickup?.status||"locked")!=="ready"){
    $("teacherPickupHeroIcon").textContent="⌛";
    $("teacherPickupHeroTitle").textContent="ยังไม่เปิดรับสินค้า";
    $("teacherPickupHeroText").textContent="ฝ่ายการเงินยืนยันการชำระเงินแล้ว แต่สินค้ายังอยู่ในช่วงพรีออเดอร์ กรุณารอแอดมินประกาศเปิดรับสินค้า";
    $("teacherPickupFinanceStatus").textContent="ชำระเงินผ่านแล้ว";
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



$("teacherStartBtn").addEventListener("click",async()=>{
  const saved=readValidSession(TEACHER_SESSION_KEY);

  if(saved?.phone){
    teacherLookupPhone=saved.phone;
    localStorage.setItem(LAST_PORTAL_KEY,"teacher");
    setLoading(true,"กำลังเข้าสู่ระบบสำหรับครู...");
    try{
      await refreshPickupAvailability();
      await refreshTeacherOrder(saved.phone);
      subscribeTeacherRealtime(saved.phone);
      showScreen("teacherHubScreen");
    }finally{
      setLoading(false);
    }
    return;
  }

  $("teacherLoginPhone").value="";
  $("teacherLoginStatus").textContent="กรอกเบอร์โทร 9–10 หลัก";
  $("teacherLoginStatus").className="teacher-phone-note";
  showScreen("teacherLoginScreen");
});

$("teacherLoginBack").addEventListener("click",()=>showScreen("landing"));

$("teacherLoginPhone").addEventListener("input",()=>{
  onlyDigits($("teacherLoginPhone"),10);
  const phone=$("teacherLoginPhone").value;

  if(/^\d{9,10}$/.test(phone)){
    $("teacherLoginStatus").textContent="เบอร์ถูกต้อง · สามารถเข้าสู่ระบบได้";
    $("teacherLoginStatus").className="teacher-phone-note valid";
  }else{
    $("teacherLoginStatus").textContent="กรอกเบอร์โทร 9–10 หลัก";
    $("teacherLoginStatus").className="teacher-phone-note";
  }
});

$("teacherLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const phone=$("teacherLoginPhone").value.trim();

  if(!/^\d{9,10}$/.test(phone)){
    return toast("กรุณากรอกเบอร์โทร 9–10 หลัก","error");
  }

  teacherLookupPhone=phone;
  saveTeacherSession(phone);
  setLoading(true,"กำลังเข้าสู่ระบบสำหรับครู...");

  try{
    await refreshPickupAvailability();
    await refreshTeacherOrder(phone);
    subscribeTeacherRealtime(phone);
    showScreen("teacherHubScreen");
  }catch(error){
    console.error(error);
    toast("ไม่สามารถเข้าสู่ระบบสำหรับครูได้","error");
  }finally{
    setLoading(false);
  }
});

$("teacherLogoutBtn").addEventListener("click",()=>{
  clearTeacherSession();
  showScreen("landing");
});

// Teacher wizard

$("backToLandingTeacher").addEventListener("click",()=>{closeTeacherDrawer();renderTeacherHub();showScreen("teacherHubScreen");});
["tPrefix","tFirstName","tLastName"].forEach(id=>{
  $(id).addEventListener("input",updateTeacherSide);
  $(id).addEventListener("change",updateTeacherSide);
});

$("tQuantity").addEventListener("change",()=>{
  setTeacherQty(Number($("tQuantity").value));
  updateTeacherSide();
});

$("teacherNext").addEventListener("click",()=>{
  if(!$("tPrefix").value||!$("tFirstName").value.trim()||!$("tLastName").value.trim()){
    return toast("กรุณากรอกคำนำหน้า ชื่อ และนามสกุลให้ครบ","error");
  }
  goTeacherStep(2);
});

$("teacherBack").addEventListener("click",()=>goTeacherStep(1));
$("teacherPaymentNext").addEventListener("click",()=>goTeacherStep(3));
$("teacherPaymentBack").addEventListener("click",()=>goTeacherStep(2));

$("teacherReviewNext").addEventListener("click",()=>{
  if(!teacherSlip)return toast("กรุณาแนบสลิป","error");
  updateTeacherReview();
  goTeacherStep(4);
});

$("teacherReviewBack").addEventListener("click",()=>goTeacherStep(3));

function goTeacherStep(n){
  if(n<1||n>4)return;

  teacherStep=n;
  const labels=["ข้อมูลครู","เลือกจำนวน","ชำระเงิน","ตรวจสอบข้อมูล"];

  if($("teacherProgressText")){
    $("teacherProgressText").textContent=`ขั้นตอน ${n} จาก 4 · ${labels[n-1]}`;
  }

  document.querySelectorAll("[data-ts]").forEach(x=>{
    x.classList.toggle("active",Number(x.dataset.ts)===n);
  });

  document.querySelectorAll("[data-tp]").forEach(x=>{
    const v=Number(x.dataset.tp);
    x.classList.toggle("active",v===n);
    x.classList.toggle("done",v<n);
  });

  if($("teacherIdentityPhone")){
    $("teacherIdentityPhone").textContent=teacherLookupPhone||"-";
  }

  if(n===4)updateTeacherReview();

  saveTeacherDraft();
  window.scrollTo({top:0,behavior:"smooth"});
}

function setTeacherQty(q){
  q=Math.max(1,Math.min(10,q||1));
  $("tQuantity").value=q;
  const total=q*UNIT_PRICE;

  $("tTotal").textContent=money(total);
  $("tSideTotal").textContent=money(total);
  $("tPayAmount").textContent=money(total);
  setPaymentQr("tQr",q);
  $("tQrInfo").textContent=`สำหรับ ${q} ใบ`;
}

function updateTeacherSide(){
  const n=`${$("tPrefix").value||""}${$("tFirstName").value||""} ${$("tLastName").value||""}`.trim();
  $("tSideName").textContent=n||"ยังไม่ได้กรอก";
  $("tSidePhone").textContent=teacherLookupPhone||"ยังไม่ได้เข้าสู่ระบบ";

  if($("teacherIdentityPhone")){
    $("teacherIdentityPhone").textContent=teacherLookupPhone||"-";
  }

  const q=Number($("tQuantity").value||1);
  $("tSideQty").textContent=`${q} ใบ`;
  $("tSideTotal").textContent=money(q*UNIT_PRICE);
}

function updateTeacherReview(){
  const name=`${$("tPrefix").value||""}${$("tFirstName").value||""} ${$("tLastName").value||""}`.trim();
  const q=Number($("tQuantity").value||1);

  $("tReviewName").textContent=name||"-";
  $("tReviewPhone").textContent=teacherLookupPhone||"-";
  $("tReviewQty").textContent=`${q} ใบ`;
  $("tReviewTotal").textContent=money(q*UNIT_PRICE);
  $("tReviewSlip").textContent=teacherSlipMeta?.originalName||teacherSlipMeta?.name||"แนบสลิปแล้ว";
}

function prefillTeacherProfile(){
  const c=teacherOrders[0]?.customer;
  if(!c)return;

  $("tPrefix").value=c.prefix||"";
  $("tFirstName").value=c.firstName||"";
  $("tLastName").value=c.lastName||"";
}

function resetTeacher(){
  $("teacherForm").reset();
  fillQty($("tQuantity"));
  teacherStep=1;
  teacherSlip=null;
  teacherSlipMeta=null;
  $("tSlipPreview").classList.add("hidden");

  $("tPhone").value=teacherLookupPhone||"";
  prefillTeacherProfile();
  setTeacherQty(1);
  updateTeacherSide();
  goTeacherStep(1);
}
$("teacherForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(teacherSubmitting) return;

  if(!$("tPrefix").value||!$("tFirstName").value.trim()||!$("tLastName").value.trim()) return toast("กรุณากรอกข้อมูลครูให้ครบ","error");
  if(!/^\d{9,10}$/.test(teacherLookupPhone)) return toast("ไม่พบข้อมูลการเข้าสู่ระบบครู กรุณาเข้าสู่ระบบใหม่","error");
  if(!teacherSlip) return toast("กรุณาแนบสลิป","error");
  if(!$("tConfirm").checked) return toast("กรุณายืนยันข้อมูล","error");

  teacherSubmitting=true;
  const submitBtn=$("submitTeacherOrderBtn");
  if(submitBtn){submitBtn.disabled=true;submitBtn.textContent="กำลังบันทึก...";}

  const qty=Number($("tQuantity").value),total=qty*UNIT_PRICE,r=push(ref(db,"preorders")),refCode=orderRef("TC");
  const data={
    buyerType:"teacher",
    referenceCode:refCode,
    customer:{prefix:$("tPrefix").value,firstName:$("tFirstName").value.trim(),lastName:$("tLastName").value.trim(),phone:teacherLookupPhone},
    order:{unitPrice:UNIT_PRICE,quantity:qty,totalAmount:total},
    payment:{method:"qr",status:"pending",qrNumber:qty,slipData:teacherSlip,slipMeta:teacherSlipMeta},
    pickup:{status:"locked",code:null},
    status:"pending_review",
    createdAt:serverTimestamp()
  };

  try{
    await set(r,data);
    teacherLookupPhone=teacherLookupPhone||$("tPhone").value;
    saveTeacherSession(teacherLookupPhone);
    subscribeTeacherRealtime(teacherLookupPhone);
    const localOrder={id:r.key,...data,createdAt:Date.now()};
    teacherOrders=sortOrders([localOrder,...teacherOrders.filter(o=>o.id!==r.key)]);
    teacherOrder=localOrder;
    renderTeacherHub();
    lastFlow="teacher";

    localStorage.removeItem(TEACHER_DRAFT_KEY);
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


// Draft autosave / duplicate decision / order detail
const STUDENT_DRAFT_KEY="sckc_student_preorder_draft_v1",TEACHER_DRAFT_KEY="sckc_teacher_preorder_draft_v1";
function saveStudentDraft(){if(!studentSession)return;const d={studentId:studentSession.studentId,prefix:$("sPrefix").value,firstName:$("sFirstName").value,lastName:$("sLastName").value,level:$("sLevel").value,room:$("sRoom").value,contactType:studentContactType,contactValue:$("sContactValue").value,phone:$("sPhone").value,quantity:$("sQuantity").value,step:studentStep,updatedAt:Date.now()};localStorage.setItem(STUDENT_DRAFT_KEY,JSON.stringify(d));}
function restoreStudentDraft(){try{const d=JSON.parse(localStorage.getItem(STUDENT_DRAFT_KEY)||"null");if(!d||d.studentId!==studentSession?.studentId)return;$("sPrefix").value=d.prefix||"";$("sFirstName").value=d.firstName||"";$("sLastName").value=d.lastName||"";$("sLevel").value=d.level||"";$("sLevel").dispatchEvent(new Event("change"));$("sRoom").value=d.room||"";studentContactType=d.contactType||"facebook";document.querySelectorAll("[data-scontact]").forEach(b=>b.classList.toggle("active",b.dataset.scontact===studentContactType));$("sContactLabel").textContent=studentContactType==="facebook"?"Facebook":"Instagram";$("sContactValue").value=d.contactValue||"";$("sPhone").value=d.phone||"";$("sQuantity").value=d.quantity||"1";$("sQuantity").dispatchEvent(new Event("change"));goStudentStep(Math.min(Number(d.step)||1,4));updateStudentSide();toast("กู้คืนข้อมูลที่กรอกค้างไว้แล้ว","success");}catch(e){console.warn(e);}}
function saveTeacherDraft(){
  const d={
    prefix:$("tPrefix").value,
    firstName:$("tFirstName").value,
    lastName:$("tLastName").value,
    phone:teacherLookupPhone,
    quantity:$("tQuantity").value,
    step:teacherStep,
    updatedAt:Date.now()
  };
  localStorage.setItem(TEACHER_DRAFT_KEY,JSON.stringify(d));
}
function restoreTeacherDraft(){
  try{
    const d=JSON.parse(localStorage.getItem(TEACHER_DRAFT_KEY)||"null");
    if(!d)return;

    $("tPrefix").value=d.prefix||"";
    $("tFirstName").value=d.firstName||"";
    $("tLastName").value=d.lastName||"";

    const savedSession=readValidSession(TEACHER_SESSION_KEY);
    teacherLookupPhone=savedSession?.phone||d.phone||teacherLookupPhone||"";
    $("tPhone").value=teacherLookupPhone;

    $("tQuantity").value=d.quantity||"1";
    setTeacherQty(Number($("tQuantity").value));

    goTeacherStep(Math.min(Number(d.step)||1,4));
    updateTeacherSide();
    toast("กู้คืนแบบฟอร์มครูที่กรอกค้างไว้แล้ว","success");
  }catch(e){
    console.warn(e);
  }
}
["sPrefix","sFirstName","sLastName","sLevel","sRoom","sPhone","sContactValue","sQuantity"].forEach(id=>$(id)?.addEventListener("change",saveStudentDraft));
["sFirstName","sLastName","sPhone","sContactValue"].forEach(id=>$(id)?.addEventListener("input",saveStudentDraft));
["tPrefix","tFirstName","tLastName","tQuantity"].forEach(id=>{$(id)?.addEventListener("change",saveTeacherDraft);$(id)?.addEventListener("input",saveTeacherDraft);});
$("continueNewOrderBtn").addEventListener("click",()=>{const flow=$("duplicateOrderModal").dataset.flow;$("duplicateOrderModal").classList.add("hidden");if(flow==="student"){resetStudentOrder();restoreStudentDraft();showScreen("studentPreorderScreen");}else startTeacherOrder();});
$("viewExistingOrdersBtn").addEventListener("click",()=>{$("duplicateOrderModal").classList.add("hidden");const flow=$("duplicateOrderModal").dataset.flow;if(flow==="student")showScreen("studentHub");else showScreen("teacherHubScreen");});
document.querySelectorAll("[data-close-duplicate]").forEach(x=>x.addEventListener("click",()=>$("duplicateOrderModal").classList.add("hidden")));
function openOrderDetail(o){if(!o)return;const c=o.customer||{},ps=o.payment?.status||"pending",pus=o.pickup?.status||"locked";$("detailOrderRef").textContent=o.referenceCode||"-";$("detailOrderName").textContent=`${c.prefix||""}${c.firstName||""} ${c.lastName||""}`.trim()||"-";$("detailOrderQty").textContent=`${o.order?.quantity||0} ใบ`;$("detailOrderTotal").textContent=money(o.order?.totalAmount||0);$("detailOrderDate").textContent=orderDate(o.createdAt);$("detailFinanceStatus").textContent=paymentLabel(ps);$("detailPickupStatus").textContent=pickupLabel(pus);$("detailOrderStatus").className=`status-pill ${pus==="picked_up"?"picked_up":ps}`;$("detailOrderStatus").textContent=pus==="picked_up"?"รับสินค้าแล้ว":paymentLabel(ps);const showCode=Boolean(o.pickup?.code)&&["ready","picked_up"].includes(pus);$("detailPickupCodeWrap").classList.toggle("hidden",!showCode);$("detailPickupCode").textContent=o.pickup?.code||"-";$("orderDetailModal").classList.remove("hidden");}
$("closeOrderDetail").addEventListener("click",()=>$("orderDetailModal").classList.add("hidden"));document.querySelectorAll("[data-close-order-detail]").forEach(x=>x.addEventListener("click",()=>$("orderDetailModal").classList.add("hidden")));

// Slip handlers
setupSlip("s",v=>{studentSlip=v.data;studentSlipMeta=v.meta;});setupSlip("t",v=>{teacherSlip=v.data;teacherSlipMeta=v.meta;});
function setupSlip(prefix,onSet){const upload=$(prefix+"Upload"),file=$(prefix+"SlipFile"),preview=$(prefix+"SlipPreview"),img=$(prefix+"SlipImg"),name=$(prefix+"SlipName"),size=$(prefix+"SlipSize"),remove=$(prefix+"RemoveSlip");upload.addEventListener("click",()=>file.click());file.addEventListener("change",async()=>{const f=file.files?.[0];if(!f)return;if(!["image/jpeg","image/png","image/webp"].includes(f.type))return toast("รองรับเฉพาะ JPG, PNG, WEBP","error");try{const result=await compressImage(f);onSet({data:result.dataUrl,meta:{originalName:f.name,originalSize:f.size,compressedSize:result.bytes,mimeType:result.mimeType}});img.src=result.dataUrl;name.textContent=f.name;size.textContent=formatBytes(result.bytes);preview.classList.remove("hidden");toast("แนบสลิปแล้ว","success");}catch(err){console.error(err);toast("ไม่สามารถประมวลผลรูปได้","error");}});remove.addEventListener("click",()=>{file.value="";preview.classList.add("hidden");onSet({data:null,meta:null});});}
async function compressImage(file){const src=await readData(file),image=await loadImg(src);let w=image.width,h=image.height,max=1400;if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r);}const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d",{alpha:false});x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(image,0,0,w,h);let quality=.82,data=c.toDataURL("image/jpeg",quality),bytes=dataBytes(data);while(bytes>MAX_SLIP_BYTES&&quality>.42){quality-=.08;data=c.toDataURL("image/jpeg",quality);bytes=dataBytes(data);}return{dataUrl:data,bytes,mimeType:"image/jpeg"};}
function readData(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});}function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});}function dataBytes(d){return Math.ceil(((d.split(",")[1]||"").length*3)/4);}function formatBytes(b){return b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(2)} MB`;}

$("successClose").addEventListener("click",async()=>{
  $("successModal").classList.add("hidden");
  if(lastFlow==="teacher"){
    await refreshPickupAvailability(); if(teacherLookupPhone) await refreshTeacherOrder(teacherLookupPhone);
    showScreen("teacherHubScreen");
    return;
  }
  if(studentSession){
    await refreshPickupAvailability();
    await refreshStudentOrder();
    showScreen("studentHub");
  }else{
    showScreen("landing");
  }
});
setTeacherQty(1);


// Restore persistent student login / remembered teacher phone after page setup.
window.addEventListener("DOMContentLoaded",()=>{
  restorePersistentLogin().catch(err=>console.warn("restore login",err));
});


// Visitor counter: count one view for every index.html page load / refresh.
trackSiteOpen();
