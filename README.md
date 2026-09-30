# Say No Plastic V6

ฟังก์ชันใหม่:
- นักเรียนล็อกอินด้วยรหัส 5/6 หลัก แล้วเข้าสู่ Student Portal
- Student Portal มี 2 ฟังก์ชัน: พรีออเดอร์ / การรับกระเป๋า
- การรับกระเป๋าถูกล็อกจนกว่า payment.status จะเป็น verified
- เมื่อฝ่ายการเงินยืนยัน ระบบสร้าง pickup code ให้โดยอัตโนมัติ
- หน้าแรกมีปุ่มพรีออเดอร์สำหรับครู
- ครูเก็บข้อมูลประจำตัวเฉพาะ ชื่อ นามสกุล เบอร์โทร และสลิป (พร้อมข้อมูลระบบของออเดอร์: จำนวน/ยอด/สถานะ)
- finance.html เป็นหน้าฝ่ายการเงินสำหรับเปิดสลิป เทียบยอดกับบัญชี และกดยืนยัน/มีปัญหา

สำคัญ: finance.html ไม่ได้เชื่อม Bank API จึงไม่สามารถรู้รายการในบัญชีธนาคารอัตโนมัติ ฝ่ายการเงินต้องเทียบสลิปกับบัญชีเอง

นำ database.rules.preorder.json ไปอัปเดต Firebase Realtime Database Rules ก่อนทดสอบ

รูปที่ระบบจะใช้ถ้ามี:
- img/sckc.png
- img/product-bag.png
หากไม่มีจะ fallback เป็น SVG

QR ในโฟลเดอร์ qr เป็น placeholder ให้แทนด้วย QR จริงของยอด 139, 278, ... 1390 บาท

## V7 UI update
- ครูเป็น Wizard 2 หน้า
  1. คำนำหน้า (นาย/นาง/นางสาว), ชื่อ, นามสกุล, เบอร์โทร
  2. จำนวน, QR, แนบสลิป และยืนยัน
- หน้าพรีออเดอร์นักเรียนและครูเป็น Full-screen step layout
- ข้อมูลคำสั่งซื้อด้านข้างถูกซ่อนเป็น drawer เปิดด้วยปุ่ม “ดูข้อมูลคำสั่งซื้อ”
- หน้ารับกระเป๋าแสดงข้อมูลนักเรียน รายละเอียดคำสั่งซื้อ และสถานะฝ่ายการเงินอย่างเด่นชัด


## V8 Premium UI
ปรับดีไซน์ใหม่โดยไม่เปลี่ยน logic หลักของระบบ:
- Landing page สวยขึ้นและสมดุลกว่าเดิม
- Student Portal และ Function Cards ดูชัดเจนขึ้น
- ฟอร์มแต่ละขั้นใช้พื้นที่หน้าจออย่างเป็นระเบียบ
- Drawer สรุปคำสั่งซื้อสวยขึ้น
- Pickup Status เน้นสถานะเด่นขึ้น
- Finance / Admin Dashboard ปรับ card, table, modal และ responsive
- Mobile UI ปรับ spacing, card radius และขนาดตัวอักษรใหม่


## V9 Compact UI
- ยกเลิกการบังคับฟอร์มแต่ละขั้นให้สูงเต็มหน้าจอ
- ลดพื้นที่ว่างด้านบน/กลาง/ล่าง
- Form card ปรับเป็นความสูงตามเนื้อหาจริง
- Teacher / Student wizard กระชับขึ้น
- Payment / Product / Review layout สมดุลขึ้น
- ปุ่ม Next / Back อยู่ต่อจากเนื้อหา ไม่ลอยติดด้านล่าง
- Mobile / Tablet ปรับ layout ใหม่


## V10
- Teacher Portal ใหม่: ค้นหาคำสั่งซื้อด้วยเบอร์โทรศัพท์
- ครูมี 2 ฟังก์ชัน: พรีออเดอร์ / การรับกระเป๋า
- พรีออเดอร์ครูแยกเป็น 3 หน้า:
  1. ข้อมูลครู
  2. เลือกจำนวน
  3. ชำระเงิน + แนบสลิป
- ฝ่ายการเงินยืนยันคำสั่งซื้อครูแล้ว ระบบสร้างรหัสรับสินค้าให้ครูด้วย
- แก้ปัญหาพรีออเดอร์นักเรียนแล้วไม่ขึ้น โดยไม่พึ่ง RTDB indexed query:
  ระบบโหลด preorders แล้วกรอง studentId ฝั่งเว็บแทน
- หลังส่งคำสั่งซื้อสำเร็จ ระบบกลับ Portal และแสดงสถานะทันที


## V11 — Multiple Orders
- นักเรียน 1 รหัสสามารถพรีออเดอร์ได้หลายรอบ
- ครู 1 เบอร์โทรสามารถพรีออเดอร์ได้หลายรอบ
- Portal แสดงคำสั่งซื้อทุกอัน ไม่ได้แสดงเฉพาะอันล่าสุด
- หน้ารับกระเป๋ามีตัวเลือกสลับดูแต่ละคำสั่งซื้อ
- แต่ละคำสั่งซื้อมีสถานะการเงินและรหัสรับสินค้าแยกกัน
- เพิ่มการป้องกันกดปุ่มยืนยันซ้ำเร็ว ๆ:
  ปุ่มจะถูก disable ระหว่างบันทึก Firebase
- ยังคงใช้ push ID ของ Firebase ทำให้แต่ละรอบเป็น order คนละรายการ


# V13 Best Complete

สิ่งที่เพิ่มจากเวอร์ชันล่าสุด

## 1. ระบบ Pickup Staff
เปิด `pickup.html`

สิทธิ์บัญชีที่เข้าได้:
- role = `pickup`
- role = `admin`

ฟังก์ชัน:
- ดูรายการที่ฝ่ายการเงินยืนยันแล้ว
- ค้นหารหัสรับสินค้า
- ค้นหารหัสนักเรียน
- ค้นหาเบอร์โทร
- ค้นหาเลขคำสั่งซื้อ
- แยกนักเรียน / ครู
- ยืนยันว่า “มอบสินค้าแล้ว”
- บันทึกวันเวลาและชื่อบัญชีเจ้าหน้าที่
- ย้อนสถานะกลับเป็นพร้อมรับได้กรณีกดผิด
- นักเรียน/ครูจะเห็นสถานะ `รับสินค้าเรียบร้อยแล้ว` ใน Portal

ตัวอย่างบัญชี:
adminAccounts
  pickup01
    username: "pickup01"
    passwordHash: "<SHA256>"
    role: "pickup"

## 2. Firebase Query เร็วขึ้น
นักเรียนใช้ index `customer/studentId`
ครูใช้ index `customer/phone`
และมี fallback เดิมถ้า Rules ยังไม่อัปเดต

Database Rules เพิ่ม index:
- customer/studentId
- customer/phone
- payment/status
- pickup/status

## 3. Admin
- เพิ่มจำนวนรายการ “รับสินค้าแล้ว”
- รองรับข้อมูลครูในตาราง/รายละเอียดดีขึ้น
- เพิ่มสถานะการรับสินค้าในตาราง
- มีลิงก์ไป Finance และ Pickup

## 4. Finance
เพิ่มลิงก์ไป Pickup และ Admin

## Workflow
พรีออเดอร์
→ รอฝ่ายการเงิน
→ ฝ่ายการเงินยืนยัน
→ pickup.status = ready
→ เจ้าหน้าที่ Pickup มอบสินค้า
→ pickup.status = picked_up
→ Portal แสดง “รับสินค้าเรียบร้อยแล้ว”

## สำคัญเรื่องความปลอดภัย
ระบบปัจจุบันยังใช้ Realtime Database จาก browser โดยตรง และ Rules เดิมเปิด read/write กว้างเพื่อให้ระบบเดิมทำงานได้
หากจะเปิดใช้งานกับข้อมูลจริงในวงกว้าง ควรย้าย Admin / Finance / Pickup ไปใช้ Firebase Authentication หรือ backend ก่อน เพื่อให้ Rules จำกัดสิทธิ์ตาม role ได้จริง


# V14 — 3 Pages Workflow

เว็บไซต์มี 3 หน้าเท่านั้น:
1. `index.html` — นักเรียน/ครู พรีออเดอร์และดูสถานะ
2. `finance.html` — ฝ่ายการเงินตรวจสลิปเท่านั้น
3. `admin.html` — แอดมินดูแลทุกอย่าง รวมการเปิดรับสินค้าและยืนยันรับสินค้า

## Workflow ใหม่
พรีออเดอร์
→ payment.status = pending
→ ฝ่ายการเงินตรวจสลิป
→ payment.status = verified
→ **ยังไม่พร้อมรับสินค้า**
→ รอจบพรีออเดอร์ / รอสินค้าพร้อม
→ Admin กด “เปิดรับสินค้า / ซิงก์รายการ”
→ verified orders เปลี่ยน pickup.status = ready
→ ผู้สั่งเห็นรหัสรับสินค้า
→ Admin เปิดรายละเอียดออเดอร์และกด “ยืนยันว่ารับแล้ว”
→ pickup.status = picked_up

## Finance
ฝ่ายการเงิน:
- เปิดดูสลิป
- เทียบยอดกับบัญชี
- บันทึกเลขอ้างอิง/หมายเหตุ
- เลือก pending / verified / rejected
- ทุกครั้งที่กดสถานะ จะมี Confirm Modal ให้ยืนยันอีกครั้ง
- **Finance ไม่สามารถเปิดรับสินค้า และไม่สร้าง pickup code**

## Admin
หน้า Admin:
- ดูยอดรวม / จำนวน / รายการทั้งหมด
- แก้สถานะการเงินได้
- เปิด/ปิดการรับสินค้าทั้งระบบ
- ซิงก์ order ที่ verified ให้ ready
- ตั้ง ready รายบุคคล
- ยืนยัน received / picked_up รายบุคคล
- ล็อกการรับสินค้า
- ดูสลิปและข้อมูลทั้งหมด

## System config
เพิ่ม:
systemConfig/
  pickupOpen: false | true
  pickupOpenedAt
  pickupOpenedBy

หาก `pickupOpen` ไม่มีค่า ระบบ index จะถือว่า **ยังไม่เปิดรับสินค้า**

## สำคัญ
ต้อง Publish `database.rules.preorder.json` เวอร์ชันนี้ใน Firebase Realtime Database Rules


## V14.1 Hotfix
แก้บั๊ก `ReferenceError: refreshPickupAvailability is not defined`
สาเหตุคือฟังก์ชันถูกวางอยู่ภายใน callback ของ event `online` ทำให้ student login เรียกใช้จาก scope ภายนอกไม่ได้

แก้แล้ว:
- ย้าย `refreshPickupAvailability()` เป็น global module function
- แยก online/offline event listener ออกจากฟังก์ชัน
- เพิ่ม try/finally ตอน student login เพื่อให้ Loading Overlay ปิดเสมอ แม้เกิดข้อผิดพลาด
