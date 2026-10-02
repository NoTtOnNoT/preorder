import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, push, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const UNIT_PRICE=129;
const MAX_SLIP_BYTES=450*1024;
const app=initializeApp(firebaseConfig);
const db=getDatabase(app);
const $=id=>document.getElementById(id);

let step=1;
let slipData=null;
let slipMeta=null;
let submitting=false;
let submitted=false;

function money(v){return `฿${Number(v||0).toLocaleString("th-TH")}`;}
function toast(text,type=""){
  const el=document.createElement("div");
  el.className=`toast ${type}`;
  el.textContent=text;
  $("toast").appendChild(el);
  setTimeout(()=>el.remove(),3200);
}
function fillQty(){
  const q=$("quantity");
  for(let i=1;i<=10;i++){
    const o=document.createElement("option");
    o.value=String(i);o.textContent=`${i} ใบ`;q.appendChild(o);
  }
  const s=document.createElement("option");
  s.value="100";s.textContent="100 ใบ · ชุดพิเศษ";q.appendChild(s);
}
function setQr(q){
  const img=$("paymentQr");
  img.onerror=()=>{img.onerror=null;img.src="./payment-qr.svg";};
  img.src=`./qr/qr-${q}.png`;
}
function updateOrder(){
  const q=Number($("quantity").value||1);
  const total=q*UNIT_PRICE;
  $("totalStep1").textContent=money(total);
  $("payAmount").textContent=money(total);
  $("reviewQty").textContent=`${q} ใบ`;
  $("reviewTotal").textContent=money(total);
  $("qrInfo").textContent=`สำหรับ ${q} ใบ`;
  setQr(q);
}
function showWelcome(){
  $("pageWelcome").classList.add("active");
  $("wizardPage").classList.remove("active");
  window.scrollTo({top:0,behavior:"auto"});
}
function showWizard(){
  $("pageWelcome").classList.remove("active");
  $("wizardPage").classList.add("active");
  goStep(1);
}
function goStep(n){
  step=n;
  document.querySelectorAll("[data-step]").forEach(el=>el.classList.toggle("active",Number(el.dataset.step)===n));
  $("progressText").textContent=`ขั้นตอน ${n} จาก 3`;
  $("progressBar").style.width=`${(n/3)*100}%`;
  if(n===3){
    const q=Number($("quantity").value||1);
    $("reviewQty").textContent=`${q} ใบ`;
    $("reviewTotal").textContent=money(q*UNIT_PRICE);
    $("reviewSlip").textContent=slipMeta?.originalName||"แนบสลิปแล้ว";
  }
  window.scrollTo({top:0,behavior:"smooth"});
}
function formatBytes(b){return b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(2)} MB`;}
function readData(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});}
function bytes(data){return Math.ceil(((data.split(",")[1]||"").length*3)/4);}
async function compressImage(file){
  const src=await readData(file),img=await loadImg(src);
  let w=img.width,h=img.height,max=1200;
  if(w>max||h>max){const r=Math.min(max/w,max/h);w=Math.round(w*r);h=Math.round(h*r);}
  const c=document.createElement("canvas");c.width=w;c.height=h;
  const x=c.getContext("2d",{alpha:false});x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);
  let quality=.74,data=c.toDataURL("image/jpeg",quality),size=bytes(data);
  while(size>MAX_SLIP_BYTES&&quality>.38){quality-=.08;data=c.toDataURL("image/jpeg",quality);size=bytes(data);}
  return {dataUrl:data,bytes:size,mimeType:"image/jpeg"};
}
function orderCode(){
  const d=new Date();
  return `DR${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
}

fillQty();
updateOrder();

$("startPreorder").addEventListener("click",showWizard);
$("backWelcome").addEventListener("click",showWelcome);
$("quantity").addEventListener("change",updateOrder);
$("goPayment").addEventListener("click",()=>goStep(2));
$("backQuantity").addEventListener("click",()=>goStep(1));
$("backPayment").addEventListener("click",()=>goStep(2));
$("goReview").addEventListener("click",()=>{
  if(!slipData)return toast("กรุณาแนบสลิปก่อน","error");
  goStep(3);
});
$("uploadZone").addEventListener("click",()=>$("slipFile").click());
$("slipFile").addEventListener("change",async()=>{
  const file=$("slipFile").files?.[0];
  if(!file)return;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))return toast("รองรับเฉพาะ JPG / PNG / WEBP","error");
  try{
    const r=await compressImage(file);
    slipData=r.dataUrl;
    slipMeta={originalName:file.name,originalSize:file.size,compressedSize:r.bytes,mimeType:r.mimeType};
    $("slipImg").src=r.dataUrl;
    $("slipName").textContent=file.name;
    $("slipSize").textContent=formatBytes(r.bytes);
    $("uploadZone").classList.add("hidden");
    $("slipPreview").classList.remove("hidden");
    toast("แนบสลิปเรียบร้อย","success");
  }catch(e){console.error(e);toast("ไม่สามารถประมวลผลรูปสลิปได้","error");}
});
$("removeSlip").addEventListener("click",()=>{
  slipData=null;slipMeta=null;$("slipFile").value="";
  $("slipPreview").classList.add("hidden");$("uploadZone").classList.remove("hidden");
});
$("submitOrder").addEventListener("click",async()=>{
  if(submitting)return;
  if(submitted)return toast("รายการนี้ถูกส่งแล้ว","success");
  if(!slipData)return toast("กรุณาแนบสลิป","error");
  if(!$("confirmCheck").checked)return toast("กรุณายืนยันข้อมูลก่อนส่ง","error");

  const qty=Number($("quantity").value||1);
  if(![1,2,3,4,5,6,7,8,9,10,100].includes(qty))return toast("จำนวนไม่ถูกต้อง","error");

  const total=qty*UNIT_PRICE;
  const orderNode=push(ref(db,"preorders"));
  const code=orderCode();

  const data={
    buyerType:"director",
    referenceCode:code,
    customer:{
      prefix:"นาย",
      firstName:"สุทธานนท์",
      lastName:"ทองนุ่น",
      displayName:"ผอ.สุทธานนท์ ทองนุ่น",
      role:"ผู้อำนวยการโรงเรียน"
    },
    order:{unitPrice:UNIT_PRICE,quantity:qty,totalAmount:total},
    payment:{method:"qr",status:"pending",qrNumber:qty,slipMeta,hasSlip:true},
    pickup:{status:"locked",code:null},
    status:"pending_review",
    createdAt:serverTimestamp()
  };

  submitting=true;
  $("loading").classList.remove("hidden");
  $("submitOrder").disabled=true;
  $("submitOrder").textContent="กำลังบันทึก...";

  try{
    const updates={};
    updates[`preorders/${orderNode.key}`]=data;
    updates[`orderSlips/${orderNode.key}`]={data:slipData,meta:slipMeta,uploadedAt:Date.now()};
    await update(ref(db),updates);
    submitted=true;
    $("successRef").textContent=code;
    $("successModal").classList.remove("hidden");
    $("submitOrder").textContent="ส่งพรีออเดอร์แล้ว";
  }catch(e){
    console.error(e);
    $("submitOrder").disabled=false;
    $("submitOrder").textContent="ยืนยันและส่งพรีออเดอร์";
    toast("บันทึกไม่สำเร็จ กรุณาตรวจสอบ Firebase Rules","error");
  }finally{
    submitting=false;
    $("loading").classList.add("hidden");
  }
});
$("successBack").addEventListener("click",showWelcome);
