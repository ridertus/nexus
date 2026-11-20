# NEXUS — Personal Finance OS (solo)

ระบบการเงินส่วนตัวสำหรับคนเดียว มี 2 ทางให้ใช้ ทั้งสองทางใช้ engine ตัวเดียวกัน (เทสต์ 21 ข้อ):

- **เว็บแอป (PWA)**: ใช้บนมือถือเป็นหลัก ติดตั้งลงหน้าจอหลักได้ ใช้ได้แม้ไม่มีเน็ต ข้อมูลเก็บในเบราว์เซอร์ของเครื่องนั้นเท่านั้น
- **CLI**: ใช้บนคอม ข้อมูลอยู่ที่ `~/.nexus/nexus.json`

ไฟล์สำรองของทั้งสองทางใช้รูปแบบเดียวกัน ย้ายข้อมูลไปมาได้

---

## เว็บแอป: เอาขึ้นเว็บฟรี แล้วติดตั้งลงมือถือ

PWA ต้องเปิดผ่าน `https://` ถึงจะติดตั้งและใช้ออฟไลน์ได้ ทางที่ฟรีมีดังนี้:

### ทาง A: GitHub Pages (แนะนำ ฟรีถ้า repo เป็น public)
> ใน repo มีแค่โค้ดแอป ข้อมูลการเงินของคุณอยู่ในมือถือ ไม่เคยขึ้น GitHub ดังนั้น repo เป็น public ได้โดยไม่เปิดเผยข้อมูลส่วนตัว (GitHub Pages สำหรับ repo private ต้องใช้แพ็กเกจเสียเงิน)

1. สร้าง repo ใหม่บน GitHub เช่น `nexus` แบบ **Public**
2. push โฟลเดอร์นี้ขึ้นไป (`git init && git add . && git commit -m "NEXUS" && git branch -M main && git remote add origin https://github.com/<user>/nexus.git && git push -u origin main`)
3. ใน repo ไปที่ **Settings › Pages › Build and deployment › Source** แล้วเลือก **GitHub Actions**
4. รอ workflow `Deploy NEXUS PWA` ทำงานเสร็จ (ประมาณ 1 นาที) จะได้ลิงก์ `https://<user>.github.io/nexus/`

### ทาง B: Cloudflare Pages (ฟรี ใช้กับ repo private ได้ หรืออัปโหลดเองโดยไม่ใช้ git)
1. `npm install && npm run build:web`
2. dash.cloudflare.com › Workers & Pages › Create › Pages › **Upload assets** แล้วลากโฟลเดอร์ `dist-web/` ไปวาง

### ยังไม่มีรายได้ประจำ?
ตอนเริ่มใช้ให้เลือก **"ยังไม่มีรายได้ประจำ"** (หรือไปที่ เพิ่มเติม › ตั้งค่า › รายได้) แล้วหน้าหลักจะบอกว่า **เงินที่มีพอใช้อีกกี่วัน** คิดจากค่าใช้จ่ายจริงเฉลี่ย 30 วันล่าสุดรวมบิลประจำ เงินที่ได้รับมา (เช่น จากครอบครัว) จดเป็น "รับ" ตามปกติ พอมีงานทำแล้วค่อยสลับเป็น "มีรายได้ประจำ" ใน CLI ใช้คำสั่ง `nexus mode none` / `nexus mode regular`

### ติดตั้งบน Nothing Phone (Chrome)
1. เปิดลิงก์ใน Chrome แล้วกดเมนู ⋮ › **ติดตั้งแอป / Add to Home screen**
2. กดค้างที่ไอคอน NEXUS จะมีทางลัด **"จดรายจ่าย"** และ **"จดรายรับ"** เปิดหน้าจดได้ทันที
3. ข้อมูลอยู่ใน Chrome ของมือถือเครื่องนั้น ถ้าล้างข้อมูล Chrome ข้อมูลจะหาย ให้กด **เพิ่มเติม › สำรองข้อมูล** แล้วเก็บไฟล์ไว้ใน Google Drive สัปดาห์ละครั้ง (แอปจะเตือนเมื่อเกิน 14 วัน)

### พัฒนาต่อ
```bash
npm install
npm test               # engine tests
npm run typecheck      # engine + web
npm run build:web      # → dist-web/index.html (ไฟล์เดียว รวม CSS/JS แล้ว) + sw.js + manifest + icons
```
ซอร์สของเว็บอยู่ใน `web/` (`app.ts` = ทุกหน้า, `style.css` = design system, `ui.ts` = sheet/toast/วันที่ไทย, `browser-store.ts` = localStorage)

---

## CLI (บนคอม)
```bash
npm install && npm run build && npm link
nexus setbal bank 18500          # ตั้งยอดให้ตรงกับแอปธนาคาร
nexus spend 60 อาหาร ข้าวมันไก่ --acc true
nexus                            # dashboard
nexus help
```
ถ้าจะย้ายข้อมูลจากมือถือมาใช้ CLI ให้เอาไฟล์สำรองจากแอปไปวางทับ `~/.nexus/nexus.json` (และกลับกัน ใช้ **กู้คืนจากไฟล์** ในแอปเพื่อนำไฟล์ `nexus.json` จาก CLI เข้าไป)

ออกแบบระบบ: `NEXUS-ARCHITECTURE.md`
