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
export function createPickupQrCard(host){
  const card=document.createElement("section");card.className="pickup-qr-card hidden";
  card.innerHTML='<div class="pickup-qr-copy"><span class="pickup-qr-kicker">ORDER QR</span><h2>QR สำหรับตรวจสอบและรับกระเป๋า</h2><p>แสดง QR นี้ให้แอดมินสแกน แล้วตรวจสอบชื่อและจำนวนก่อนรับกระเป๋า</p><strong class="pickup-qr-state"></strong><p class="pickup-qr-reference"></p><div class="pickup-qr-actions"><button type="button" data-qr-save>บันทึก QR</button><button type="button" data-qr-zoom>ขยาย QR</button></div></div><div class="pickup-qr-image"><canvas role="img" aria-label="QR คำสั่งซื้อกระเป๋า"></canvas></div>';
  host.insertBefore(card,host.querySelector('.pickup-status-hero')||host.querySelector('.pickup-ready-panel'));
  const canvas=card.querySelector("canvas"),state=card.querySelector(".pickup-qr-state"),reference=card.querySelector(".pickup-qr-reference");
  let lastPayload="",filename="order-qr";
  const download=()=>{
    if(!lastPayload)return;
    canvas.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=filename+".png";link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    },"image/png");
  };
  card.querySelector("[data-qr-save]").addEventListener("click",download);
  card.querySelector("[data-qr-zoom]").addEventListener("click",()=>{
    if(!lastPayload)return;
    const overlay=document.createElement("div");overlay.className="pickup-qr-zoom";
    overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.setAttribute("aria-label","QR คำสั่งซื้อแบบขยาย");
    const panel=document.createElement("div"),title=document.createElement("strong"),image=document.createElement("img"),close=document.createElement("button");
    title.textContent=reference.textContent;image.src=canvas.toDataURL("image/png");image.alt="QR คำสั่งซื้อ";close.type="button";close.textContent="ปิด QR แบบขยาย";
    const previousFocus=document.activeElement;
    const hide=()=>{overlay.remove();document.removeEventListener("keydown",escape);previousFocus?.focus();};
    const escape=event=>{if(event.key==="Escape")hide();};
    close.addEventListener("click",hide);overlay.addEventListener("click",event=>{if(event.target===overlay)hide();});document.addEventListener("keydown",escape);
    panel.append(title,image,close);overlay.append(panel);document.body.append(overlay);close.focus();
  });
  return {
    hide(){card.classList.add("hidden");lastPayload="";canvas.width=canvas.height=1;reference.textContent="";state.textContent="";},
    render(order,pickupOpen,loaded=true){
      if(!loaded||!order){this.hide();return;}
      card.classList.remove("hidden");
      filename="SCKC-QR-"+String(order.referenceCode||"order").replace(/[^A-Za-z0-9_-]/g,"");
      reference.textContent=`${order.referenceCode||"-"} · ${Number(order.order?.quantity||0)} ใบ`;
      try{
        const payload=makePickupPayload(order);
        if(payload!==lastPayload){paintPickupQr(canvas,payload);lastPayload=payload;}
        canvas.hidden=false;card.querySelector(".pickup-qr-actions").hidden=false;
      }catch{
        canvas.hidden=true;lastPayload="";state.textContent="ยังสร้าง QR ไม่ได้ กรุณาติดต่อเจ้าหน้าที่พร้อมเลขคำสั่งซื้อ";card.querySelector(".pickup-qr-actions").hidden=true;return;
      }
      const check=pickupEligibility(order,pickupOpen);
      const labels={READY:"พร้อมรับกระเป๋า",ALREADY_PICKED_UP:"รับกระเป๋าเรียบร้อยแล้ว",PAYMENT_NOT_VERIFIED:order.payment?.status==="rejected"?"รอตรวจสอบปัญหาการชำระเงิน":"รอฝ่ายการเงินยืนยัน",PICKUP_CLOSED:"ใช้ตรวจสอบคำสั่งซื้อได้ · รอเปิดรับกระเป๋า",ORDER_NOT_READY:"ใช้ตรวจสอบคำสั่งซื้อได้ · ยังไม่พร้อมรับ"};
      state.textContent=pickupOpen===null&&order.payment?.status==="verified"&&check.code!=="ALREADY_PICKED_UP"?"กำลังตรวจสอบสถานะรับสินค้า":labels[check.code]||"ใช้ตรวจสอบคำสั่งซื้อกับแอดมิน";
      state.dataset.state=check.allowed?"ready":check.code==="ALREADY_PICKED_UP"?"done":"waiting";
    }
  };
}
