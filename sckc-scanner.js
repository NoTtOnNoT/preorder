import { decodeQrPixels, decodeQrFile } from "./qr-scanner.js?v=20261105-qr1";
import { parsePickupPayload } from "./pickup-service.js?v=20261105-sckc1";

// A normal page section, never a popup/dialog/iframe. Camera requests originate
// directly from the user's Open Camera button, before any awaited decoder work.
export function createStationScanner({video,message,onResult,onControls}){
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
  let active=false,stream=null,timer=null,epoch=0,busy=false,facing="environment",lastInvalid="";
  const say=(text,error=false)=>{message.textContent=text;message.dataset.state=error?"error":"normal";};
  const controls=(running=false,opening=false)=>onControls?.({running,opening,busy});
  function stop(){epoch++;clearTimeout(timer);timer=null;stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;controls();}
  async function accept(raw,token=epoch){
    if(!active||busy||token!==epoch)return;
    try{parsePickupPayload(raw);}catch{if(raw!==lastInvalid){say("QR นี้ไม่ใช่คำสั่งซื้อกระเป๋า กรุณาใช้ QR จากหน้ารับกระเป๋าของผู้ซื้อ",true);lastInvalid=raw;}return;}
    stop();busy=true;const work=epoch;controls();say("พบ QR แล้ว กำลังเปิดชื่อและจำนวนกระเป๋า…");
    try{await onResult(raw,{isActive:()=>active&&epoch===work});}
    catch(error){if(active&&epoch===work)say(error.userMessage||error.message||"เปิดรายการไม่สำเร็จ กรุณาลองอีกครั้ง",true);}
    finally{if(epoch===work){busy=false;controls();}}
  }
  async function frame(token){
    if(!active||token!==epoch||!stream||busy)return;
    try{
      if(video.readyState>=2&&video.videoWidth){
        const ratio=Math.min(1,720/Math.max(video.videoWidth,video.videoHeight));
        canvas.width=Math.max(1,Math.round(video.videoWidth*ratio));canvas.height=Math.max(1,Math.round(video.videoHeight*ratio));
        ctx.drawImage(video,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        const raw=await decodeQrPixels(pixels.data,pixels.width,pixels.height);
        if(token!==epoch||!active)return;
        if(raw){await accept(raw,token);if(token!==epoch)return;}
      }
    }catch{if(token===epoch)say("อ่านภาพจากกล้องไม่ได้ กดเปิดกล้องใหม่หรือเลือกรูป QR",true);}
    if(token===epoch&&active)timer=setTimeout(()=>frame(token),200);
  }
  async function start(){
    if(!active||busy||document.hidden)return;
    stop();const token=epoch;controls(false,true);say("กำลังขออนุญาตกล้อง กรุณากดอนุญาตในข้อความของเบราว์เซอร์");
    if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia){controls();say("กล้องต้องเปิดผ่าน HTTPS กรุณาเปิดเว็บโดยตรงใน Chrome หรือ Safari หรือเลือกรูป QR แทน",true);return;}
    let opened;
    try{
      const request=navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});
      opened=await request;
      if(token!==epoch||!active){opened.getTracks().forEach(track=>track.stop());return;}
      stream=opened;video.muted=true;video.srcObject=opened;await video.play();
      if(token!==epoch||!active){opened.getTracks().forEach(track=>track.stop());return;}
      controls(true);say("สแกน QR ให้อยู่ในกรอบ ระบบจะเปิดชื่อและจำนวนให้ตรวจสอบ");frame(token);
    }catch(error){
      opened?.getTracks().forEach(track=>track.stop());if(token!==epoch)return;stop();
      say(error.name==="NotAllowedError"?"ยังไม่ได้รับอนุญาตกล้อง เปิดการตั้งค่าเว็บไซต์ > กล้อง > อนุญาต แล้วกดเปิดกล้องอีกครั้ง หรือเลือกรูป QR แทน":error.name==="NotFoundError"?"ไม่พบกล้อง เลือกรูป QR หรือค้นหารหัสแทนได้":error.name==="NotReadableError"?"กล้องอาจถูกใช้งานอยู่ ปิดแอปที่ใช้กล้องแล้วลองใหม่":"เปิดกล้องไม่สำเร็จ ลองเปิดเว็บโดยตรงใน Chrome หรือ Safari หรือเลือกรูป QR แทน",true);
    }
  }
  return {
    activate(){stop();active=true;busy=false;lastInvalid="";controls();say("กดเปิดกล้อง แล้วกดอนุญาตในข้อความของเบราว์เซอร์");},
    deactivate(){active=false;busy=false;stop();},start,stop,
    flip(){if(active&&!busy){facing=facing==="environment"?"user":"environment";start();}},
    async file(file){
      if(!file||!active||busy)return;stop();busy=true;controls();const token=epoch;say("กำลังอ่าน QR จากรูป…");
      try{const raw=await decodeQrFile(file);if(token===epoch&&active){busy=false;await accept(raw,token);}}
      catch(error){if(token===epoch&&active)say(error.message||"อ่านรูปไม่ได้ กรุณาลองใหม่",true);}
      finally{if(token===epoch){busy=false;controls();}}
    },
    pause(){if(active){busy=false;stop();say("หยุดกล้องแล้ว กดเปิดกล้องเมื่อพร้อมสแกนต่อ");}},
    refresh(){controls(!!stream,false);},
    get active(){return active;}
  };
}
