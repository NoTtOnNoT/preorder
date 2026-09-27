# Say No Plastic - Tote Bag Pre-order

เว็บไซต์พรีออเดอร์กระเป๋าผ้า + Admin Dashboard เชื่อม Firebase Realtime Database เดิม
และเก็บคำสั่งซื้อใน node ใหม่ชื่อ `preorders`

## ไฟล์หลัก
- `index.html` หน้า Pre-order
- `styles.css` ดีไซน์หน้า Pre-order
- `app.js` ระบบฟอร์ม/คำนวณ/แนบสลิป/บันทึก RTDB
- `admin.html` หน้า Admin
- `admin.css` ดีไซน์ Admin
- `admin.js` Login + Dashboard + ตรวจสลิป + เปลี่ยนสถานะ
- `firebase-config.js` โปรเจกต์ Firebase เดิม
- `database.rules.preorder.json` Rules สำหรับ node ใหม่
- `payment-qr.svg` QR ตัวอย่าง ต้องเปลี่ยนเป็น QR จริง

## ราคา
ตั้งไว้ที่ 139 บาท/ใบ ใน `app.js`

```js
const UNIT_PRICE = 139;
```

หากเปลี่ยนราคา ให้แก้ค่า `unitPrice` ใน `database.rules.preorder.json` ให้ตรงกันด้วย

## QR ชำระเงิน
`payment-qr.svg` เป็น Placeholder เท่านั้น
ให้นำ QR จริงมาแทน หรือเปลี่ยน `<img src>` ใน `index.html`

## สลิป
ระบบใช้ Realtime Database อย่างเดียว จึงย่อรูปสลิปแล้วเก็บเป็น Base64 ที่:
`preorders/{orderId}/payment/slipData`

เหมาะกับงานโรงเรียน/ปริมาณไม่มาก หากมีรายการจำนวนมากควรย้ายรูปไปบริการเก็บไฟล์ในอนาคต

## หน้า Admin
ใช้บัญชีเดิมใน `adminAccounts` และจำการล็อกอิน 7 วันเหมือนระบบเดิม

Admin ทำได้:
- ดูจำนวนคำสั่งซื้อ
- ดูจำนวนกระเป๋ารวม
- ดูยอดเงินรวม
- ดูจำนวนรอตรวจสอบ/ยืนยันแล้ว/สั่งวันนี้
- ค้นหาและกรองข้อมูล
- ดูสลิปเต็ม
- เปลี่ยนสถานะเป็น รอตรวจสอบ / ยืนยันแล้ว / มีปัญหา

## หมายเหตุ Security
เพราะใช้ Login ผ่าน Realtime Database + localStorage ตามระบบเดิม จึงเป็น client-side login
และไม่เหมาะกับระบบการเงินจริงที่ต้องการความปลอดภัยสูง


## V2
- แยกข้อมูลผู้สั่งซื้อและช่องทางติดต่อคนละหน้า
- รหัส 5 หลัก = มัธยม ม.1–ม.6
- รหัส 6 หลัก = ปวช.1–ปวช.3
- Responsive สำหรับมือถือ iPad Tablet Notebook Desktop
