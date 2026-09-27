import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, push, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const UNIT_PRICE=139, MAX_QTY=20, MAX_SLIP_BYTES=900*1024;
const app=initializeApp(firebaseConfig), db=getDatabase(app);
const $=id=>document.getElementById(id);
const steps=[...document.querySelectorAll('.form-step')], psteps=[...document.querySelectorAll('.pstep')];
const form=$('preorderForm'), progressBar=$('progressBar');
const prefix=$('prefix'), firstName=$('firstName'), lastName=$('lastName'), studentId=$('studentId'), level=$('level'), room=$('room'), phone=$('phone');
const contactValue=$('contactValue'), contactLabel=$('contactLabel'), contacts=[...document.querySelectorAll('.contact')];
const quantity=$('quantity'), qtyText=$('qtyText'), totalAmount=$('totalAmount'), paymentAmount=$('paymentAmount');
const uploadZone=$('uploadZone'), slipFile=$('slipFile'), slipPreview=$('slipPreview'), slipImg=$('slipImg'), slipName=$('slipName'), slipSize=$('slipSize');
const rName=$('rName'), rStudent=$('rStudent'), rClass=$('rClass'), rPhone=$('rPhone'), rContact=$('rContact'), rQty=$('rQty'), rTotal=$('rTotal'), rSlip=$('rSlip');
const confirmOrder=$('confirmOrder'), submitBtn=$('submitBtn'), submitText=$('submitText'), loader=$('loader');
let currentStep=1, selectedContact='facebook', slipData=null, slipMeta=null;

const limits={"ม.1":12,"ม.2":12,"ม.3":12,"ม.4":8,"ม.5":7,"ม.6":7,"ปวช.1":2,"ปวช.2":2,"ปวช.3":2};
studentId.addEventListener('input',()=>studentId.value=studentId.value.replace(/\D/g,'').slice(0,5));
phone.addEventListener('input',()=>phone.value=phone.value.replace(/\D/g,'').slice(0,10));
level.addEventListener('change',()=>{room.innerHTML='';const m=limits[level.value];if(!m){room.disabled=true;room.innerHTML='<option value="">เลือกชั้นก่อน</option>';return}room.disabled=false;room.innerHTML='<option value="">เลือกห้อง</option>';for(let i=1;i<=m;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`ห้อง ${i}`;room.appendChild(o)}});
contacts.forEach(c=>c.addEventListener('click',()=>{selectedContact=c.dataset.contact;contacts.forEach(x=>x.classList.remove('selected'));c.classList.add('selected');contactLabel.textContent=selectedContact==='facebook'?'Facebook':'Instagram';contactValue.placeholder=selectedContact==='facebook'?'ชื่อ Facebook หรือ URL':'@username หรือ URL Instagram'}));

$('minus').addEventListener('click',()=>setQty(Number(quantity.value)-1));$('plus').addEventListener('click',()=>setQty(Number(quantity.value)+1));quantity.addEventListener('input',()=>setQty(quantity.value));
function setQty(v){let q=Math.floor(Number(v)||1);q=Math.max(1,Math.min(MAX_QTY,q));quantity.value=q;qtyText.textContent=q;const total=q*UNIT_PRICE;totalAmount.textContent=money(total);paymentAmount.textContent=money(total)}

[...document.querySelectorAll('.next')].forEach(b=>b.addEventListener('click',()=>{if(!validate(currentStep))return;if(currentStep===3)renderReview();go(currentStep+1)}));
[...document.querySelectorAll('.back')].forEach(b=>b.addEventListener('click',()=>go(currentStep-1)));
[...document.querySelectorAll('[data-edit]')].forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.edit))));
function go(n){if(n<1||n>4)return;currentStep=n;steps.forEach(s=>s.classList.toggle('active',Number(s.dataset.step)===n));psteps.forEach(s=>{const x=Number(s.dataset.p);s.classList.toggle('active',x===n);s.classList.toggle('done',x<n)});progressBar.style.width=`${((n-1)/3)*100}%`;window.scrollTo({top:0,behavior:'smooth'})}
function validate(s){if(s===1){for(const f of [prefix,firstName,lastName,studentId,level,room,contactValue,phone]){if(!String(f.value||'').trim()){f.focus();toast('กรุณากรอกข้อมูลผู้สั่งซื้อให้ครบ','error');return false}}if(!/^\d{5}$/.test(studentId.value)){studentId.focus();toast('รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก','error');return false}if(!/^\d{9,10}$/.test(phone.value)){phone.focus();toast('กรุณากรอกเบอร์โทรศัพท์ 9–10 หลัก','error');return false}}if(s===2){const q=Number(quantity.value);if(!Number.isInteger(q)||q<1||q>MAX_QTY){toast('จำนวนต้องอยู่ระหว่าง 1–20 ใบ','error');return false}}if(s===3&&!slipData){toast('กรุณาแนบหลักฐานการชำระเงิน','error');return false}return true}

uploadZone.addEventListener('click',()=>slipFile.click());uploadZone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();slipFile.click()}});
slipFile.addEventListener('change',async()=>{const f=slipFile.files?.[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)){toast('รองรับ JPG, PNG และ WEBP เท่านั้น','error');return}if(f.size>10*1024*1024){toast('ไฟล์ต้นฉบับต้องไม่เกิน 10 MB','error');return}try{uploadZone.style.opacity='.5';const c=await compressImage(f);if(c.bytes>MAX_SLIP_BYTES)throw new Error('large');slipData=c.dataUrl;slipMeta={originalName:f.name,originalSize:f.size,compressedSize:c.bytes,mimeType:'image/jpeg'};slipImg.src=slipData;slipName.textContent=f.name;slipSize.textContent=`${formatBytes(c.bytes)} หลังย่อ`;slipPreview.classList.remove('hidden');toast('เตรียมรูปสลิปเรียบร้อย','success')}catch(e){console.error(e);clearSlip();toast(e.message==='large'?'รูปยังใหญ่เกินไป กรุณาใช้ภาพที่เล็กลง':'ประมวลผลรูปไม่ได้','error')}finally{uploadZone.style.opacity='1'}});
$('removeSlip').addEventListener('click',clearSlip);function clearSlip(){slipData=null;slipMeta=null;slipFile.value='';slipPreview.classList.add('hidden');slipImg.removeAttribute('src')}
async function compressImage(file){const src=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src});let w=img.width,h=img.height;const max=1400;if(w>max||h>max){const ratio=Math.min(max/w,max/h);w=Math.round(w*ratio);h=Math.round(h*ratio)}const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);let q=.82,data=canvas.toDataURL('image/jpeg',q),bytes=dataBytes(data);while(bytes>MAX_SLIP_BYTES&&q>.42){q-=.08;data=canvas.toDataURL('image/jpeg',q);bytes=dataBytes(data)}return{dataUrl:data,bytes}}
const dataBytes=d=>Math.ceil(((d.split(',')[1]||'').length*3)/4);

function renderReview(){const q=Number(quantity.value),total=q*UNIT_PRICE;rName.textContent=`${prefix.value}${firstName.value} ${lastName.value}`;rStudent.textContent=studentId.value;rClass.textContent=`${level.value} / ห้อง ${room.value}`;rPhone.textContent=phone.value;rContact.textContent=`${selectedContact==='facebook'?'Facebook':'Instagram'} · ${contactValue.value}`;rQty.textContent=`${q} ใบ`;rTotal.textContent=money(total);rSlip.src=slipData||''}
form.addEventListener('submit',async e=>{e.preventDefault();if(!validate(1)){go(1);return}if(!validate(2)){go(2);return}if(!validate(3)){go(3);return}if(!confirmOrder.checked){toast('กรุณายืนยันข้อมูลก่อนส่ง','error');return}setLoading(true);try{const orderRef=push(ref(db,'preorders')),id=orderRef.key,refCode=makeRef(id),q=Number(quantity.value),total=q*UNIT_PRICE;await set(orderRef,{referenceCode:refCode,customer:{prefix:prefix.value,firstName:firstName.value.trim(),lastName:lastName.value.trim(),studentId:studentId.value,level:level.value,room:room.value,phone:phone.value,contact:{type:selectedContact,value:contactValue.value.trim()}},order:{unitPrice:UNIT_PRICE,quantity:q,totalAmount:total},payment:{method:'qr',status:'pending',slipData,slipMeta},status:'pending_review',createdAt:serverTimestamp()});$('successRef').textContent=refCode;$('successQty').textContent=`${q} ใบ`;$('successTotal').textContent=money(total);$('successModal').classList.remove('hidden');toast('บันทึกคำสั่งซื้อสำเร็จ','success')}catch(err){console.error(err);toast(err?.code==='PERMISSION_DENIED'?'Firebase ปฏิเสธการบันทึก กรุณาตรวจ Rules':'ส่งคำสั่งซื้อไม่สำเร็จ','error')}finally{setLoading(false)}});
$('finish').addEventListener('click',()=>{$('successModal').classList.add('hidden');form.reset();selectedContact='facebook';contacts.forEach(c=>c.classList.toggle('selected',c.dataset.contact==='facebook'));room.disabled=true;room.innerHTML='<option value="">เลือกชั้นก่อน</option>';setQty(1);clearSlip();go(1)});
function setLoading(x){submitBtn.disabled=x;submitText.classList.toggle('hidden',x);loader.classList.toggle('hidden',!x)}
function makeRef(k=''){const s=k.replace(/[^a-zA-Z0-9]/g,'').slice(-7).toUpperCase(),d=new Date();return`PO${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${s}`}
const money=v=>`฿${Number(v).toLocaleString('th-TH')}`;function formatBytes(b){return b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(2)} MB`}
function toast(msg,type=''){const box=$('toast'),t=document.createElement('div');t.className=`toast ${type}`;t.textContent=msg;box.appendChild(t);setTimeout(()=>t.remove(),4000)}
setQty(1);go(1);
