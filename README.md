# Say No Plastic - Pre-order Complete

ไฟล์หลัก:
- index.html
- styles.css
- app.js
- admin.html
- admin.css
- admin.js
- firebase-config.js
- database.rules.preorder.json
- img/product-bag.svg
- qr/qr-1.svg ถึง qr/qr-10.svg

## รูปสินค้า
ให้แทน `img/product-bag.svg` ด้วยรูปสินค้าจริง หรือแก้ path ใน index.html

## QR
QR 10 ไฟล์ในโฟลเดอร์ `qr/` เป็น placeholder เท่านั้น
ให้แทนด้วย QR จริงตามยอด:
1 = 139
2 = 278
3 = 417
4 = 556
5 = 695
6 = 834
7 = 973
8 = 1112
9 = 1251
10 = 1390

## Firebase
ใช้ Realtime Database โปรเจกต์เดิม และเก็บออเดอร์ใน node `preorders`

## Deploy
รัน:
vercel --prod
