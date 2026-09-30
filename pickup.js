import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig);
const db=getDatabase(app);
const $=id=>document.getElementById(id);

const SESSION="pickup_staff_session_v1";
let user=null;
let orders=[];
let selected=null;
let unsub=null;
let currentFilter="ready";

restore();

$("pickupLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();

  const username=normalize($("pickupUsername").value);
  const password=$("pickupPassword").value;

  try{
    const snap=await get(ref(db,`adminAccounts/${username}`));
    if(!snap.exists()) throw new Error("INVALID");

    const account=snap.val();
    const hash=await sha256(password);

    if(String(account.passwordHash||"").toLowerCase()!==hash.toLowerCase()){
      throw new Error("INVALID");
    }

    const role=account.role||"admin";
    if(!["pickup","admin"].includes(role)){
      throw new Error("ROLE");
    }

    user={username,role};
    saveSession();
    openApp();
  }catch(error){
    toast(error?.message==="ROLE"?"บัญชีนี้ไม่มีสิทธิ์ฝ่ายรับสินค้า":"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }
});

function saveSession(){
  const remember=$("pickupRemember").checked;
  const data=JSON.stringify({
    ...user,
    expiresAt:Date.now()+(remember?7*86400000:12*3600000)
  });

  if(remember){
    localStorage.setItem(SESSION,data);
    sessionStorage.removeItem(SESSION);
  }else{
    sessionStorage.setItem(SESSION,data);
    localStorage.removeItem(SESSION);
  }
}

function restore(){
  const raw=localStorage.getItem(SESSION)||sessionStorage.getItem(SESSION);
  if(!raw) return;

  try{
    const data=JSON.parse(raw);
    if(!data.expiresAt||Date.now()>data.expiresAt){
      clearSession();
      return;
    }
    user=data;
    openApp();
  }catch{
    clearSession();
  }
}

function clearSession(){
  localStorage.removeItem(SESSION);
  sessionStorage.removeItem(SESSION);
  if(unsub){unsub();unsub=null;}
}

function openApp(){
  $("pickupLogin").classList.add("hidden");
  $("pickupApp").classList.remove("hidden");
  subscribe();
}

$("pickupLogout").addEventListener("click",()=>{
  clearSession();
  location.reload();
});

function subscribe(){
  if(unsub) unsub();

  unsub=onValue(ref(db,"preorders"),snap=>{
    orders=Object.entries(snap.val()||{})
      .map(([id,value])=>({id,...value}))
      .filter(o=>(o.payment?.status||"pending")==="verified")
      .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));

    render();
  });
}

$("pickupRefresh").addEventListener("click",render);
$("pickupSearch").addEventListener("input",renderCards);
$("pickupTypeFilter").addEventListener("change",renderCards);

document.querySelectorAll(".nav").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    currentFilter=btn.dataset.filter;
    $("pickupListTitle").textContent=
      currentFilter==="ready"?"รายการพร้อมรับ":
      currentFilter==="picked_up"?"รายการที่รับแล้ว":"รายการทั้งหมด";
    renderCards();
  });
});

function render(){
  const ready=orders.filter(o=>(o.pickup?.status||"locked")==="ready");
  const picked=orders.filter(o=>(o.pickup?.status||"locked")==="picked_up");

  $("readyCount").textContent=ready.length;
  $("pickedCount").textContent=picked.length;
  $("readyNavCount").textContent=ready.length;
  $("pickedNavCount").textContent=picked.length;
  $("readyBags").textContent=ready.reduce((sum,o)=>sum+Number(o.order?.quantity||0),0);

  const todayKey=dateKey(new Date());
  $("todayPicked").textContent=picked.filter(o=>{
    const t=o.pickup?.pickedUpAt;
    return typeof t==="number" && dateKey(new Date(t))===todayKey;
  }).length;

  renderCards();
}

function renderCards(){
  const q=$("pickupSearch").value.trim().toLowerCase();
  const type=$("pickupTypeFilter").value;

  const list=orders.filter(o=>{
    const pickupStatus=o.pickup?.status||"locked";
    if(currentFilter!=="all" && pickupStatus!==currentFilter) return false;
    if(type && o.buyerType!==type) return false;

    if(!q) return true;

    const c=o.customer||{};
    return [
      o.pickup?.code,
      o.referenceCode,
      c.studentId,
      c.phone,
      fullName(o),
      c.level,
      c.room
    ].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  $("resultCount").textContent=`${list.length} รายการ`;
  $("pickupEmpty").classList.toggle("hidden",list.length>0);

  $("pickupOrderCards").innerHTML=list.map(o=>{
    const c=o.customer||{};
    const ps=o.pickup?.status||"locked";
    const typeLabel=o.buyerType==="teacher"?"ครู":"นักเรียน";

    return `<article class="order-card ${ps}">
      <div class="order-top">
        <div>
          <small>${typeLabel} · ${escapeHTML(o.referenceCode||"-")}</small>
          <strong>${escapeHTML(o.pickup?.code||"ไม่มีรหัส")}</strong>
        </div>
        <span class="state ${ps}">${ps==="picked_up"?"รับแล้ว":"พร้อมรับ"}</span>
      </div>

      <h3 class="order-name">${escapeHTML(fullName(o))}</h3>
      <p class="order-sub">${escapeHTML(c.studentId||c.phone||"-")}</p>

      <div class="order-info">
        <div><span>จำนวน</span><strong>${Number(o.order?.quantity||0)} ใบ</strong></div>
        <div><span>ยอด</span><strong>${money(o.order?.totalAmount||0)}</strong></div>
      </div>

      <button type="button" data-order="${o.id}">
        ${ps==="picked_up"?"ดูรายละเอียด":"ตรวจสอบและจ่ายสินค้า"}
      </button>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-order]").forEach(btn=>{
    btn.addEventListener("click",()=>openOrder(btn.dataset.order));
  });
}

function openOrder(id){
  const o=orders.find(x=>x.id===id);
  if(!o) return;

  selected=o;
  const c=o.customer||{};
  const ps=o.pickup?.status||"locked";
  const picked=ps==="picked_up";

  $("pmName").textContent=fullName(o);
  $("pmType").textContent=o.buyerType==="teacher"?"ครู":"นักเรียน";
  $("pmPickupCode").textContent=o.pickup?.code||"-";
  $("pmOrderRef").textContent=o.referenceCode||"-";
  $("pmStudentId").textContent=c.studentId||"-";
  $("pmClass").textContent=c.level?`${c.level} / ห้อง ${c.room||"-"}`:"ครู";
  $("pmPhone").textContent=c.phone||"-";
  $("pmQty").textContent=`${Number(o.order?.quantity||0)} ใบ`;
  $("pmAmount").textContent=money(o.order?.totalAmount||0);
  $("pmPayment").textContent="ฝ่ายการเงินยืนยันแล้ว";

  $("pmStatusBanner").className=`status-banner ${ps}`;
  $("pmStatusBanner").textContent=picked?"รับสินค้าเรียบร้อยแล้ว":"พร้อมรับสินค้า";

  $("pickedInfo").classList.toggle("hidden",!picked);
  $("restoreReadyBtn").classList.toggle("hidden",!picked);
  $("confirmPickupBtn").classList.toggle("hidden",picked);

  if(picked){
    $("pmPickedAt").textContent=formatDate(o.pickup?.pickedUpAt);
    $("pmPickedBy").textContent=`ดำเนินการโดย ${o.pickup?.pickedUpBy||"-"}`;
  }

  $("pmNote").value=o.pickup?.note||"";
  $("pickupModal").classList.remove("hidden");
}

document.querySelectorAll("[data-close-pickup]").forEach(el=>{
  el.addEventListener("click",()=>$("pickupModal").classList.add("hidden"));
});

$("confirmPickupBtn").addEventListener("click",async()=>{
  if(!selected) return;

  const qty=Number(selected.order?.quantity||0);
  const ok=confirm(`ยืนยันว่ามอบกระเป๋า ${qty} ใบให้ ${fullName(selected)} แล้วใช่หรือไม่?`);
  if(!ok) return;

  $("confirmPickupBtn").disabled=true;
  $("confirmPickupBtn").textContent="กำลังบันทึก...";

  try{
    await update(ref(db,`preorders/${selected.id}`),{
      "pickup/status":"picked_up",
      "pickup/pickedUpAt":Date.now(),
      "pickup/pickedUpBy":user?.username||"pickup",
      "pickup/note":$("pmNote").value.trim(),
      status:"completed"
    });

    $("pickupModal").classList.add("hidden");
    toast("ยืนยันการรับสินค้าเรียบร้อยแล้ว");
  }catch(error){
    console.error(error);
    toast("บันทึกไม่สำเร็จ");
  }finally{
    $("confirmPickupBtn").disabled=false;
    $("confirmPickupBtn").textContent="✓ ยืนยันว่ามอบสินค้าแล้ว";
  }
});

$("restoreReadyBtn").addEventListener("click",async()=>{
  if(!selected) return;

  const ok=confirm("ต้องการย้อนสถานะรายการนี้กลับเป็น “พร้อมรับ” ใช่หรือไม่?");
  if(!ok) return;

  try{
    await update(ref(db,`preorders/${selected.id}`),{
      "pickup/status":"ready",
      "pickup/pickedUpAt":null,
      "pickup/pickedUpBy":null,
      "pickup/note":$("pmNote").value.trim(),
      status:"payment_verified"
    });

    $("pickupModal").classList.add("hidden");
    toast("ย้อนสถานะเป็นพร้อมรับแล้ว");
  }catch(error){
    console.error(error);
    toast("อัปเดตไม่สำเร็จ");
  }
});

function fullName(o){
  const c=o.customer||{};
  return `${c.prefix||""}${c.firstName||""} ${c.lastName||""}`.trim()||"-";
}

function money(v){
  return `฿${Number(v||0).toLocaleString("th-TH")}`;
}

function formatDate(v){
  if(typeof v!=="number") return "-";
  return new Intl.DateTimeFormat("th-TH",{
    dateStyle:"medium",
    timeStyle:"short"
  }).format(new Date(v));
}

function dateKey(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function normalize(v){
  return String(v||"").trim().toLowerCase().replace(/[.#$\[\]\/]/g,"");
}

async function sha256(text){
  const data=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest("SHA-256",data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function escapeHTML(v=""){
  return String(v)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function toast(message){
  $("pickupToast").innerHTML=`<div class="toast">${escapeHTML(message)}</div>`;
  setTimeout(()=>$("pickupToast").innerHTML="",3200);
}