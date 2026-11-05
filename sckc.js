import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { subscribeOrderSummaries, loadOrderDetail } from "./order-data.js?v=20261103-complete3";
import { parsePickupPayload, pickupEligibility, pickupMessage, pickupError, loadCouncilAccount, confirmCouncilPickup } from "./pickup-service.js?v=20261105-sckc-path2";
import { verifyCouncilPassword, validCouncilAccount, councilCredentialStamp } from "./sckc-auth.js?v=20261105-session1";
import { createStationScanner } from "./sckc-scanner.js?v=20261105-copy-session2";

const db=getDatabase(initializeApp(firebaseConfig)), $=id=>document.getElementById(id);
const SESSION_KEY="preorder_sckc_session_v1", REMEMBER_MS=7*24*60*60*1000;
const PAGE_SIZE=40, SESSION_MS=12*60*60*1000, collator=new Intl.Collator("th",{numeric:true,sensitivity:"base"});
let council=null,orders=[],loaded=false,filter="waiting",page=1,view="overview",selected=null,selectedScan=null;
let configReady=false,pickupOpen=false,connected=false,confirmBusy=false,scanLookupBusy=false,loginBusy=false;
let request=0,loginRequest=0,readsGeneration=0,sessionTimer,toastTimer,sessionExpiresAt=0;
let unsubscribeOrders,unsubscribeConfig,unsubscribeConnection,unsubscribeAccount;
let sessionMode="memory",accountWatch=0;
const scanner=createStationScanner({video:$("stationCamera"),message:$("cameraMessage"),onResult:lookupQr,onControls:({running,opening,busy})=>{
  $("startStationCamera").disabled=opening||running||busy||scanLookupBusy;
  $("startStationCamera").textContent=opening?"กำลังขออนุญาต…":running?"กำลังสแกน QR…":"เปิดกล้องเพื่อสแกน";
  $("flipStationCamera").disabled=opening||busy||scanLookupBusy||!running;
  $("stopStationCamera").disabled=!running&&!opening;
  $("stationQrFile").disabled=busy||scanLookupBusy;
  $("manualLookup").disabled=busy||scanLookupBusy;
}});
function toast(text){clearTimeout(toastTimer);$("stationToast").textContent=text;$("stationToast").hidden=false;toastTimer=setTimeout(()=>{$("stationToast").hidden=true;},4500);}
function received(order){return order?.pickup?.status==="picked_up"||order?.pickup?.pickedUpAt!=null||order?.status==="completed";}
function quantity(order){const n=Number(order?.order?.quantity);return Number.isSafeInteger(n)&&n>0?n:0;}
function person(order){const c=order?.customer||{};return c.displayName||`${c.prefix||""}${c.firstName||""} ${c.lastName||""}`.trim()||"ข้อมูลชื่อยังไม่ครบ";}
function buyerType(order){return {student:"นักเรียน",teacher:"คุณครู",director:"ผู้อำนวยการ"}[order?.buyerType]||"ผู้สั่งซื้อ";}
function className(order){const c=order?.customer||{};return [c.level,c.room?`ห้อง ${c.room}`:""].filter(Boolean).join(" / ")||"—";}
function identity(order){const c=order?.customer||{};return [c.studentId?`รหัส ${c.studentId}`:buyerType(order),className(order)==="—"?"":className(order)].filter(Boolean).join(" · ");}
function timestamp(value){return typeof value==="number"&&Number.isFinite(value)?new Intl.DateTimeFormat("th-TH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Bangkok"}).format(new Date(value)):"ยังไม่มีเวลาบันทึก";}
function stationMessage(error){
  if(error?.code==="INVALID_QUANTITY")return "จำนวนกระเป๋าของรายการนี้ไม่ถูกต้อง กรุณาติดต่อผู้ดูแลก่อนส่งมอบ";
  if(error?.code==="PICKUP_CLOSED")return "ระบบยังไม่เปิดรับกระเป๋า กรุณาติดต่อผู้ดูแลเพื่อเปิดรับสินค้า";
  if(error?.code==="PAYMENT_NOT_VERIFIED")return "รายการนี้ยังไม่ผ่านเงื่อนไขการรับกระเป๋า กรุณาให้ผู้รับติดต่อฝ่ายการเงินก่อนส่งมอบ";
  if(error?.code==="ORDER_NOT_READY")return "รายการนี้ยังไม่ได้ตั้งให้พร้อมรับ กรุณาติดต่อผู้ดูแลก่อนส่งมอบ";
  if(error?.code==="ORDER_CHANGED")return "จำนวนกระเป๋าถูกเปลี่ยน กรุณาโหลดรายการล่าสุดแล้วตรวจสอบจำนวนอีกครั้ง";
  return error?.userMessage||pickupMessage(error);
}
function show(viewName,{push=true}={}){
  if(!council)return;
  if(confirmBusy){toast("กำลังบันทึกการรับกระเป๋า กรุณารอผลก่อนเปลี่ยนหน้า");return;}
  const next=["overview","scan","detail"].includes(viewName)?viewName:"overview";
  view=next==="detail"&&!selected?"overview":next;
  scanner.deactivate();scanLookupBusy=false;
  ["overview","scan","detail"].forEach(name=>{$(name+"View").hidden=name!==view;});
  if(push&&location.hash!=="#"+view)history.pushState(null,"","#"+view);
  if(view==="scan"){
    request++;scanner.activate();$("stationManualCode").value="";$("scanTitle").focus();
  }else if(view==="overview"){request++;renderList();}
  window.scrollTo?.({top:0,behavior:"instant"});
}
function endSession(message="ออกจากระบบแล้ว"){
  loginRequest++;request++;readsGeneration++;accountWatch++;clearTimeout(sessionTimer);clearSavedSession();stopReads();unsubscribeAccount?.();unsubscribeAccount=null;
  scanner.deactivate();council=null;sessionExpiresAt=0;orders=[];loaded=false;selected=null;selectedScan=null;confirmBusy=false;connected=false;
  $("councilApp").hidden=true;$("councilLogin").hidden=false;$("councilPassword").value="";$("loginMessage").textContent=message;
  $("recipientList").replaceChildren();$("handoverCard").hidden=true;$("stationToast").hidden=true;
  sessionMode="memory";$("retryCouncilSession").hidden=true;
  // Administrator sessions and other websites are never cleared.
}
function clearSavedSession(){
  for(const storage of [()=>localStorage,()=>sessionStorage])try{storage().removeItem(SESSION_KEY);}catch{}
}
function saveCouncilSession(actor,expiresAt,remember){
  clearSavedSession();
  const data=JSON.stringify({version:1,...actor,expiresAt,savedAt:Date.now()});
  try{(remember?localStorage:sessionStorage).setItem(SESSION_KEY,data);return remember?"local":"tab";}catch{return "memory";}
}
function savedCouncilSession(){
  for(const [mode,storage] of [["local",()=>localStorage],["tab",()=>sessionStorage]]){
    let raw;try{raw=storage().getItem(SESSION_KEY);}catch{continue;}
    if(!raw)continue;
    try{
      const record=JSON.parse(raw),now=Date.now(),limit=mode==="local"?REMEMBER_MS:SESSION_MS;
      const path=record.username==="sckc"&&record.accountPath==="sckc"||record.accountPath===`sckcAccounts/${record.username}`;
      if(record.version!==1||record.role!=="pickup"||!path||!/^[a-z0-9_-]{1,64}$/.test(record.username||"")||!Number.isInteger(record.credentialVersion)||record.credentialVersion<1||!/^[a-f0-9]{64}$/.test(record.credentialStamp||"")||!Number.isFinite(record.savedAt)||!Number.isFinite(record.expiresAt)||record.savedAt>now+60000||record.expiresAt<=now||record.expiresAt-record.savedAt>limit+1000)throw new Error("INVALID_SESSION");
      return {record,mode};
    }catch{try{storage().removeItem(SESSION_KEY);}catch{}}
  }
  return null;
}
function scheduleSessionExpiry(){
  clearTimeout(sessionTimer);
  sessionTimer=setTimeout(()=>{if(!confirmBusy)endSession("หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");},Math.max(0,sessionExpiresAt-Date.now()));
}
function loginErrorMessage(error){
  const text=String(error?.code||"")+" "+String(error?.message||"");
  if(/permission|unauthorized|access.denied/i.test(text))return "Database ไม่อนุญาตให้อ่านบัญชี กรุณาตรวจ Rules ไม่ต้อง Import บัญชีซ้ำ";
  if(error?.message==="SECURE_CONTEXT_REQUIRED")return "กรุณาเปิดผ่าน HTTPS เพื่อเข้าสู่ระบบ";
  if(error?.message==="INVALID_LOGIN")return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือไม่พบบัญชีจุดรับที่ตั้งไว้";
  return "เชื่อมต่อเพื่อตรวจสอบบัญชีไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง";
}
function activateCouncilSession(actor,expiresAt,mode){
  council=actor;sessionExpiresAt=expiresAt;sessionMode=mode;scheduleSessionExpiry();
  $("councilPassword").value="";$("loginMessage").textContent="";$("retryCouncilSession").hidden=true;$("councilLogin").hidden=true;$("councilApp").hidden=false;
  unsubscribeAccount?.();const watch=++accountWatch;
  unsubscribeAccount=onValue(ref(db,actor.accountPath),async snapshot=>{
    const latest=snapshot.val();let valid=validCouncilAccount(latest)&&latest.credentialVersion===actor.credentialVersion;
    try{if(valid)valid=await councilCredentialStamp(latest)===actor.credentialStamp;}catch{valid=false;}
    if(watch!==accountWatch||council!==actor)return;
    if(!valid){if(confirmBusy){sessionExpiresAt=0;clearSavedSession();return;}endSession("บัญชีถูกปิดหรือเปลี่ยนรหัสผ่าน กรุณาเข้าสู่ระบบใหม่");}
  },()=>{if(confirmBusy){sessionExpiresAt=0;clearSavedSession();}else endSession("ตรวจสอบสิทธิ์บัญชีไม่ได้ กรุณาเข้าสู่ระบบใหม่");});
  startReads();show(location.hash==="#scan"?"scan":"overview",{push:false});
}
async function restoreCouncilSession(){
  if(loginBusy||council)return;
  const saved=savedCouncilSession();if(!saved)return;
  const {record,mode}=saved,ticket=++loginRequest;
  loginBusy=true;$("councilLoginButton").disabled=true;$("retryCouncilSession").hidden=true;$("councilUsername").value=record.username;$("loginMessage").textContent="กำลังตรวจสอบการเข้าสู่ระบบที่จำไว้…";
  try{
    const {account,path}=await loadCouncilAccount(db,record.username);
    if(ticket!==loginRequest)return;
    if(!validCouncilAccount(account)||path!==record.accountPath||account.credentialVersion!==record.credentialVersion||await councilCredentialStamp(account)!==record.credentialStamp){
      clearSavedSession();$("loginMessage").textContent="บัญชีหรือรหัสผ่านมีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่";return;
    }
    if(ticket!==loginRequest)return;
    if(record.expiresAt<=Date.now()){clearSavedSession();$("loginMessage").textContent="หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่";return;}
    const actor={username:record.username,role:"pickup",credentialVersion:record.credentialVersion,accountPath:path,credentialStamp:record.credentialStamp};
    activateCouncilSession(actor,record.expiresAt,mode);
  }catch(error){
    if(ticket===loginRequest){$("loginMessage").textContent=loginErrorMessage(error);$("retryCouncilSession").hidden=false;}
  }finally{loginBusy=false;$("councilLoginButton").disabled=false;}
}
$("councilLoginForm").addEventListener("submit",async event=>{
  event.preventDefault();if(loginBusy)return;
  const user=$("councilUsername").value.trim().toLowerCase(),pass=$("councilPassword").value;
  if(!/^[a-z0-9_-]{1,64}$/.test(user)){ $("loginMessage").textContent="กรุณาตรวจสอบชื่อผู้ใช้";return;}
  loginBusy=true;const ticket=++loginRequest;$("councilLoginButton").disabled=true;$("loginMessage").textContent="กำลังตรวจสอบบัญชี…";
  try{
    const {account,path:accountPath}=await loadCouncilAccount(db,user);
    if(!account||!await verifyCouncilPassword(account,pass))throw new Error("INVALID_LOGIN");
    if(ticket!==loginRequest)return;
    const credentialStamp=await councilCredentialStamp(account);
    if(ticket!==loginRequest)return;
    const remember=$("rememberCouncilLogin").checked===true;
    const actor={username:user,role:"pickup",credentialVersion:account.credentialVersion,accountPath,credentialStamp};
    const expiresAt=Date.now()+(remember?REMEMBER_MS:SESSION_MS);
    const mode=saveCouncilSession(actor,expiresAt,remember);
    activateCouncilSession(actor,expiresAt,mode);
    if(mode==="memory")toast("เบราว์เซอร์นี้บันทึกการเข้าสู่ระบบไม่ได้ ใช้งานต่อในแท็บนี้ได้");
  }catch(error){if(ticket===loginRequest)$("loginMessage").textContent=loginErrorMessage(error);}
  finally{loginBusy=false;$("councilLoginButton").disabled=false;}
});
$("councilLogout").addEventListener("click",()=>{if(confirmBusy){toast("กรุณารอผลยืนยันก่อนออกจากระบบ");return;}endSession();});
function stopReads(){readsGeneration++;unsubscribeOrders?.();unsubscribeOrders=null;unsubscribeConfig?.();unsubscribeConfig=null;unsubscribeConnection?.();unsubscribeConnection=null;configReady=false;connected=false;}
function startReads(){
  if(!council||document.hidden)return;stopReads();const generation=readsGeneration;
  loaded=false;configReady=false;setListMessage("กำลังโหลดรายชื่อทั้งหมด…");renderStats();
  unsubscribeOrders=subscribeOrderSummaries(db,raw=>{
    if(!council||generation!==readsGeneration)return;
    orders=Object.entries(raw).map(([id,value])=>({...value,id}));loaded=true;renderStats();renderList();
  },error=>{
    if(generation!==readsGeneration)return;loaded=false;renderStats();$("recipientList").replaceChildren();$("listPagination").hidden=true;
    setListMessage("โหลดรายชื่อไม่สำเร็จ "+stationMessage(error)+" กดโหลดรายการใหม่เพื่อลองอีกครั้ง",true);
  },(done,total)=>{if(generation===readsGeneration&&!loaded)setListMessage(total?`กำลังตรวจสอบรายชื่อ ${done.toLocaleString("th-TH")} / ${total.toLocaleString("th-TH")} รายการ…`:"กำลังตรวจสอบรายชื่อทั้งหมด…");});
  unsubscribeConfig=onValue(ref(db,"systemConfig/pickupOpen"),snap=>{if(generation!==readsGeneration)return;pickupOpen=snap.val()===true;configReady=true;renderDetail();},()=>{if(generation===readsGeneration){configReady=false;renderDetail();}});
  unsubscribeConnection=onValue(ref(db,".info/connected"),snap=>{
    if(generation!==readsGeneration)return;connected=snap.val()===true;$("connectionStatus").textContent=connected?"เชื่อมต่อแล้ว":"ขาดการเชื่อมต่อ";$("connectionStatus").dataset.state=connected?"online":"offline";renderDetail();
  },()=>{if(generation===readsGeneration){connected=false;$("connectionStatus").textContent="เชื่อมต่อไม่ได้";$("connectionStatus").dataset.state="offline";renderDetail();}});
}
function setListMessage(text,error=false){$("listMessage").hidden=false;$("listMessage").textContent=text;$("listMessage").dataset.state=error?"error":"normal";}
function renderStats(){
  const ids=["stationTotalOrders","stationTotalBags","stationWaitingOrders","stationReceivedOrders","waitingTabCount","receivedTabCount"];
  if(!loaded){ids.forEach(id=>$(id).textContent="—");$("stationWaitingBags").textContent=$("stationReceivedBags").textContent="— ใบ";$("handoverProgress").value=0;$("progressText").textContent="กำลังโหลด";return;}
  const done=orders.filter(received),waiting=orders.filter(order=>!received(order));
  const bags=orders.reduce((sum,o)=>sum+quantity(o),0),receivedBags=done.reduce((sum,o)=>sum+quantity(o),0);
  const numbers=[orders.length,bags,waiting.length,done.length,waiting.length,done.length];ids.forEach((id,i)=>$(id).textContent=numbers[i].toLocaleString("th-TH"));
  $("stationWaitingBags").textContent=`${(bags-receivedBags).toLocaleString("th-TH")} ใบ`;
  $("stationReceivedBags").textContent=`${receivedBags.toLocaleString("th-TH")} ใบ`;
  $("handoverProgress").value=bags?Math.round(receivedBags/bags*100):0;$("progressText").textContent=`${receivedBags.toLocaleString("th-TH")} / ${bags.toLocaleString("th-TH")} ใบ`;
}
function matchingOrders(){
  const term=$("recipientSearch").value.trim().toLocaleLowerCase("th-TH");
  return orders.filter(order=>filter==="all"||(filter==="received"?received(order):!received(order))).filter(order=>!term||[person(order),identity(order),order.customer?.phone,order.referenceCode,order.pickup?.code].join(" ").toLocaleLowerCase("th-TH").includes(term)).sort((a,b)=>{
    if(filter==="all"&&received(a)!==received(b))return received(a)?1:-1;
    if(received(a)&&received(b))return Number(b.pickup?.pickedUpAt||0)-Number(a.pickup?.pickedUpAt||0)||collator.compare(person(a),person(b));
    return collator.compare(person(a),person(b))||String(a.id).localeCompare(String(b.id));
  });
}
function renderList(){
  $("recipientList").replaceChildren();if(!loaded){$("listCount").textContent="—";$("listPagination").hidden=true;return;}
  const list=matchingOrders(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=Math.min(Math.max(1,page),pages);
  $("listCount").textContent=`${list.length.toLocaleString("th-TH")} รายการ`;
  if(!list.length)setListMessage($("recipientSearch").value.trim()?"ไม่พบรายชื่อที่ตรงกับคำค้น":filter==="waiting"?"ไม่มีรายการค้างรับกระเป๋าแล้ว":filter==="received"?"ยังไม่มีรายการรับกระเป๋าแล้ว":"ยังไม่มีคำสั่งซื้อ");else $("listMessage").hidden=true;
  const fragment=document.createDocumentFragment();
  for(const order of list.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)){
    const row=document.createElement("button");row.type="button";row.className="recipient-row";row.dataset.orderId=order.id;
    const avatar=document.createElement("span");avatar.className="recipient-avatar";avatar.textContent=order.customer?.studentId?.slice(-2)||"✓";avatar.setAttribute("aria-hidden","true");
    const copy=document.createElement("span");copy.className="recipient-copy";const name=document.createElement("strong"),meta=document.createElement("small");name.textContent=person(order);meta.textContent=identity(order);copy.append(name,meta);
    const bags=document.createElement("span");bags.className="row-bags";bags.textContent=quantity(order).toLocaleString("th-TH");const unit=document.createElement("small");unit.textContent="ใบ";bags.append(unit);
    const status=document.createElement("span");status.className="status-chip";status.dataset.state=received(order)?"received":"waiting";status.textContent=received(order)?"รับแล้ว":"ยังไม่รับ";
    const arrow=document.createElement("span");arrow.className="row-arrow";arrow.textContent="↗";arrow.setAttribute("aria-hidden","true");row.append(avatar,copy,bags,status,arrow);fragment.append(row);
  }
  $("recipientList").append(fragment);$("listPagination").hidden=list.length<=PAGE_SIZE;$("pageLabel").textContent=`หน้า ${page} / ${pages}`;$("previousPage").disabled=page<=1;$("nextPage").disabled=page>=pages;
}
async function fetchRecipient(id,scan){
  const [order,config]=await Promise.all([loadOrderDetail(db,id),get(ref(db,"systemConfig/pickupOpen"))]);
  if(!order)throw pickupError("ORDER_NOT_FOUND");
  if(scan&&String(order.referenceCode||"")!==scan.reference)throw pickupError("QR_MISMATCH");
  return {order,open:config.val()===true};
}
async function lookupQr(raw,context){
  if(!council)throw Object.assign(new Error("กรุณาเข้าสู่ระบบก่อน"),{userMessage:"กรุณาเข้าสู่ระบบก่อน"});
  const scan=parsePickupPayload(raw);scanLookupBusy=true;scanner.refresh();
  try{
    const result=await fetchRecipient(scan.id,scan);
    if(!council||!context.isActive())return;
    selected=result.order;selectedScan=scan;pickupOpen=result.open;configReady=true;request++;
    show("detail");$("detailLoading").hidden=true;renderDetail();$("recipientTitle").focus();
  }catch(error){throw Object.assign(error,{userMessage:stationMessage(error)});}
  finally{scanLookupBusy=false;if(view==="scan")scanner.refresh();}
}
async function openRecipient(id,scan=null){
  if(!council||confirmBusy)return;const ticket=++request;
  scanner.deactivate();view="detail";["overview","scan","detail"].forEach(name=>$(name+"View").hidden=name!=="detail");
  history.pushState(null,"","#detail");selected=null;selectedScan=scan;$("detailLoading").hidden=false;$("detailLoading").textContent="กำลังเปิดข้อมูลผู้รับ…";$("handoverCard").hidden=true;$("retryDetail").hidden=true;$("retryDetail").dataset.orderId=id;
  window.scrollTo?.({top:0,behavior:"instant"});
  try{
    const result=await fetchRecipient(id,scan);if(ticket!==request||!council||view!=="detail")return;
    selected=result.order;pickupOpen=result.open;configReady=true;$("detailLoading").hidden=true;renderDetail();$("recipientTitle").focus();
  }catch(error){if(ticket!==request||!council)return;$("detailLoading").textContent=stationMessage(error);$("detailLoading").dataset.state="error";$("retryDetail").hidden=false;}
}
function renderDetail(){
  if(!selected||view!=="detail")return;
  const c=selected.customer||{},isDone=received(selected),check=pickupEligibility(selected,pickupOpen);
  if(!isDone&&quantity(selected)<=0){check.allowed=false;check.code="INVALID_QUANTITY";}
  $("handoverCard").hidden=false;$("detailLoading").hidden=true;$("retryDetail").hidden=true;
  $("handoverCard").dataset.state=isDone?"received":check.allowed?"ready":"blocked";
  $("recipientTitle").textContent=person(selected);$("recipientIdentity").textContent=identity(selected);$("detailBagCount").textContent=quantity(selected).toLocaleString("th-TH");
  $("detailStudentId").textContent=c.studentId||"—";$("detailClass").textContent=className(selected);$("detailPhone").textContent=c.phone||"—";
  $("detailReference").textContent=selected.referenceCode||"—";$("detailPickupCode").textContent=selected.pickup?.code||"—";$("detailBuyerType").textContent=buyerType(selected);
  $("detailState").textContent=isDone?"รับกระเป๋าแล้ว":check.allowed?"พร้อมส่งมอบ":"ยังส่งมอบไม่ได้";$("detailState").dataset.state=isDone?"received":check.allowed?"ready":"blocked";
  $("receiptRecord").hidden=!isDone;
  if(isDone){$("receiptTime").textContent=`รับเมื่อ ${timestamp(selected.pickup?.pickedUpAt)}`;$("receiptStaff").textContent=selected.pickup?.pickedUpBy?`ยืนยันโดย ${selected.pickup.pickedUpBy}`:"บันทึกรับสินค้าเรียบร้อยแล้ว";}
  let text=isDone?"รายการนี้รับกระเป๋าแล้ว ไม่สามารถยืนยันรับซ้ำได้":!configReady?"ยังตรวจสอบการเปิดรับไม่ได้ กรุณารอเชื่อมต่อระบบ":!connected?"ขาดการเชื่อมต่อ กรุณารออินเทอร์เน็ตก่อนยืนยัน":!check.allowed?stationMessage({code:check.code}):"ตรวจชื่อให้ตรงกับผู้รับ แล้วส่งมอบกระเป๋าตามจำนวนที่แสดง";
  if(confirmBusy)text="กำลังบันทึกการรับกระเป๋า กรุณารอผลจากระบบและอย่าปิดหน้านี้";
  $("handoverMessage").textContent=text;$("handoverMessage").dataset.state=isDone?"success":confirmBusy?"normal":check.allowed&&configReady&&connected?"ready":"blocked";
  $("confirmStationPickup").disabled=confirmBusy||isDone||!configReady||!connected||!check.allowed||quantity(selected)<=0;
  $("confirmStationPickup").setAttribute("aria-busy",String(confirmBusy));
  $("confirmButtonText").textContent=confirmBusy?"กำลังบันทึก…":isDone?"รับกระเป๋าแล้ว":"ยืนยันรับกระเป๋า";
  $("confirmButtonQuantity").textContent=isDone?"":`${quantity(selected).toLocaleString("th-TH")} ใบ`;
  $("confirmedScanNext").hidden=!isDone;$("confirmHint").textContent=isDone?"พร้อมรับรายการถัดไปได้เลย":"ตรวจชื่อและจำนวนให้ตรงกับผู้รับก่อนกดยืนยัน";
  $("detailScanNext").disabled=confirmBusy;$("councilLogout").disabled=confirmBusy;
}
$("confirmStationPickup").addEventListener("click",async()=>{
  if(confirmBusy||!selected||!council||$("confirmStationPickup").disabled)return;
  if(Date.now()>=sessionExpiresAt){endSession("หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");return;}
  const order=selected,actor={...council},scan=selectedScan;confirmBusy=true;renderDetail();
  try{
    const result=await confirmCouncilPickup(db,order.id,actor,{expectedReference:scan?.reference||String(order.referenceCode||""),expectedQuantity:quantity(order),via:scan?"qr":"manual"});
    selected=result.order;
    // Optimistic local receipt can only follow the successful canonical transaction.
    orders=orders.map(item=>item.id===order.id?{...item,pickup:result.order.pickup,status:result.order.status}:item);renderStats();renderList();
    toast(`บันทึกรับกระเป๋า ${quantity(result.order)} ใบแล้ว`);
    if(!result.indexSynced)toast("รับกระเป๋าสำเร็จแล้ว รายชื่อภาพรวมอาจอัปเดตช้าเล็กน้อย");
  }catch(error){
    $("handoverMessage").textContent=stationMessage(error);$("handoverMessage").dataset.state="error";
    try{const latest=await fetchRecipient(order.id,scan);selected=latest.order;pickupOpen=latest.open;configReady=true;}catch{}
    toast(stationMessage(error));
    if(["COUNCIL_REQUIRED","COUNCIL_DISABLED"].includes(error.code))sessionExpiresAt=0;
  }finally{
    confirmBusy=false;renderDetail();
    if(Date.now()>=sessionExpiresAt){endSession("กรุณาเข้าสู่ระบบใหม่ก่อนรับรายการถัดไป");}
    else if(document.hidden)stopReads();
  }
});
$("openStationScanner").addEventListener("click",()=>show("scan"));
$("detailScanNext").addEventListener("click",()=>show("scan"));$("confirmedScanNext").addEventListener("click",()=>show("scan"));
$("startStationCamera").addEventListener("click",scanner.start);$("flipStationCamera").addEventListener("click",scanner.flip);$("stopStationCamera").addEventListener("click",scanner.pause);
$("stationQrFile").addEventListener("change",async()=>{const file=$("stationQrFile").files?.[0];try{await scanner.file(file);}finally{$("stationQrFile").value="";}});
$("stationManualForm").addEventListener("submit",async event=>{
  event.preventDefault();if(scanLookupBusy||!council||view!=="scan")return;
  const raw=$("stationManualCode").value.trim();if(!raw)return;scanner.pause();
  if(raw.startsWith("SCKC-BAG|")){
    const ticket=++request;try{await lookupQr(raw,{isActive:()=>council&&view==="scan"&&ticket===request});}catch(error){$("cameraMessage").textContent=stationMessage(error);$("cameraMessage").dataset.state="error";}return;
  }
  if(!loaded){$("cameraMessage").textContent="รายชื่อยังโหลดไม่ครบ กรุณาลองโหลดรายการใหม่จากภาพรวม หรือใช้ QR";return;}
  const matches=orders.filter(order=>[order.referenceCode,order.pickup?.code,order.id].some(value=>value&&String(value).toUpperCase()===raw.toUpperCase()));
  if(matches.length!==1){$("cameraMessage").textContent=matches.length?"รหัสนี้ตรงกับหลายรายการ กรุณาใช้ QR ของผู้รับ":"ไม่พบรหัสนี้ ลองใช้ QR หรือค้นหาชื่อจากภาพรวม";$("cameraMessage").dataset.state="error";return;}
  openRecipient(matches[0].id);
});
$("recipientList").addEventListener("click",event=>{const row=event.target.closest("[data-order-id]");if(row)openRecipient(row.dataset.orderId);});
$("retryDetail").addEventListener("click",()=>openRecipient($("retryDetail").dataset.orderId,selectedScan));
$("refreshOrders").addEventListener("click",()=>{if(council&&!confirmBusy)startReads();});
$("recipientSearch").addEventListener("input",()=>{page=1;renderList();});$("clearSearch").addEventListener("click",()=>{$("recipientSearch").value="";page=1;renderList();$("recipientSearch").focus();});
for(const button of document.querySelectorAll("[data-filter]"))button.addEventListener("click",()=>{filter=button.dataset.filter;page=1;for(const item of document.querySelectorAll("[data-filter]"))item.setAttribute("aria-pressed",String(item===button));renderList();});
$("previousPage").addEventListener("click",()=>{page--;renderList();});$("nextPage").addEventListener("click",()=>{page++;renderList();});
for(const button of document.querySelectorAll("[data-route]"))button.addEventListener("click",()=>show(button.dataset.route));
window.addEventListener("popstate",()=>{if(confirmBusy){history.replaceState(null,"","#detail");return;}if(council)show(location.hash.slice(1),{push:false});});
window.addEventListener("hashchange",()=>{if(confirmBusy){history.replaceState(null,"","#detail");return;}if(council)show(location.hash.slice(1),{push:false});});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){if(view==="scan")request++;scanner.pause();scanLookupBusy=false;if(!confirmBusy)stopReads();}
  else if(council){if(Date.now()>=sessionExpiresAt&&!confirmBusy)endSession("หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่");else if(!confirmBusy){startReads();if(view==="detail"&&selected)openRecipient(selected.id,selectedScan);}}
});
window.addEventListener("pagehide",()=>{scanner.deactivate();if(!confirmBusy)stopReads();});
window.addEventListener("pageshow",event=>{if(event.persisted&&council&&!confirmBusy)startReads();});
window.addEventListener("beforeunload",event=>{if(confirmBusy){event.preventDefault();event.returnValue="";}});

$("retryCouncilSession").addEventListener("click",restoreCouncilSession);
window.addEventListener("storage",event=>{
  if(event.key===SESSION_KEY&&event.newValue===null&&sessionMode==="local"&&council){
    if(confirmBusy){sessionExpiresAt=0;return;}endSession("ออกจากระบบจากแท็บอื่นแล้ว");
  }
});
restoreCouncilSession();
