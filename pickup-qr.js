import qrcode from "./vendor/qrcode-generator.js?v=20261105-qr1";
import { makePickupPayload, pickupEligibility } from "./pickup-service.js?v=20261105-qr1";

export function paintPickupQr(canvas,payload,scale=8){
  const qr=qrcode(0,"M");qr.addData(payload,"Byte");qr.make();
  const quiet=4,n=qr.getModuleCount();
  canvas.width=canvas.height=(n+quiet*2)*scale;
  const context=canvas.getContext("2d");
  context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle="#111";
  for(let row=0;row<n;row++)for(let col=0;col<n;col++)if(qr.isDark(row,col))context.fillRect((col+quiet)*scale,(row+quiet)*scale,scale,scale);
  return canvas;
}
export function pickupPresentation(order,pickupOpen,configStatus="ready"){
  const check=pickupEligibility(order,pickupOpen);
  if(check.code==="ALREADY_PICKED_UP")return {state:"done",badge:"รับกระเป๋าแล้ว",title:"รับกระเป๋าเรียบร้อยแล้ว",help:"รายการนี้ได้รับการยืนยันรับจากสภานักเรียนแล้ว",qrLabel:"QR ของรายการที่รับแล้ว",qrHint:"รายการนี้ไม่สามารถยืนยันรับซ้ำได้"};
  if(order.payment?.status==="rejected")return {state:"issue",badge:"ตรวจสอบการชำระเงิน",title:"การชำระเงินมีปัญหา",help:order.payment.financeNote||"กรุณาติดต่อฝ่ายการเงินเพื่อตรวจสอบรายการนี้",qrLabel:"QR สำหรับตรวจสอบคำสั่งซื้อ",qrHint:"ใช้เปิดข้อมูลกับสภานักเรียนได้"};
  if(!["pending","verified"].includes(order.payment?.status))return {state:"checking",badge:"ยังยืนยันสถานะเงินไม่ได้",title:"รอตรวจสอบข้อมูลคำสั่งซื้อ",help:"กรุณาติดต่อฝ่ายการเงินเพื่อตรวจสอบรายการนี้",qrLabel:"QR สำหรับตรวจสอบคำสั่งซื้อ",qrHint:"ใช้เปิดข้อมูลกับสภานักเรียนได้"};
  if(order.payment?.status!=="verified")return {state:"pending",badge:"รอตรวจสอบการชำระเงิน",title:"รอฝ่ายการเงินตรวจสอบ",help:"มีคำสั่งซื้อแล้ว รอผลตรวจการชำระเงิน คุณเปิด QR นี้ให้สภานักเรียนตรวจสอบได้",qrLabel:"QR สำหรับตรวจสอบคำสั่งซื้อ",qrHint:"ยังไม่ใช่รายการพร้อมรับกระเป๋า"};
  if(pickupOpen===null||configStatus!=="ready")return {state:"checking",badge:configStatus==="error"?"ยังตรวจสอบสถานะรับไม่ได้":"กำลังตรวจสอบสถานะ",title:"กำลังตรวจสอบการรับกระเป๋า",help:configStatus==="error"?"กรุณากดลองโหลดใหม่จากข้อความด้านบน":"กรุณารอสักครู่ ระบบกำลังตรวจสอบการเปิดรับสินค้า",qrLabel:"QR ของคำสั่งซื้อคุณ",qrHint:"รอยืนยันความพร้อมรับสินค้า"};
  if(check.allowed)return {state:"ready",badge:"พร้อมรับกระเป๋า",title:"แสดง QR นี้ที่จุดรับกระเป๋า",help:"ให้สภานักเรียนสแกน QR แล้วรอผลยืนยันก่อนรับกระเป๋า",qrLabel:"แสดงให้สภานักเรียนสแกน",qrHint:"กดขยาย QR เพื่อให้สแกนง่ายขึ้น"};
  return {state:"waiting",badge:pickupOpen?"รอสภานักเรียนเตรียมรับ":"ชำระเงินผ่านแล้ว",title:pickupOpen?"รอสภานักเรียนเตรียมรายการ":"ชำระเงินผ่านแล้ว รอเปิดรับ",help:pickupOpen?"ชำระเงินเรียบร้อยแล้ว รอสภานักเรียนปรับรายการให้พร้อมรับ":"กรุณาตรวจสอบวัน–เวลารับกระเป๋าจากตารางด้านล่าง และติดตามสถานะได้ที่นี่",qrLabel:"QR สำหรับตรวจสอบคำสั่งซื้อ",qrHint:"เก็บ QR นี้ไว้ใช้ในวันรับกระเป๋า"};
}
export function createPickupQrCard(host){
  const oldHero=host.querySelector('.pickup-status-hero'),oldReady=host.querySelector('.pickup-ready-panel');
  const card=document.createElement("section");card.className="pickup-qr-card pickup-focus-card hidden";
  card.innerHTML=`<div class="qr-focus-top"><span class="qr-focus-kicker">บัตรรับกระเป๋าของคุณ</span><strong class="pickup-qr-state" aria-live="polite"></strong></div>
    <div class="qr-focus-layout"><div class="qr-focus-content"><h2 class="qr-focus-title"></h2><p class="qr-focus-help"></p>
    <div class="qr-recipient"><div class="qr-recipient-copy"><span class="qr-field-label">ผู้รับกระเป๋า</span><h3 class="qr-owner-name"></h3><p class="qr-owner-meta"></p></div><div class="qr-quantity"><span class="qr-field-label">จำนวนกระเป๋า</span><strong><b class="qr-quantity-number"></b><span>ใบ</span></strong></div></div>
    <div class="qr-receipt-info" hidden><span aria-hidden="true">✓</span><div><strong class="qr-received-time"></strong><small class="qr-received-staff"></small></div></div>
    <div class="pickup-qr-actions"><button type="button" data-qr-zoom>ขยาย QR ให้สภานักเรียนสแกน ↗</button><button type="button" data-qr-save>บันทึก QR</button></div>
    <div class="qr-secondary-reference"><span>เลขคำสั่งซื้อ</span><p class="pickup-qr-reference"></p><small class="qr-order-amount"></small></div></div>
    <div class="qr-focus-code"><strong class="qr-code-label"></strong><div class="pickup-qr-image"><canvas role="img" aria-label="QR คำสั่งซื้อกระเป๋า"></canvas><p class="qr-canvas-error" hidden></p></div><p class="qr-code-hint"></p><div class="qr-backup" hidden><span>รหัสสำรอง หากสแกนไม่ได้</span><strong class="qr-backup-code"></strong></div></div></div>`;
  host.insertBefore(card,oldHero||oldReady);
  const canvas=card.querySelector("canvas"),state=card.querySelector(".pickup-qr-state"),reference=card.querySelector(".pickup-qr-reference");
  let lastPayload="",filename="order-qr",zoomTitle="";
  const text=(selector,value)=>{card.querySelector(selector).textContent=value;};
  card.querySelector("[data-qr-save]").addEventListener("click",()=>{
    if(!lastPayload)return;
    canvas.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=filename+".png";link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    },"image/png");
  });
  card.querySelector("[data-qr-zoom]").addEventListener("click",()=>{
    if(!lastPayload)return;
    const overlay=document.createElement("div");overlay.className="pickup-qr-zoom";
    overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","QR คำสั่งซื้อแบบขยาย");
    const panel=document.createElement("div"),title=document.createElement("strong"),image=document.createElement("img"),close=document.createElement("button");
    title.textContent=zoomTitle;image.src=canvas.toDataURL("image/png");image.alt="QR คำสั่งซื้อ";close.type="button";close.textContent="ปิด QR แบบขยาย";
    const previousFocus=document.activeElement;
    const hide=()=>{overlay.remove();document.removeEventListener("keydown",escape);previousFocus?.focus();};
    const escape=event=>{if(event.key==="Escape")hide();};
    close.addEventListener("click",hide);overlay.addEventListener("click",event=>{if(event.target===overlay)hide();});document.addEventListener("keydown",escape);
    panel.append(title,image,close);overlay.append(panel);document.body.append(overlay);close.focus();
  });
  return {
    hide(){card.classList.add("hidden");lastPayload="";canvas.width=canvas.height=1;reference.textContent="";state.textContent="";if(oldHero)oldHero.hidden=false;if(oldReady)oldReady.hidden=false;},
    render(order,pickupOpen,loaded=true,configStatus="ready"){
      if(!loaded||!order){this.hide();return;}
      card.classList.remove("hidden");if(oldHero)oldHero.hidden=true;if(oldReady)oldReady.hidden=true;
      const view=pickupPresentation(order,pickupOpen,configStatus),customer=order.customer||{};
      const name=customer.displayName||`${customer.prefix||""}${customer.firstName||""} ${customer.lastName||""}`.trim()||"ผู้สั่งซื้อ";
      const quantity=Number(order.order?.quantity||0);
      card.dataset.state=view.state;state.dataset.state=view.state;state.textContent=view.badge;
      text(".qr-focus-title",view.title);text(".qr-focus-help",view.help);text(".qr-owner-name",name);text(".qr-quantity-number",String(quantity));
      text(".qr-owner-meta",customer.studentId?`รหัส ${customer.studentId}${customer.level?` · ${customer.level}${customer.room?` / ห้อง ${customer.room}`:""}`:""}`:order.buyerType==="director"?"รายการสนับสนุนของผู้อำนวยการโรงเรียน":order.buyerType==="teacher"?"บัญชีผู้สั่งซื้อสำหรับครู":"ผู้สั่งซื้อ");
      reference.textContent=order.referenceCode||"-";
      text(".qr-order-amount",`ยอดชำระ ฿${Number(order.order?.totalAmount||0).toLocaleString("th-TH")}`);
      text(".qr-code-label",view.qrLabel);text(".qr-code-hint",view.qrHint);
      const receipt=card.querySelector(".qr-receipt-info");receipt.hidden=view.state!=="done"||typeof order.pickup?.pickedUpAt!=="number";
      if(!receipt.hidden){
        text(".qr-received-time",`รับเมื่อ ${new Intl.DateTimeFormat("th-TH",{dateStyle:"medium",timeStyle:"short"}).format(new Date(order.pickup.pickedUpAt))}`);
        text(".qr-received-staff",order.pickup.pickedUpBy?`ยืนยันโดย ${order.pickup.pickedUpBy}`:"สภานักเรียนยืนยันรับสินค้าแล้ว");
      }
      const backup=card.querySelector(".qr-backup");backup.hidden=view.state!=="ready"||!order.pickup?.code;
      text(".qr-backup-code",order.pickup?.code||"");
      card.querySelector("[data-qr-zoom]").textContent=view.state==="done"?"ดู QR ของรายการนี้ ↗":"ขยาย QR ให้สภานักเรียนสแกน ↗";
      filename="SCKC-QR-"+String(order.referenceCode||"order").replace(/[^A-Za-z0-9_-]/g,"");
      zoomTitle=`${name} · ${quantity} ใบ${view.state==="done"?" · รับแล้ว":""}`;
      try{
        const payload=makePickupPayload(order);
        if(payload!==lastPayload){paintPickupQr(canvas,payload);lastPayload=payload;}
        canvas.hidden=false;card.querySelector(".qr-canvas-error").hidden=true;card.querySelector(".pickup-qr-actions").hidden=false;
      }catch{
        canvas.hidden=true;lastPayload="";const error=card.querySelector(".qr-canvas-error");error.hidden=false;error.textContent="ยังสร้าง QR ไม่ได้ กรุณาติดต่อสภานักเรียนพร้อมเลขคำสั่งซื้อ";card.querySelector(".pickup-qr-actions").hidden=true;
      }
    }
  };
}
