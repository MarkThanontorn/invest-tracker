# พอร์ตของฉัน — บันทึกการลงทุน & ต้นทุนเฉลี่ย

PWA สำหรับมือถือ บันทึกการซื้อ/ขาย USD, ทองคำ, BTC/คริปโต, หุ้นไทย/US/จีน-HK และกองทุนไทย
คำนวณต้นทุนเฉลี่ย, กำไร/ขาดทุน (฿ และ %), สัดส่วนพอร์ต และกราฟย้อนหลัง 3 เดือน / 1 ปี / 3 ปี

- **ข้อมูลอยู่ในมือถือเท่านั้น** (IndexedDB) — ย้ายเครื่องด้วย ตั้งค่า → Export / Import ไฟล์ `.json`
- ราคาดึงผ่าน Cloudflare Worker ของคุณเอง ซึ่งรับแค่ “สัญลักษณ์” (เช่น `PTT.BK`) ไม่มีต้นทุน/จำนวนออกจากเครื่อง

## ติดตั้ง (ฟรีทั้งหมด)

> 👉 **อ่านแบบละเอียดทีละขั้นได้ที่ [SETUP-GUIDE.md](SETUP-GUIDE.md)**

### 1) Worker สำหรับดึงราคา
```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ACCESS_TOKEN     # ตั้งรหัสลับยาวๆ อะไรก็ได้
npx wrangler secret put SEC_API_KEY      # key กองทุนจาก secopendata.sec.or.th (ถ้าใช้กองทุน)
npx wrangler deploy                      # จะได้ URL https://invest-price-proxy.<you>.workers.dev
```
หลัง deploy เว็บแล้ว แนะนำตั้ง `ALLOWED_ORIGIN` ใน `wrangler.toml` เป็น `https://<user>.github.io` แล้ว deploy ใหม่

**SEC API (กองทุนไทย):** สมัครที่ https://secopendata.sec.or.th/sec-open-apis (เว็บเดิม api-portal.sec.or.th ปิดแล้ว 30 มิ.ย. 2026)
Worker ใช้ API v2 (`/v2/fund/general-info/profiles`, `/v2/fund/daily-info/nav`) ถ้า base URL เปลี่ยน ให้ตั้ง `SEC_API_BASE` ใน `wrangler.toml`

### 2) เว็บแอพ (GitHub Pages)
1. สร้าง repo ใหม่บน GitHub แล้ว push โฟลเดอร์นี้ขึ้น branch `main`
2. Settings → Pages → Source: **GitHub Actions** (workflow อยู่ใน `.github/workflows/deploy.yml`)
3. เปิด `https://<user>.github.io/<repo>/` บนมือถือ → แชร์ → **เพิ่มไปยังหน้าจอโฮม**
4. ในแอพ ไปที่ **ตั้งค่า** ใส่ Worker URL + Access token → กด ทดสอบ → บันทึก

## การคำนวณ
- **ต้นทุนเฉลี่ย** แบบถ่วงน้ำหนัก (รวมค่าธรรมเนียมซื้อ). การขายไม่เปลี่ยนต้นทุนเฉลี่ย แต่บันทึกเป็น “กำไรที่ขายแล้ว”
- **ทองคำ** = Spot (USD/oz) × USD/THB × 15.244 g × 96.5% ÷ 31.1035 g + ส่วนต่างที่ตั้งเองใน ตั้งค่า
- **กราฟย้อนหลัง** ผลตอบแทนแบบ time-weighted — เงินที่เติมเข้าไม่นับเป็นกำไร
- ดึงราคาไม่ได้ → ใช้ราคาที่ “กรอกเอง” ในหน้าสินทรัพย์ / offline ใช้ราคาล่าสุดที่ cache ไว้

## พัฒนา
```bash
npm install
npm run dev          # แอพ
cd worker && npx wrangler dev   # Worker ที่ http://localhost:8787
npm test
```
