import { get, ref, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { makeOrderSummary } from "./order-data.js?v=20261103-complete3";

const ID=/^[A-Za-z0-9_-]{1,128}$/;
const REFERENCE=/^[A-Za-z0-9_-]{1,96}$/;
export function pickupError(code){return Object.assign(new Error(code),{code});}
export function pickupMessage(error){
  const messages={
    ORDER_CHANGED:"จำนวนกระเป๋ามีการเปลี่ยนแปลง กรุณาเปิดรายการล่าสุดแล้วตรวจสอบอีกครั้ง",
    COUNCIL_REQUIRED:"กรุณาเข้าสู่ระบบสภานักเรียนก่อนยืนยันรับกระเป๋า",
    COUNCIL_DISABLED:"บัญชีจุดรับนี้ถูกปิดหรือเปลี่ยนรหัสผ่าน กรุณาเข้าสู่ระบบใหม่",
    INVALID_QR:"QR นี้ไม่ใช่คำสั่งซื้อกระเป๋าของระบบ กรุณาเลือก QR ของคำสั่งซื้อ",
    ORDER_NOT_FOUND:"ไม่พบคำสั่งซื้อนี้ กรุณาตรวจสอบ QR อีกครั้ง",
    QR_MISMATCH:"QR ไม่ตรงกับคำสั่งซื้อ กรุณาเปิด QR ล่าสุดจากบัญชีผู้ซื้อ",
    ALREADY_PICKED_UP:"คำสั่งซื้อนี้รับกระเป๋าแล้ว ไม่สามารถยืนยันซ้ำได้",
    PAYMENT_NOT_VERIFIED:"ฝ่ายการเงินยังไม่ได้ยืนยันการชำระเงิน จึงยังรับกระเป๋าไม่ได้",
    PICKUP_CLOSED:"ยังไม่เปิดรับกระเป๋า กรุณาเปิดการรับสินค้าจากหน้าภาพรวมก่อน",
    ORDER_NOT_READY:"คำสั่งซื้อนี้ยังไม่พร้อมรับกระเป๋า กรุณาตรวจสอบสถานะรายการ",
    ADMIN_REQUIRED:"กรุณาเข้าสู่ระบบแอดมินก่อนยืนยันรับกระเป๋า",
    OFFLINE:"ไม่มีอินเทอร์เน็ต กรุณาเชื่อมต่อแล้วลองใหม่",
    NOT_COMMITTED:"ยังไม่สามารถยืนยันได้ กรุณาโหลดสถานะล่าสุดแล้วลองอีกครั้ง"
  };
  if(messages[error?.code])return messages[error.code];
  if(String(error?.code||error?.message||"").toLowerCase().includes("permission"))return "ไม่สามารถเข้าถึงข้อมูลได้ กรุณาตรวจสอบสิทธิ์ของระบบ";
  return "โหลดหรือบันทึกข้อมูลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
}
export function makePickupPayload(order){
  const id=String(order?.id||""),reference=String(order?.referenceCode||"");
  if(!ID.test(id)||!REFERENCE.test(reference))throw pickupError("INVALID_QR");
  // No name, phone number or payment image is embedded in the QR.
  return `SCKC-BAG|1|${id}|${reference}`;
}
export function parsePickupPayload(value){
  if(typeof value!=="string"||value.length>260)throw pickupError("INVALID_QR");
  const parts=value.trim().split("|");
  if(parts.length!==4||parts[0]!=="SCKC-BAG"||parts[1]!=="1"||!ID.test(parts[2])||!REFERENCE.test(parts[3]))throw pickupError("INVALID_QR");
  return {id:parts[2],reference:parts[3]};
}
export function pickupEligibility(order,pickupOpen){
  if(!order)return {allowed:false,code:"ORDER_NOT_FOUND"};
  if(order.pickup?.status==="picked_up"||order.pickup?.pickedUpAt!=null||order.status==="completed")return {allowed:false,code:"ALREADY_PICKED_UP"};
  if(order.payment?.status!=="verified")return {allowed:false,code:"PAYMENT_NOT_VERIFIED"};
  if(pickupOpen!==true)return {allowed:false,code:"PICKUP_CLOSED"};
  if(order.pickup?.status!=="ready")return {allowed:false,code:"ORDER_NOT_READY"};
  return {allowed:true,code:"READY"};
}
export async function confirmOrderPickup(db,id,admin,{expectedReference,via="manual"}={}){
  if(!admin||admin.role!=="admin"||!String(admin.username||"").trim())throw pickupError("ADMIN_REQUIRED");
  return commitOrderPickup(db,id,admin,{expectedReference,via});
}
// Prefer the dedicated account node. Legacy /sckc is supported only when the
// canonical record is absent; a disabled canonical account never falls back.
export async function loadCouncilAccount(db,username){
  if(!ID.test(String(username||"")))throw pickupError("COUNCIL_REQUIRED");
  const path=`sckcAccounts/${username}`,canonical=await get(ref(db,path));
  if(canonical.exists())return {account:canonical.val(),path};
  if(username==="sckc"){
    const legacy=await get(ref(db,"sckc"));
    if(legacy.exists())return {account:legacy.val(),path:"sckc"};
  }
  return {account:null,path};
}
// The council role can use only the handover path; it never becomes an admin.
export async function confirmCouncilPickup(db,id,council,options={}){
  if(council?.role!=="pickup"||!ID.test(String(council.username||"")))throw pickupError("COUNCIL_REQUIRED");
  if(globalThis.navigator?.onLine===false)throw pickupError("OFFLINE");
  const {account,path}=await loadCouncilAccount(db,council.username);
  if(!account||account.enabled!==true||account.role!=="pickup"||account.credentialVersion!==council.credentialVersion||(council.accountPath&&council.accountPath!==path))throw pickupError("COUNCIL_DISABLED");
  return commitOrderPickup(db,id,council,options);
}
async function commitOrderPickup(db,id,actor,{expectedReference,expectedQuantity,via="manual"}={}){
  if(!ID.test(String(id||"")))throw pickupError("INVALID_QR");
  if(globalThis.navigator?.onLine===false)throw pickupError("OFFLINE");
  const [before,config]=await Promise.all([get(ref(db,`preorders/${id}`)),get(ref(db,"systemConfig/pickupOpen"))]);
  if(!before.exists())throw pickupError("ORDER_NOT_FOUND");
  if(expectedReference!==undefined&&String(before.val().referenceCode||"")!==expectedReference)throw pickupError("QR_MISMATCH");
  if(expectedQuantity!==undefined&&Number(before.val().order?.quantity)!==expectedQuantity)throw pickupError("ORDER_CHANGED");
  const initial=pickupEligibility(before.val(),config.val()===true);
  if(!initial.allowed)throw pickupError(initial.code);
  let refusal="NOT_COMMITTED";
  const result=await runTransaction(ref(db,`preorders/${id}`),current=>{
    // Firebase can invoke the callback with an initially empty local cache. Returning
    // that null is a compare-and-set no-op; a non-empty server record causes a retry.
    if(current===null)return null;
    if(expectedReference!==undefined&&String(current.referenceCode||"")!==expectedReference){refusal="QR_MISMATCH";return;}
    if(expectedQuantity!==undefined&&Number(current.order?.quantity)!==expectedQuantity){refusal="ORDER_CHANGED";return;}
    const state=pickupEligibility(current,true);
    if(!state.allowed){refusal=state.code;return;}
    return {...current,status:"completed",pickup:{...current.pickup,status:"picked_up",pickedUpAt:serverTimestamp(),pickedUpBy:String(actor.username),confirmedVia:via==="qr"?"qr":"manual"}};
  },{applyLocally:false});
  if(!result.committed)throw pickupError(refusal);
  if(!result.snapshot.exists())throw pickupError("ORDER_NOT_FOUND");
  const order={id,...result.snapshot.val()};
  // Canonical transaction above is the single source of truth. An index failure
  // must never turn a successful handover into a second confirmation attempt.
  try{
    const summary=makeOrderSummary(order,serverTimestamp(),id);
    let syncTimer;
    const synchronize=runTransaction(ref(db,`orderIndex/${id}`),current=>{
      const newer=Number(current?._updatedAt||0)>=Number(order.pickup.pickedUpAt||0);
      return {...summary,payment:newer&&current?.payment?current.payment:summary.payment,pickup:summary.pickup,status:"completed",_updatedAt:serverTimestamp()};
    },{applyLocally:false});
    try{
      await Promise.race([synchronize,new Promise((_,reject)=>{syncTimer=setTimeout(()=>reject(pickupError("INDEX_SYNC_DELAYED")),8000);})]);
    }finally{clearTimeout(syncTimer);}
    return {order,indexSynced:true};
  }catch(error){return {order,indexSynced:false,indexError:error};}
}
