import { ref, get, query, orderByKey, limitToFirst, startAfter, onValue, runTransaction, update, set, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

export const ORDER_INDEX_VERSION=1;
const PAGE_SIZE=25;
const indexTasks=new WeakMap();
const readyIndexes=new WeakSet();
const customerPaths=new WeakMap();
const SUMMARY_FIELDS={
  customer:["prefix","firstName","lastName","studentId","level","room","phone","contact","displayName","role"],
  order:["unitPrice","quantity","totalAmount"],
  payment:["status","financeNote","reviewedAt","reviewedBy","bankReference"],
  pickup:["status","code","pickedUpAt","pickedUpBy"],
};
const ROOT_FIELDS=["buyerType","referenceCode","status","createdAt"];

// Deliberately copy only listing/status fields. Never copy slipData, slipMeta or image bytes.
export function makeOrderSummary(order,updatedAt=serverTimestamp()){
  const result={_updatedAt:updatedAt};
  for(const key of ROOT_FIELDS)if(order[key]!==undefined&&order[key]!==null)result[key]=order[key];
  for(const [section,fields] of Object.entries(SUMMARY_FIELDS)){
    result[section]={};
    for(const field of fields){const value=order[section]?.[field];if(value!==undefined&&value!==null)result[section][field]=value;}
  }
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
    if(!match)continue;
    const [,id,field]=match;
    if(!field){output[`orderIndex/${id}`]=value===null?null:makeOrderSummary(value);continue;}
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

// Existing orders are indexed once, in bounded pages. A failed run leaves the ready
// marker unset; the next attempt resumes safely without overwriting newer index rows.
export function prepareOrderIndex(db,onProgress=()=>{},force=false){
  if(indexTasks.has(db))return indexTasks.get(db);
  if(!force&&readyIndexes.has(db))return Promise.resolve();
  const task=(async()=>{
    if(!force){
      const marker=await get(ref(db,"systemConfig/orderIndexVersion"));
      if(marker.val()===ORDER_INDEX_VERSION){readyIndexes.add(db);return;}
    }
    const baseline=force?(await get(ref(db,"orderIndex"))).val()||{}:null;
    const seen=new Set();
    let cursor=null,count=0;
    for(;;){
      const constraints=[orderByKey(),limitToFirst(PAGE_SIZE)];
      if(cursor!==null)constraints.push(startAfter(cursor));
      const snap=await get(query(ref(db,"preorders"),...constraints));
      const entries=Object.entries(snap.val()||{}).sort(([a],[b])=>a<b?-1:a>b?1:0);
      if(!entries.length)break;
      // Small concurrency keeps the one-time conversion bounded on slow connections.
      for(let offset=0;offset<entries.length;offset+=4){
        await Promise.all(entries.slice(offset,offset+4).map(async([id,order])=>{
          seen.add(id);
          const summary=makeOrderSummary(order,0);
          await runTransaction(ref(db,`orderIndex/${id}`),current=>{
            if(current!==null&&!force)return;
            if(force&&current!==null&&(current._updatedAt??null)!==(baseline[id]?._updatedAt??null))return;
            return summary;
          },{applyLocally:false});
        }));
      }
      count+=entries.length;onProgress(count);
      cursor=entries[entries.length-1][0];
      if(entries.length<PAGE_SIZE)break;
    }
    // Manual rebuild also removes summaries for deleted orders. Re-check each original
    // before deletion so an order created during the rebuild is preserved.
    if(force){
      const existing=await get(ref(db,"orderIndex"));
      for(const id of Object.keys(existing.val()||{}))if(!seen.has(id)){
        const original=await get(ref(db,`preorders/${id}`));
        if(!original.exists())await runTransaction(ref(db,`orderIndex/${id}`),current=>
          current&&Number(current._updatedAt||0)!==Number(existing.val()[id]?._updatedAt||0)?undefined:null,{applyLocally:false});
      }
    }
    await set(ref(db,"systemConfig/orderIndexVersion"),ORDER_INDEX_VERSION);
    readyIndexes.add(db);
    customerPaths.set(db,Promise.resolve("orderIndex"));
  })();
  indexTasks.set(db,task);
  task.then(()=>indexTasks.delete(db),()=>{indexTasks.delete(db);readyIndexes.delete(db);});
  return task;
}
export function subscribeOrderSummaries(db,onData,onError,onProgress){
  let stopped=false,unsubscribe=null;
  prepareOrderIndex(db,onProgress).then(()=>{
    if(stopped)return;
    unsubscribe=onValue(ref(db,"orderIndex"),snap=>onData(snap.val()||{}),onError);
  }).catch(error=>{if(!stopped)onError(error);});
  return()=>{stopped=true;unsubscribe?.();};
}
// Customers never build an index or scan everyone's orders. Until an administrator
// has prepared the existing data, retain the indexed customer-specific legacy query.
export function customerOrderPath(db){
  if(!customerPaths.has(db))customerPaths.set(db,(async()=>{
    try{return (await get(ref(db,"systemConfig/orderIndexVersion"))).val()===ORDER_INDEX_VERSION?"orderIndex":"preorders";}
    catch{return "preorders";}
  })());
  return customerPaths.get(db);
}
