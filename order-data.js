import { ref, get, onValue, runTransaction, update, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

export const ORDER_INDEX_VERSION=2;
const indexTasks=new WeakMap();
const SUMMARY_FIELDS={
  customer:["prefix","firstName","lastName","studentId","level","room","phone","contact","displayName","role"],
  order:["unitPrice","quantity","totalAmount"],
  payment:["status","financeNote","reviewedAt","reviewedBy","bankReference"],
  pickup:["status","code","pickedUpAt","pickedUpBy"],
};
const ROOT_FIELDS=["buyerType","referenceCode","status","createdAt"];

// Deliberately copy only listing/status fields. Never copy slipData, slipMeta or image bytes.
export function makeOrderSummary(order,updatedAt=serverTimestamp(),fallbackId="รายการเดิม"){
  if(!order||typeof order!=="object"||Array.isArray(order))throw new Error("Invalid order record: "+fallbackId);
  const result={_updatedAt:updatedAt};
  for(const key of ROOT_FIELDS)if(order[key]!==undefined&&order[key]!==null)result[key]=order[key];
  for(const [section,fields] of Object.entries(SUMMARY_FIELDS)){
    result[section]={};
    for(const field of fields){const value=order[section]?.[field];if(value!==undefined&&value!==null)result[section][field]=value;}
  }
  result.buyerType ||= order.customer?.studentId?"student":order.customer?.phone?"teacher":"unknown";
  result.referenceCode ||= fallbackId;
  result.createdAt ??= 0;
  if(!Object.keys(result.customer).length)result.customer.displayName="ข้อมูลผู้สั่งซื้อไม่ครบ";
  result.order.quantity ??= 0;
  result.order.totalAmount ??= 0;
  result.payment.status ||= "pending";
  result.pickup.status ||= "locked";
  return result;
}
function summaryField(path){
  if(ROOT_FIELDS.includes(path))return true;
  const [section,field,...rest]=path.split("/");
  return !!SUMMARY_FIELDS[section]?.includes(field)&&(!rest.length||field==="contact");
}
// Update the real order and its small listing atomically. Patch only changed fields so
// a finance edit cannot overwrite a pickup change made by another administrator.
export function indexedRootUpdates(input){
  const output={...input},touched=new Set();
  for(const [path,value] of Object.entries(input)){
    const match=/^preorders\/([^/]+)(?:\/(.+))?$/.exec(path);
    if(path==="preorders"||path==="orderSlips"||path==="orderIndex")throw new Error("Refusing collection replacement");
    if(!match)continue;
    const [,id,field]=match;
    if(!field){
      if(value===null)throw new Error("Refusing order deletion");
      output[`orderIndex/${id}`]=makeOrderSummary(value,serverTimestamp(),id);continue;
    }
    if(summaryField(field)){output[`orderIndex/${id}/${field}`]=value;touched.add(id);}
  }
  for(const id of touched)output[`orderIndex/${id}/_updatedAt`]=serverTimestamp();
  return output;
}
export function updateIndexedRoot(db,input){return update(ref(db),indexedRootUpdates(input));}
export function updateIndexedOrder(db,id,patch,prefix=""){
  const updates={};
  for(const [key,value] of Object.entries(patch))updates[`preorders/${id}/${prefix?prefix+"/":""}${key}`]=value;
  return updateIndexedRoot(db,updates);
}
export async function loadOrderDetail(db,id){
  const snap=await get(ref(db,`preorders/${id}`));
  return snap.exists()?{id,...snap.val()}:null;
}

function isCompleteSummary(value){
  return !!value&&typeof value==="object"&&typeof value.buyerType==="string"
    &&typeof value.referenceCode==="string"&&value.createdAt!==undefined
    &&value.customer&&Object.keys(value.customer).length>0
    &&value.order&&value.order.quantity!==undefined&&value.order.totalAmount!==undefined
    &&typeof value.payment?.status==="string"&&typeof value.pickup?.status==="string"
    &&!value.payment.slipData&&!value.payment.slipMeta;
}
function fingerprint(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+fingerprint(value[key])).join(",")+"}";
}
function mergeConcurrentSummary(original,current,id){
  const merged={...original,...current};
  for(const section of Object.keys(SUMMARY_FIELDS))merged[section]={...original[section],...current?.[section]};
  return makeOrderSummary(merged,current?._updatedAt??0,id);
}
function incompleteError(ids){
  const error=new Error("Order summaries are incomplete");
  error.code="INDEX_REPAIR_INCOMPLETE";error.missingCount=ids.length;error.orderIds=ids;
  return error;
}
// Fetch ONLY source keys, without order bodies or receipt images. Unlike an SDK cached
// snapshot, this server request must succeed before we declare the listing complete.
async function sourceOrderKeys(db){
  const base=db.app?.options?.databaseURL||firebaseConfig.databaseURL;
  if(!base)throw new Error("Missing database URL");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(base.replace(/\/+$/,"")+"/preorders.json?shallow=true",{
      method:"GET",cache:"no-store",credentials:"omit",signal:controller.signal
    });
    if(!response.ok){const error=new Error("Unable to verify original orders");error.code=[401,403].includes(response.status)?"PERMISSION_DENIED":"DATABASE_READ_FAILED";throw error;}
    const keys=await response.json();
    if(keys===null)return [];
    if(typeof keys!=="object"||Array.isArray(keys))throw new Error("Original order collection has an unexpected format");
    return Object.keys(keys);
  }finally{clearTimeout(timeout);}
}
// Never trust the old version marker by itself. Compare every source key with the
// small listing, repair missing/partial rows, and verify again before showing totals.
// These maintenance operations NEVER write to preorders or orderSlips, and NEVER delete.
export function prepareOrderIndex(db,onProgress=()=>{},force=false){
  if(indexTasks.has(db))return indexTasks.get(db);
  const task=(async()=>{
    let keys=await sourceOrderKeys(db);
    let baseline=(await get(ref(db,"orderIndex"))).val()||{};
    const errors=new Map();
    for(let round=0;round<3;round++){
      const targets=keys.filter(id=>(force&&round===0)||!isCompleteSummary(baseline[id]));
      let done=keys.length-targets.length;
      onProgress(done,keys.length);
      for(let offset=0;offset<targets.length;offset+=4){
        await Promise.all(targets.slice(offset,offset+4).map(async id=>{
          try{
            const original=await get(ref(db,`preorders/${id}`));
            if(!original.exists())return; // source may have been removed manually meanwhile
            const summary=makeOrderSummary(original.val(),0,id);
            await runTransaction(ref(db,`orderIndex/${id}`),current=>{
              if(fingerprint(current)===fingerprint(baseline[id]??null))return summary;
              // A concurrent status update wins. Complete rows can be kept; partial
              // updates are merged into the full source summary instead of skipped.
              if(isCompleteSummary(current))return;
              return mergeConcurrentSummary(summary,current,id);
            },{applyLocally:false});
            errors.delete(id);done++;onProgress(done,keys.length);
          }catch(error){errors.set(id,error);}
        }));
      }
      keys=await sourceOrderKeys(db);
      baseline=(await get(ref(db,"orderIndex"))).val()||{};
      const missing=keys.filter(id=>!isCompleteSummary(baseline[id]));
      if(!missing.length){
        await set(ref(db,"systemConfig/orderIndexVersion"),ORDER_INDEX_VERSION);
        return new Set(keys);
      }
      if(round===2){
        const error=incompleteError(missing);error.causes=Object.fromEntries(errors);throw error;
      }
    }
  })();
  indexTasks.set(db,task);
  task.then(()=>indexTasks.delete(db),()=>indexTasks.delete(db));
  return task;
}
export function subscribeOrderSummaries(db,onData,onError,onProgress){
  let stopped=false,unsubscribe=null,revision=0,known=new Set(),repairing=null;
  const excluded=new Set();
  prepareOrderIndex(db,onProgress).then(keys=>{
    if(stopped)return;known=keys;
    const consume=async snap=>{
      const current=++revision,raw=snap.val()||{};
      try{
        // New orders written after the initial key check are included as soon as
        // their originals exist. Old orphan summaries are retained in Firebase but hidden.
        const unknown=Object.keys(raw).filter(id=>!known.has(id)&&!excluded.has(id));
        for(let offset=0;offset<unknown.length;offset+=4){
          await Promise.all(unknown.slice(offset,offset+4).map(async id=>{
            const original=await get(ref(db,`preorders/${id}`));
            if(original.exists())known.add(id);else excluded.add(id);
          }));
        }
        if(stopped||current!==revision)return;
        const missing=[...known].filter(id=>!isCompleteSummary(raw[id]));
        if(missing.length){
          if(!repairing)repairing=prepareOrderIndex(db,onProgress).then(next=>{known=next;}).finally(()=>repairing=null);
          await repairing;
          if(stopped||current!==revision)return;
          const verified=await get(ref(db,"orderIndex"));
          if(stopped||current!==revision)return;
          return consume(verified);
        }
        onData(Object.fromEntries(Object.entries(raw).filter(([id])=>known.has(id))));
      }catch(error){if(!stopped&&current===revision)onError(error);}
    };
    unsubscribe=onValue(ref(db,"orderIndex"),consume,error=>{if(!stopped)onError(error);});
  }).catch(error=>{if(!stopped)onError(error);});
  return()=>{stopped=true;revision++;unsubscribe?.();};
}
// The customer's own original orders are authoritative. Never report "no order"
// just because a shared summary index is incomplete. This remains an indexed,
// customer-specific query; it does not scan other people's orders.
export function customerOrderPath(){return Promise.resolve("preorders");}
