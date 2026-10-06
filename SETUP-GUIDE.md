# คู่มือติดตั้งทีละขั้นตอน

ใช้เวลาประมาณ 30–45 นาที ทุกอย่างฟรี มี 4 ส่วน ทำตามลำดับ:

| ส่วน | ทำอะไร | ทำที่ไหน | จำเป็นไหม |
|---|---|---|---|
| A | สมัคร key กองทุนจาก ก.ล.ต. | เว็บ secopendata.sec.or.th | ถ้ามีกองทุนรวมไทย |
| B | ติดตั้งตัวดึงราคา (Cloudflare Worker) | คอมพิวเตอร์ | จำเป็น |
| C | เอาแอพขึ้นเว็บ (GitHub Pages) | คอมพิวเตอร์ | จำเป็น |
| D | ติดตั้งแอพลงมือถือ | มือถือ | จำเป็น |

> **ภาพรวม:** แอพ (C) อยู่บนเว็บ GitHub แต่ข้อมูลการลงทุนเก็บในมือถือคุณเท่านั้น
> เวลาจะดูราคาปัจจุบัน แอพจะถามตัวดึงราคา (B) ด้วยชื่อสัญลักษณ์อย่างเดียว เช่น `PTT.BK`
> แล้วตัวดึงราคาไปถาม Yahoo Finance / ก.ล.ต. ให้

---

## ส่วน A — สมัคร key กองทุนจาก ก.ล.ต. (ข้ามได้ถ้าไม่มีกองทุนรวม)

> เว็บเดิม `api-portal.sec.or.th` **ปิดไปแล้วตั้งแต่ 30 มิ.ย. 2026** ต้องใช้เว็บใหม่ด้านล่าง
> (แอพอัปเดตให้ใช้ API เวอร์ชันใหม่แล้ว)

1. เปิด **https://secopendata.sec.or.th/sec-open-apis** ในเบราว์เซอร์คอม
2. กดปุ่ม **เข้าสู่ระบบ** (มุมขวาบน) → เลือก **สมัครสมาชิก**
3. กรอกอีเมล/ข้อมูล → ไปกดยืนยันในอีเมลที่ ก.ล.ต. ส่งมา → กลับมาล็อกอิน
4. หาหน้า **Profile / โปรไฟล์** หรือ **Subscription** ของบัญชี → ขอ/subscribe การใช้งาน API
   (ระบบใหม่ subscribe ครั้งเดียวใช้ได้ทุกหมวด รวมหมวด “กองทุน”)
5. จะเห็น **Primary key** (ตัวอักษรยาวๆ) → กด show แล้ว **คัดลอกเก็บไว้** ใช้ในขั้น B6

> ชื่อเมนูอาจต่างจากนี้เล็กน้อย ถ้าหาไม่เจอ ในเว็บมีหัวข้อ
> “คู่มือผู้ใช้ → การสมัครบัญชีสมาชิก และ ลงชื่อเข้าใช้งาน” อธิบายพร้อมรูป

---

## ส่วน B — ติดตั้งตัวดึงราคา (Cloudflare Worker)

### B1. สมัคร Cloudflare
ไปที่ **https://dash.cloudflare.com/sign-up** สมัครด้วยอีเมล (แผน Free) แล้วยืนยันอีเมล

### B2. เปิด Terminal ที่โฟลเดอร์ worker
เปิด **PowerShell** (กด Start พิมพ์ PowerShell) แล้วพิมพ์:
```powershell
cd C:\Users\marku\invest-tracker\worker
npm install
```

### B3. ล็อกอิน Cloudflare
```powershell
npx wrangler login
```
เบราว์เซอร์จะเด้งหน้า Cloudflare → กด **Allow** → กลับมาที่ PowerShell จะขึ้นว่า login สำเร็จ

### B4. Deploy ครั้งแรก
```powershell
npx wrangler deploy
```
- ถ้าเป็นครั้งแรก มันจะถามให้ตั้งชื่อ subdomain `workers.dev` → ตั้งชื่ออะไรก็ได้ เช่น `markus`
- เสร็จแล้วจะได้ URL หน้าตาแบบนี้ **จดไว้**:
  ```
  https://invest-price-proxy.markus.workers.dev
  ```

### B5. ตั้งรหัสผ่าน (Access token) กันคนอื่นแอบใช้
สร้างรหัสสุ่มด้วยคำสั่งนี้ (จะได้ตัวอักษรยาวๆ 1 บรรทัด → **คัดลอกเก็บไว้** ใช้ในขั้น D3):
```powershell
[guid]::NewGuid().ToString("N")
```
แล้วใส่ให้ Worker:
```powershell
npx wrangler secret put ACCESS_TOKEN
```
มันจะถาม `Enter a secret value:` → วางรหัสที่เพิ่งสร้าง → Enter

### B6. ใส่ key กองทุน (ถ้าทำส่วน A)
```powershell
npx wrangler secret put SEC_API_KEY
```
วาง Primary key จาก ก.ล.ต. → Enter

### B7. ทดสอบ
เปิด URL จาก B4 ในเบราว์เซอร์ ต้องขึ้นว่า:
```
{"error":"unauthorized"}
```
**แบบนี้ถูกต้องแล้ว** (แปลว่า Worker ทำงาน และกันคนที่ไม่มีรหัสไว้)

---

## ส่วน C — เอาแอพขึ้นเว็บ (GitHub Pages)

### C1. สมัคร GitHub
ไปที่ **https://github.com/signup** สมัครให้เรียบร้อย จำ **username** ไว้ (สมมติว่า `markus123`)

### C2. สร้าง repository
1. ไปที่ **https://github.com/new**
2. Repository name: `invest-tracker`
3. เลือก **Public** (แผนฟรีเปิด Pages ได้เฉพาะ Public — ไม่เป็นไร เพราะในโค้ดไม่มีข้อมูลการลงทุนของคุณ ข้อมูลอยู่ในมือถือ)
4. **ไม่ต้อง** ติ๊ก Add README → กด **Create repository**

### C3. อัปโหลดโค้ดขึ้น GitHub
ใน PowerShell (แทน `markus123` ด้วย username ของคุณ):
```powershell
cd C:\Users\marku\invest-tracker
git init
git add .
git commit -m "first version"
git branch -M main
git remote add origin https://github.com/markus123/invest-tracker.git
git push -u origin main
```
ตอน push ครั้งแรกจะมีหน้าต่างให้ล็อกอิน GitHub → เลือก **Sign in with your browser** → Authorize

### C4. เปิด GitHub Pages
1. ในหน้า repo บน GitHub → แท็บ **Settings** → เมนูซ้าย **Pages**
2. หัวข้อ **Build and deployment → Source** เลือก **GitHub Actions**

### C5. รอ build
1. ไปแท็บ **Actions** จะเห็นงาน “Deploy to GitHub Pages” กำลังรัน
   (ถ้าไม่มี ให้กดเข้าไปที่ workflow แล้วกด **Run workflow**)
2. รอ 1–3 นาทีจนขึ้น ✅ สีเขียว
3. เว็บแอพของคุณอยู่ที่:
   ```
   https://markus123.github.io/invest-tracker/
   ```

### C6. ล็อก Worker ให้ใช้ได้เฉพาะเว็บของคุณ (แนะนำ)
เปิดไฟล์ `worker\wrangler.toml` แก้บรรทัด:
```toml
ALLOWED_ORIGIN = "https://markus123.github.io"
```
(ไม่ต้องมี `/invest-tracker/` ต่อท้าย) แล้ว deploy ใหม่:
```powershell
cd C:\Users\marku\invest-tracker\worker
npx wrangler deploy
```

---

## ส่วน D — ติดตั้งลงมือถือ

### D1. เปิดเว็บในมือถือ
เปิด `https://markus123.github.io/invest-tracker/`
- **iPhone:** ต้องใช้ **Safari**
- **Android:** ใช้ **Chrome**

### D2. เพิ่มไปหน้าจอโฮม
- **iPhone:** กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) → **เพิ่มไปยังหน้าจอโฮม** → เพิ่ม
- **Android:** กด ⋮ มุมขวาบน → **ติดตั้งแอป** หรือ **เพิ่มลงในหน้าจอหลัก**

จากนี้ **เปิดจากไอคอนบนหน้าจอโฮมเสมอ** (ไม่ใช่เปิดผ่าน Safari/Chrome)
เพราะข้อมูลของแอพบนหน้าจอโฮมแยกจากเบราว์เซอร์ และ iPhone จะไม่ลบทิ้งอัตโนมัติ

### D3. ตั้งค่าในแอพ
1. เปิดแอพ → แท็บ **ตั้งค่า** (ขวาล่าง)
2. **Worker URL:** ใส่ URL จาก B4 เช่น `https://invest-price-proxy.markus.workers.dev`
3. **Access token:** ใส่รหัสจาก B5
4. กด **ทดสอบ** → ต้องขึ้น `เชื่อมต่อสำเร็จ ✓ USD/THB = ...`
5. กด **บันทึก**

### D4. เริ่มใช้งาน
กดปุ่ม **+** ตรงกลางล่าง → เลือกประเภท → ค้นหา → กรอกวันที่/จำนวน/เงินบาท → บันทึก

**ตัวอย่างการกรอก**
| ลงทุนอะไร | ประเภท | ค้นหา | จำนวน | เงินบาท |
|---|---|---|---|---|
| หุ้น PTT 1,000 หุ้น จ่าย 32,500 บาท | หุ้นไทย | `PTT` | 1000 | 32500 |
| แลก USD 1,000 ดอลลาร์ จ่าย 33,600 บาท | ดอลลาร์ US | (อัตโนมัติ) | 1000 | 33600 |
| ทองแท่ง 1 บาท จ่าย 65,000 | ทองคำ | (อัตโนมัติ) | 1 | 65000 |
| BTC 0.01 เหรียญ จ่าย 30,000 | คริปโต | `BTC` | 0.01 | 30000 |
| Apple 5 หุ้น จ่าย 55,000 บาท | หุ้น US | `AAPL` | 5 | 55000 |
| Tencent 100 หุ้น | หุ้นจีน/HK | `0700.HK` | 100 | (บาทที่จ่าย) |
| กองทุน K-USA-A | กองทุนไทย | `K-USA` | หน่วยที่ได้ | 10000 |

ทองซื้อ 2 สลึง = `0.5` บาททองคำ

---

## สำรองข้อมูล & ย้ายเครื่อง

**สำรอง (ทำเดือนละครั้ง หรือหลังบันทึกเยอะๆ)**
แอพ → **ตั้งค่า → Export ไฟล์** → เลือกเก็บใน Files / Google Drive / ส่ง LINE หาตัวเอง
ได้ไฟล์ชื่อ `invest-backup-YYYYMMDD.json`

**ย้ายเครื่องใหม่**
1. ทำส่วน D1–D3 ในเครื่องใหม่ (ไม่ต้องทำ A–C ใหม่)
2. **ตั้งค่า → Import ไฟล์** → เลือกไฟล์ `.json` → กด **แทนที่ทั้งหมด**

> ⚠️ ถ้าลบแอพออกจากหน้าจอโฮม หรือล้างข้อมูลเว็บไซต์ ข้อมูลจะหาย — มีแค่ไฟล์ Export ที่กู้คืนได้

---

## แก้ปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| ทดสอบแล้วขึ้น `unauthorized` | Access token ในแอพไม่ตรงกับที่ตั้งใน B5 → ทำ B5 ใหม่แล้วใส่ให้ตรงกัน |
| ทดสอบแล้วขึ้น `Failed to fetch` | Worker URL ผิด หรือ `ALLOWED_ORIGIN` ใน C6 พิมพ์ไม่ตรงกับเว็บ (ต้องเป็น `https://username.github.io` ไม่มี `/` ท้าย) |
| ค้นหากองทุนขึ้น `ยังไม่ได้ตั้ง SEC_API_KEY` | ยังไม่ได้ทำ B6 |
| กองทุนขึ้น `SEC API key ไม่ถูกต้อง หรือยังไม่ได้ subscribe` | key ผิด หรือยังไม่ได้ subscribe ในเว็บ ก.ล.ต. (ส่วน A ข้อ 4) |
| ราคาทองต่างจากราคาสมาคมฯ | ไปที่ ตั้งค่า → ส่วนต่างราคาทองไทย ใส่ตัวเลขบวก/ลบเพื่อปรับ |
| ดึงราคาบางตัวไม่ได้ (มี ⚠) | เข้าหน้าสินทรัพย์นั้น → **กรอกราคาเอง** |
| Actions ใน GitHub ขึ้น ❌ สีแดง | กดเข้าไปดู error / ตรวจว่า C4 เลือก Source เป็น GitHub Actions แล้ว |

## อัปเดตแอพในอนาคต
แก้โค้ดแล้วรัน:
```powershell
cd C:\Users\marku\invest-tracker
git add .
git commit -m "update"
git push
```
GitHub จะ build ให้อัตโนมัติ มือถือจะได้เวอร์ชันใหม่ตอนเปิดแอพครั้งถัดไป (ข้อมูลเดิมไม่หาย)
