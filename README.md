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


## V3 FIXED

เวอร์ชันนี้เขียนหน้า preorder และ app.js ใหม่เพื่อแก้ปัญหาเวอร์ชันก่อนที่หน้าเว็บยังแสดง 4 ขั้นตอน

ขั้นตอนจริง:
1. ข้อมูลผู้สั่งซื้อ
2. ช่องทางการติดต่อ
3. จำนวนสินค้า
4. ชำระเงิน
5. ตรวจสอบ

รหัสนักเรียน:
- 5 หลัก: เปิดเฉพาะ ม.1–ม.6
- 6 หลัก: เปิดเฉพาะ ปวช.1–ปวช.3

Responsive:
- Mobile
- iPhone/Android
- iPad/Tablet
- Notebook
- Desktop
