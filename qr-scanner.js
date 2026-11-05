import { parsePickupPayload, pickupMessage } from "./pickup-service.js?v=20261105-qr1";

let decoderPromise;
function decoder(){return decoderPromise??=(import("./vendor/jsqr.js?v=20261105-qr1").then(module=>module.default).catch(error=>{decoderPromise=null;throw error;}));}
export async function decodeQrPixels(data,width,height){return (await decoder())(data,width,height,{inversionAttempts:"attemptBoth"})?.data||null;}
export async function decodeQrFile(file){
  if(!file||!String(file.type||"").startsWith("image/"))throw new Error("กรุณาเลือกรูปภาพ QR");
  if(file.size>20*1024*1024)throw new Error("รูปมีขนาดเกิน 20 MB กรุณาเลือกรูปที่เล็กลง");
  const url=URL.createObjectURL(file),image=new Image();
  try{
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("เปิดรูปนี้ไม่ได้ กรุณาเลือก JPG, PNG หรือภาพหน้าจอ"));image.src=url;});
    const ratio=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const context=canvas.getContext("2d",{willReadFrequently:true});context.drawImage(image,0,0,canvas.width,canvas.height);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    const result=await decodeQrPixels(pixels.data,pixels.width,pixels.height);
    if(!result)throw new Error("ไม่พบ QR ในรูป กรุณาใช้ภาพที่เห็น QR ครบและชัดเจน");
    return result;
  }finally{URL.revokeObjectURL(url);}
}
export function createQrScanner({onQr,onManual}){
  const modal=document.getElementById("pickupScannerModal"),video=document.getElementById("pickupScannerVideo"),message=document.getElementById("pickupScannerMessage"),startButton=document.getElementById("pickupCameraStart"),stopButton=document.getElementById("pickupCameraStop"),fileInput=document.getElementById("pickupQrFile"),manual=document.getElementById("pickupQrManual");
  const canvas=document.createElement("canvas"),context=canvas.getContext("2d",{willReadFrequently:true});
  let stream=null,timer=null,generation=0,busy=false,busyTicket=0,facing="environment",previousFocus=null,lastInvalid="";
  function status(text,error=false){message.textContent=text;message.dataset.state=error?"error":"normal";}
  function stopCamera(){generation++;clearTimeout(timer);timer=null;stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;startButton.disabled=false;stopButton.disabled=true;}
  function close(){busyTicket++;busy=false;stopCamera();modal.classList.add("hidden");previousFocus?.focus();}
  async function accept(raw,manualEntry=false){
    if(busy||modal.classList.contains("hidden"))return;
    if(!manualEntry){try{parsePickupPayload(raw);}catch{if(raw!==lastInvalid){status("QR นี้ไม่ใช่คำสั่งซื้อกระเป๋า กรุณาสแกน QR จากหน้ารับกระเป๋าของผู้ซื้อ",true);lastInvalid=raw;}return;}}
    const ticket=++busyTicket;busy=true;stopCamera();status("พบข้อมูลแล้ว กำลังเปิดคำสั่งซื้อ…");
    const token=generation,context={isActive:()=>token===generation&&!modal.classList.contains("hidden")};
    try{await (manualEntry?onManual(raw,context):onQr(raw,context));if(!modal.classList.contains("hidden"))close();}
    catch(error){if(!modal.classList.contains("hidden"))status(error.userMessage||(error.code?pickupMessage(error):error.message)||"เปิดคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่",true);}
    finally{if(ticket===busyTicket)busy=false;}
  }
  async function frame(token){
    if(token!==generation||!stream||modal.classList.contains("hidden"))return;
    try{
      if(video.readyState>=2&&video.videoWidth){
        const ratio=Math.min(1,720/Math.max(video.videoWidth,video.videoHeight));
        canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);
        context.drawImage(video,0,0,canvas.width,canvas.height);
        const pixels=context.getImageData(0,0,canvas.width,canvas.height);
        const raw=await decodeQrPixels(pixels.data,pixels.width,pixels.height);
        if(token!==generation)return;
        if(raw){await accept(raw);if(token!==generation)return;}
      }
    }catch{if(token===generation)status("อ่านภาพจากกล้องไม่ได้ กรุณาเปิดกล้องใหม่หรือเลือกรูป QR",true);}
    if(token===generation)timer=setTimeout(()=>frame(token),200);
  }
  async function start(){
    if(busy||modal.classList.contains("hidden"))return;
    stopCamera();const token=generation;startButton.disabled=true;status("กำลังเปิดกล้อง…");
    if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia){startButton.disabled=false;status("กล้องต้องเปิดผ่าน HTTPS หรือ localhost คุณสามารถเลือกรูป QR หรือกรอกรหัสแทนได้",true);return;}
    let opened=null;
    try{
      await decoder();
      if(token!==generation||modal.classList.contains("hidden"))return;
      opened=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}},audio:false});
      if(token!==generation||modal.classList.contains("hidden")){opened.getTracks().forEach(track=>track.stop());return;}
      stream=opened;video.muted=true;video.srcObject=stream;await video.play();
      if(token!==generation){opened.getTracks().forEach(track=>track.stop());return;}
      stopButton.disabled=false;status("เล็ง QR ให้อยู่ในกรอบ เมื่ออ่านได้ระบบจะเปิดข้อมูลให้ตรวจสอบ");frame(token);
    }catch(error){
      opened?.getTracks().forEach(track=>track.stop());
      if(token!==generation)return;
      stopCamera();status(error.name==="NotAllowedError"?"ยังไม่ได้อนุญาตใช้กล้อง กรุณาอนุญาต หรือเลือกรูป QR แทน":error.name==="NotFoundError"?"ไม่พบกล้อง คุณสามารถเลือกรูป QR หรือกรอกรหัสแทนได้":"เปิดกล้องไม่สำเร็จ กรุณาลองใหม่ หรือเลือกรูป QR แทน",true);
    }
  }
  document.getElementById("pickupScannerClose").addEventListener("click",close);
  modal.addEventListener("click",event=>{if(event.target===modal)close();});
  startButton.addEventListener("click",start);stopButton.addEventListener("click",()=>{stopCamera();status("ปิดกล้องแล้ว");});
  document.getElementById("pickupCameraFlip").addEventListener("click",()=>{facing=facing==="environment"?"user":"environment";start();});
  fileInput.addEventListener("change",async()=>{
    const file=fileInput.files?.[0];if(!file||busy)return;
    stopCamera();status("กำลังอ่าน QR จากรูป…");
    const token=generation;
    try{const raw=await decodeQrFile(file);if(token===generation&&!modal.classList.contains("hidden"))await accept(raw);}
    catch(error){if(token===generation&&!modal.classList.contains("hidden"))status(error.message,true);}
    finally{fileInput.value="";}
  });
  document.getElementById("pickupQrManualForm").addEventListener("submit",event=>{event.preventDefault();const raw=manual.value.trim();if(raw)accept(raw,true);});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!modal.classList.contains("hidden"))close();});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&!modal.classList.contains("hidden")){stopCamera();status("หยุดกล้องชั่วคราว กดเปิดกล้องเมื่อพร้อมสแกนต่อ");}});
  window.addEventListener("pagehide",stopCamera);
  return {open(){busyTicket++;busy=false;previousFocus=document.activeElement;modal.classList.remove("hidden");manual.value="";lastInvalid="";document.getElementById("pickupScannerClose").focus();start();},close,stop:stopCamera};
}
