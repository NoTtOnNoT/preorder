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


## V14.2 — Role Access

กำหนดสิทธิ์หน้าเว็บตาม role:

### `admin`
- เข้า `admin.html` ได้
- เข้า `finance.html` ได้
- จัดการระบบทั้งหมด

### `admin_finance`
- เข้า `finance.html` ได้เท่านั้น
- เข้า `admin.html` ไม่ได้

### `finance`
- เข้า `finance.html` ได้เท่านั้น
- คงรองรับชื่อ role เดิมไว้

ตัวอย่าง:
```json
{
  "adminAccounts": {
    "finance01": {
      "role": "admin_finance",
      "passwordHash": "SHA256..."
    },
    "admin01": {
      "role": "admin",
      "passwordHash": "SHA256..."
    }
  }
}
```

หมายเหตุ: นี่เป็นการจำกัดสิทธิ์ที่หน้าเว็บ/JavaScript
หากต้องการความปลอดภัยระดับฐานข้อมูลจริง ต้องใช้ Firebase Authentication หรือ backend แล้วล็อก RTDB Rules ตาม role


## V17 — QR ตามจำนวนสินค้า
ระบบเลือก QR อัตโนมัติตามจำนวนที่เลือก:
- 1 ใบ → `qr/qr-1.png`
- 2 ใบ → `qr/qr-2.png`
- ...
- 10 ใบ → `qr/qr-10.png`

ใช้กับทั้งนักเรียนและครู
หากไม่พบไฟล์ PNG ระบบจะ fallback ไปที่ `payment-qr.svg`


## V18 — ราคาใหม่ 129 บาท
ปรับราคาต่อใบจาก 139 บาท เป็น 129 บาทแล้วทั้งระบบ

ยอดใหม่:
- 1 ใบ = 129 บาท
- 2 ใบ = 258 บาท
- 3 ใบ = 387 บาท
- 4 ใบ = 516 บาท
- 5 ใบ = 645 บาท
- 6 ใบ = 774 บาท
- 7 ใบ = 903 บาท
- 8 ใบ = 1,032 บาท
- 9 ใบ = 1,161 บาท
- 10 ใบ = 1,290 บาท

ต้อง Publish `database.rules.preorder.json` ใหม่ใน Firebase Realtime Database Rules


## V19 — Teacher Summary + Persistent Login + Realtime

### Teacher preorder 5 steps
1. เบอร์โทรศัพท์
2. ข้อมูลครู
3. เลือกจำนวน
4. ชำระเงิน + แนบสลิป
5. สรุปและยืนยัน

- เบอร์โทรเป็นตัวระบุคุณครู คล้ายรหัสนักเรียน
- จดจำเบอร์ครูไว้ 7 วัน
- หน้า Summary แสดงชื่อ เบอร์ จำนวน ยอด และสลิป
- Progress ด้านบนเป็น 5 ขั้นในแถวเดียว ไม่ตกคนละบรรทัด

### Persistent login
- นักเรียนเข้าสู่ระบบแล้วจะจำ Session 7 วัน
- รีเฟรชหน้าเว็บแล้วกลับเข้า Student Portal ได้อัตโนมัติ
- Logout จะลบ Session
- เบอร์คุณครูถูกจดจำ 7 วันและเติมให้อัตโนมัติ

### Realtime
- Student orders ใช้ Firebase `onValue()` แบบ realtime
- Teacher orders ใช้ Firebase `onValue()` ตามเบอร์โทร
- `systemConfig/pickupOpen` ใช้ realtime เช่นกัน
- เมื่อฝ่ายการเงินหรือ Admin เปลี่ยนสถานะ หน้าเว็บผู้ใช้จะอัปเดตทันทีโดยไม่ต้อง Refresh


## V19.1 Hotfix
แก้ `Uncaught SyntaxError: Unexpected token '}'` ใน `app.js` บริเวณฟังก์ชัน `saveTeacherDraft()`

สาเหตุ:
มีโค้ด `localStorage.setItem(...)` ซ้ำและมี `}` เกินมา 1 ตัวจากการรวมโค้ด V19

แก้แล้ว:
- ลบโค้ดซ้ำ
- ปิดฟังก์ชัน `saveTeacherDraft()` ให้ถูกต้อง
- ตรวจ `app.js`, `admin.js`, `finance.js`, `firebase-config.js` ด้วย `node --check` แล้วผ่านทั้งหมด


## V20 — Teacher Login → Portal + Name Profiles

### Teacher
Flow ใหม่:
หน้าแรก
→ กด “สำหรับคุณครู”
→ กรอกเบอร์โทรศัพท์
→ Teacher Portal
→ พรีออเดอร์ / รายการพรีออเดอร์ของฉัน

- เบอร์โทรทำหน้าที่เป็นรหัสล็อกอินของครู
- Session ครูจำไว้ 7 วัน
- เมื่อเคยพรีออเดอร์แล้ว Teacher Portal จะแสดงคำนำหน้า + ชื่อ + นามสกุลจากออเดอร์ล่าสุด
- เวลาเริ่มพรีออเดอร์ใหม่ ระบบเติมข้อมูลชื่อครูเดิมให้อัตโนมัติ
- Teacher preorder เหลือ 4 ขั้น: ข้อมูลครู → จำนวน → ชำระเงิน → สรุป

### Student
- หลังล็อกอินด้วยรหัสนักเรียน ถ้าเคยพรีออเดอร์แล้ว Student Portal จะแสดงชื่อจากออเดอร์ล่าสุด
- ถ้ายังไม่เคยพรีออเดอร์ จะแสดงรหัสนักเรียนแทน
- Realtime ยังทำงานเหมือนเดิม เมื่อ Finance/Admin อัปเดตสถานะ หน้า Portal จะอัปเดตเอง


## V20.1 Hotfix
แก้ SyntaxError ที่ `app.js` บรรทัดประมาณ 908

สาเหตุ:
บรรทัด event ของปุ่มย้อนกลับ Teacher มีโค้ดซ้ำท้ายบรรทัด:
`renderTeacherHub();showScreen("teacherHubScreen");});`

แก้แล้วให้เหลือ event listener เพียงชุดเดียว


## V20.2 — Audited Hotfix

แก้ Error:
`TypeError: Cannot set properties of null (setting 'textContent')`

สาเหตุ:
HTML เปลี่ยนจาก `#hubStudentId` ไปใช้ `#studentHubGreeting`
แต่ `app.js` ยังมีโค้ดเก่าที่พยายามเขียนค่าให้ `hubStudentId`
จึงได้ค่า `null` และหยุดทำงานตอนกดเข้าสู่ระบบนักเรียน

แก้แล้ว:
- เปลี่ยนไปใช้ `studentHubGreeting`
- ปรับข้อความ Student Portal ให้แสดงรหัสชั่วคราวก่อน
- เมื่อโหลดออเดอร์เดิมได้ ระบบเปลี่ยนเป็นชื่อจริงอัตโนมัติ
- ตรวจ ID ที่ JavaScript เรียกเทียบกับ HTML ทั้งไฟล์
- ตรวจ duplicate ID
- ตรวจ event target
- ตรวจ syntax ของ app/admin/finance/firebase-config


## V20.3 — Website Visitor / Page View Counter

เพิ่มระบบสถิติการเปิดเว็บไซต์:
- ทุกครั้งที่เปิดหรือ Refresh `index.html` = 1 page view
- เก็บยอดรวมที่ `siteStats/pageViews`
- เก็บรายวัน `siteStats/days/YYYY-MM-DD/pageViews`
- เก็บเวลาเปิดล่าสุด `siteStats/lastOpenedAt`
- หน้า Admin (`admin.html` และ `yayakonsuay.html`) แสดงแบบ realtime:
  - เปิดเว็บไซต์ทั้งหมด
  - เปิดเว็บไซต์วันนี้
  - เวลาเปิดล่าสุด

หมายเหตุ:
ตัวเลขนี้คือจำนวน “ครั้งที่เปิดหน้าเว็บ (Page Views)” ไม่ใช่จำนวนคนแบบ Unique Visitors
