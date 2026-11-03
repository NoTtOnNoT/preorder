export function createOrderControls(host,tableBody,onRetry,onRebuild,onPage){
  let page=1;
  const bar=document.createElement("div");bar.className="order-data-status";
  const message=document.createElement("span");message.setAttribute("role","status");message.setAttribute("aria-live","polite");
  const retry=document.createElement("button");retry.type="button";retry.textContent="ลองโหลดใหม่";retry.hidden=true;
  const rebuild=document.createElement("button");rebuild.type="button";rebuild.textContent="ซิงก์ข้อมูลเดิม";rebuild.hidden=true;
  retry.addEventListener("click",onRetry);
  rebuild.addEventListener("click",()=>{
    if(confirm("ซิงก์ข้อมูลเดิมจะอ่านออเดอร์ทั้งหมดหนึ่งรอบ ใช้เมื่อมีการแก้ข้อมูลใน Firebase โดยตรง หรือรายการไม่ครบ ต้องการดำเนินการหรือไม่?"))onRebuild();
  });
  bar.append(message,retry,rebuild);host.prepend(bar);
  const pager=document.createElement("div");pager.className="order-list-pager";
  const previous=document.createElement("button");previous.type="button";previous.textContent="← ก่อนหน้า";
  const count=document.createElement("span");count.setAttribute("aria-live","polite");
  const next=document.createElement("button");next.type="button";next.textContent="ถัดไป →";
  pager.append(previous,count,next);(tableBody.closest(".table-wrap, .table-scroll")||tableBody.closest("table")).after(pager);
  previous.addEventListener("click",()=>{page=Math.max(1,page-1);onPage();});
  next.addEventListener("click",()=>{page++;onPage();});
  return {
    loading(n){bar.dataset.state="loading";message.textContent=n?`กำลังเตรียมรายการเดิม… ${n} รายการ`:"กำลังโหลดรายการ…";retry.hidden=true;rebuild.hidden=true;},
    error(error){bar.dataset.state="error";message.textContent=String(error?.code||error?.message||"").toLowerCase().includes("permission")?"ไม่สามารถเข้าถึงข้อมูลได้ กรุณาติดต่อผู้ดูแลระบบ":"โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง";retry.hidden=false;rebuild.hidden=true;},
    ready(){bar.dataset.state="ready";message.textContent="รายการพร้อมใช้งาน";retry.hidden=true;rebuild.hidden=false;},
    resetPage(){page=1;},
    page(items){const pages=Math.max(1,Math.ceil(items.length/50));page=Math.min(page,pages);previous.disabled=page<=1;next.disabled=page>=pages;count.textContent=`หน้า ${page}/${pages} · ${items.length} รายการ`;return items.slice((page-1)*50,page*50);}
  };
}
