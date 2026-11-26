# NEXUS — UI v3 Redesign Spec ("HUD")

> สเปกนี้มีไว้ส่งให้ Claude Code ทำงานใน repo `ridertus/nexus`
> แบบที่อนุมัติแล้ว (canvas): https://claude.ai/artifact/XL5qjvbs8GUVvQqm9pZFLQ
> ที่มาของค่าต่าง ๆ: `Sources/HUDDesignTokens.swift`, `HUDDesignMotion.swift`, `HUDBootLog.swift`
> ใน [DDDuoDuo/EndfieldHUD](https://github.com/DDDuoDuo/EndfieldHUD) (MIT) — เอามาแค่ค่าและแนวคิด
> ห้ามก๊อปภาพ โลโก้ หรือ asset ของเกม

## 0. ขอบเขต

**ทำ**
- เปลี่ยนหน้าตา (visual layer) ใน `web/style.css`, `web/index.template.html` และ markup ใน `web/app.ts` เท่าที่จำเป็น
- เพิ่มหน้า Daily Boot Log (ข้อ 6)
- ใส่ motion system (ข้อ 5)

**ห้ามทำ**
- แก้ engine ใน `src/` (safe-to-spend, tax, ledger, budget-goals, runway) และ test ของมัน
- เปลี่ยนความหมายของตัวเลขที่แสดง, routing (`#home`, `#ledger`, `#plan-*`, `#more-tax` ฯลฯ) หรือโครงเมนู nav ที่มีอยู่
  (ใน mockup มีแท็บ "วิเคราะห์" / "ภาษี" เป็นแค่ตัวอย่าง ให้ใช้ nav ของจริงตามเดิม)
- ลบ accessibility ที่มีอยู่ (`aria-*`, `.sr`, 44px targets, `prefers-reduced-motion`)

**Git:** เป็นการเปลี่ยนแปลงใหญ่ → ทำใน branch `ui-v3-hud` แล้วเปิด PR ให้เจ้าของรีวิว ห้าม push ตรงเข้า `main`

## 1. Theme

- **Dark เป็นค่าเริ่มต้น** ถ้า `prefs.theme` ยังไม่ถูกตั้ง ให้ใช้ `'dark'` แทน `'auto'` (ผู้ใช้ยังเลือก light/auto เองได้ใน "อื่น ๆ" เหมือนเดิม)
- Light theme ยังต้องใช้ได้: ให้ map token ชุดเดียวกันตามข้อ 2.2 (พื้นอ่อน ตัวหนังสือเข้ม แต่การ์ดอ่อน / chip มืด / เหลือง ยังเหมือนเดิม)
- แก้ `<meta name="theme-color">` ใน `applyTheme`: dark = `#111111`

## 2. Tokens (แทนที่ `:root` เดิม)

### 2.1 Dark (ค่าหลัก)

```css
:root, :root[data-theme="dark"] {
  /* surfaces — ไล่เทาละเอียด */
  --bg: #111111;
  --surface: #1A1A1A;        /* panel */
  --surface-2: #212121;      /* control / field */
  --sunken: #161616;         /* nav, dark tags */
  --line: #2E2E2E;
  --line-2: #3A3A3A;         /* field ring */
  --sep: #333333;

  /* ink */
  --ink: #F4F4F4;            /* titles */
  --ink-body: #EEEEEE;
  --ink-2: #A9A9A9;          /* description */
  --ink-3: #8A8A8A;          /* ค่าต่ำสุดสำหรับตัวหนังสือ (ห้ามใช้ #777 — contrast ไม่ผ่าน) */

  /* light plates — การ์ดอ่อนบนพื้นมืด = เอกลักษณ์ของ Endfield */
  --plate-hi: #E4E5E0;
  --plate: #D3D4CF;
  --plate-lo: #C6C7C2;
  --plate-side: linear-gradient(#C6C7C2, #B3B4AF);
  --plate-body: linear-gradient(#E0E1DC, #D0D1CC);
  --plate-ink: #111111;
  --plate-ink-2: #55564F;
  --plate-highlight: inset 0 1px 0 rgba(255,255,255,.75);
  --done-body: linear-gradient(#5E5E5E, #525252);

  /* signal yellow — ใช้แค่ 3 ที่: ปุ่มหลัก · แถบนำสายตา · ตัวเลข/หน่วยสำคัญ */
  --signal: #FFFA00;
  --signal-hi: #FFFC6B;
  --signal-lo: #E9CF12;
  --signal-ink: #111111;
  --btn-primary: linear-gradient(#FFFC6B, #FFFA00 40%, #E9CF12);

  /* status */
  --pos: #8CE03C;            /* ดี / ON TRACK */
  --info: #22A6F2;           /* ข้อมูล */
  --warn: #F97501;           /* ใกล้เกิน / ใกล้ครบกำหนด */
  --neg: #E5383B;            /* เกิน / shortfall (chip ใช้ #C8282C + ตัวขาว) */
  --neg-text: #FF8A8C;       /* neg ที่เป็นตัวหนังสือบนพื้นมืด */

  /* motifs */
  --tri-1: #FF1AAC; --tri-2: #00FFA2; --tri-3: #FFFA00;
  --hatch: repeating-linear-gradient(-45deg, #3A3A3A 0 1px, transparent 1px 3.5px);
  --ticks: repeating-linear-gradient(90deg, #3A3A3A 0 1px, transparent 1px 8px);

  /* type */
  --f-num: 'Barlow', 'IBM Plex Sans Thai', system-ui, sans-serif;     /* ตัวเลข + หัวข้ออังกฤษ */
  --f-body: 'IBM Plex Sans Thai', system-ui, sans-serif;               /* ไทย */
  --f-mono: 'IBM Plex Mono', ui-monospace, monospace;                  /* ป้ายระบบ / log */

  /* shape */
  --cut: 22px;               /* hero */
  --cut-sm: 14px;            /* plate side, ปุ่ม */
  --cut-xs: 8px;             /* nav active */
  --r: 0;

  /* motion */
  --ease: cubic-bezier(.2,.8,.2,1);
  --snap: cubic-bezier(.2,.9,.1,1);
  --t-enter: .38s; --t-leave: .13s; --t-hover: .22s; --t-press: .10s;
  color-scheme: dark;
}
```

### 2.2 Light

กลับค่าเฉพาะชุด surface/ink/line ส่วน plate, signal และ chip มืดใช้ค่าเดิม:
`--bg #ECECE9 · --surface #F7F7F5 · --surface-2 #FFFFFF · --sunken #191919 (nav ยังมืด) · --line #D6D6D2 · --line-2 #BDBDB8 · --ink #121212 · --ink-body #1A1A1A · --ink-2 #4F4F4F · --ink-3 #666666`
- status ที่เป็นตัวหนังสือบนพื้นอ่อนใช้เฉดเข้ม: pos `#3F8F14`, info `#0B7DC0`, warn `#D05A00`, neg `#C8282C`
- **ห้ามใช้เหลืองเป็นตัวหนังสือบนพื้นอ่อน** ใช้เป็นพื้นเท่านั้น

### 2.3 Fonts (`index.template.html`)

แทน Chakra Petch:
```
family=Barlow:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Thai:wght@400;500;600;700
```
ถ้า `sw.js` cache ชื่อไฟล์ font ไว้ให้ bump cache version ด้วย

## 3. Type scale

| Role | Font | Size / weight | Note |
|---|---|---|---|
| Numeral (hero amount) | `--f-num` | 64–68px · 300 · lh .9 · tracking -.02em · `tabular-nums` | ใช้ `clamp(52px, 17vw, 68px)` |
| Numeral unit `฿` | `--f-num` | 34% ของ numeral · 500 · `--signal` | dark เท่านั้น; light ใช้ `--ink-2` |
| Module title (ไทย) | `--f-body` | 28px · 700 · `--ink` | |
| Title subtitle (EN) | `--f-num` | 13px · 500 · tracking .2em · `--ink-3` · UPPERCASE | อยู่บรรทัดเดียวกับหัวข้อไทย |
| Section h2 (ไทย) + EN | `--f-body` 17/600 + `--f-num` 10.5px tracking .18em | | เช่น "บิลที่ต้องจ่าย UPCOMING" |
| Breadcrumb | `--f-mono` | 10.5px · tracking .06em · `--ink-3` | `// NEXUS / HOME` |
| Micro label | `--f-num` | 10px · 500 · tracking .12–.14em · UPPERCASE · `--ink-3` หรือ #9A9A9A | |
| Stat value | `--f-num` | 22px · 400 · tabular | หน่วย 12px `--ink-3` |
| Body | `--f-body` | 15px (เดิม) | |
| Mono data | `--f-mono` | 10.5–12px | ทุกตัวเลขในบรรทัดย่อย |
| Button | `--f-num` | 12px · 700 · tracking .08em · UPPERCASE | ปุ่มไทยใช้ `--f-body` 600 |
| Chip | `--f-num` | 9.5px · 700 · tracking .1em · UPPERCASE | |

## 4. Components (map เข้ากับ class เดิม)

### 4.1 System strip (บน `.topbar`)
- ซ้าย: แถบ 3 สีแนวตั้ง 4×14px (`--tri-1/2/3`, `aria-hidden`) + `NEXUS // FINANCE OS` (mono 10px .12em)
- ขวา: วันที่ `YYYY.MM.DD · HH:MM` mono 10px ใช้ปี ค.ศ. ใน strip นี้ ส่วนที่อื่นใช้ฟังก์ชันวันที่ไทยเดิม

### 4.2 Module header (ทุกหน้าใช้เหมือนกัน)
ทำเป็น helper เดียว เช่น `moduleHeader(crumb, titleTh, titleEn, counter?)`:
1. breadcrumb `// NEXUS / <PAGE>` + hatch tail 44×7px (`--hatch`, `aria-hidden`)
2. `<h1>` ไทย + subtitle EN
3. rule: lead เหลือง 36×3px → เส้น `--sep` พร้อม `--ticks` สูง 6px → counter chip เหลือง (`NOV`, `2 / 4` ฯลฯ) ถ้ามี

หน้า: HOME/ภาพรวม/OVERVIEW · LEDGER/รายการ/TRANSACTIONS · PLAN/แผน/PLAN · TAX/ภาษี/TAX CENTER · MORE/อื่น ๆ/SYSTEM

### 4.3 Hero `.hero` (Safe to Spend)
- พื้น `--surface`, ขอบ `--line`, `clip-path` ตัดมุมขวาบน `--cut`
- **เลิกใช้ `.hero-band` เหลืองเต็มแถบ** เปลี่ยนเป็นแถวบน: micro label ซ้าย (`SAFE TO SPEND · <label ไทยเดิม>`) + status chip ขวา
  - ปกติ: chip `ON TRACK` พื้น `--pos`
  - ใช้เกิน pace (เทียบ elapsed): chip `NEAR LIMIT` พื้น `--warn`
  - `bad` (shortfall): chip `SHORTFALL` พื้น #C8282C ตัวขาว ตัวเลขใช้ `--neg-text`
- `.hero-amt` ใช้สไตล์ Numeral; `.cur` (฿) ย้ายไปไว้**หลัง**ตัวเลขตามแบบ เป็นสีเหลือง; `.dec` 0.34em `--ink-3`
- **ความหมายของตัวเลขเหมือนเดิม** (ยอดที่ใช้ได้ในรอบ); ส่วนต่อวันอยู่ใน `.hero-sub` เหมือนเดิม
- `.cap-bar`: ส่วน free = `--signal`, ส่วน lock = `--hatch` บน `--surface-2`, เพิ่มขีดคั่นทุก 10px ด้วย `repeating-linear-gradient(90deg, transparent 0 9px, var(--bg) 9px 10px)` เป็น overlay; ด้านล่างเป็น mono 10.5px
- **ย้าย `.today` เข้ามาอยู่ในการ์ด hero** ไว้ล่างสุด คั่นด้วยเส้น `--line` ด้านบน (padding-top 12px):
  - แถวบน: micro label `TODAY · วันนี้เหลือ` ซ้าย + ค่า `leftToday` ขวา (`--f-num` 20px, ฿ สีเหลือง 12px; ถ้าติดลบใช้ `--neg-text` และ label `TODAY · ใช้เกินวันนี้`)
  - meter สูง 4px: fill เหลือง = `todayExp / dayBudget`, เกิน = `--neg`
  - แถวล่าง mono 10.5px: `ใช้ <todayExp>` ซ้าย · `/ <dayBudget>` ขวา
  - การคำนวณ `dayBudget` / `leftToday` ใช้ของเดิมใน `viewHome()` ห้ามเปลี่ยน
- ลำดับในการ์ด: แถวบน (label + chip) → ตัวเลขใหญ่ (ยอดทั้งรอบ) → `.hero-sub` (เฉลี่ย/วัน · วันที่เหลือ · รอบ) → `.cap-bar` + legend → today
- legend ของ cap-bar: `■ ใช้ได้` สีเหลือง, `▨ บิล`, `▨ ออม`, `▨ ภาษี` (mono 10.5px, `flex-wrap`); ส่วน lock ใช้ hatch บนพื้นเทาคนละเฉด (#252525 / #2E2E2E / #383838) ให้แยกกันออกโดยไม่ต้องพึ่งสี

### 4.4 Stat tiles
grid 2 คอลัมน์ gap 10px: พื้น `--surface` ขอบ `--line` padding 12/14 → micro label → stat value → บรรทัด mono สีสถานะ (เช่น `▲ 2,400 จากเดือนก่อน` ใช้ `--pos`)
ใส่เฉพาะข้อมูลที่ engine คำนวณได้อยู่แล้ว (ยอดรวมจาก `accountBalances`, ส่วนต่าง net จาก `calculateCashFlow`) **ห้ามแต่งตัวเลขขึ้นมาเอง** ถ้ายังไม่มี Health score ใน engine ก็ไม่ต้องใส่

### 4.5 Bill plate (`.row` ของบิล ทั้งใน Home และ Plan → บิลประจำ)
- สูง 60px, `display:flex`
  - body: `--plate-body` + `--plate-highlight` → ชื่อบิล (`--f-body` 14.5/500 `--plate-ink`) + `DUE · <วันที่>` (mono 10.5 `--plate-ink-2`)
  - side กว้าง 128px: `--plate-side`, `clip-path: polygon(14px 0,100% 0,100% 100%,0 100%,0 14px)` → จำนวนเงิน (`--f-num` 17/600) + ปุ่ม `PAY` (พื้น #161616 ตัว `--signal` สูง ≥32 กว้าง ≥44, ใช้ `data-pay` เดิม)
- **ใกล้ครบกำหนด** (≤1 วัน หรือเลยกำหนด): diamond 8px `--warn` หมุน 45° มุมขวาบน + ข้อความ sr-only "ใกล้ครบกำหนด"
- **จ่ายแล้ว**: body = `--done-body` ชื่อขีดฆ่า ตัว #E9E9E9; side = `--btn-primary` + ลายน้ำ `PAID` (34px 700 `rgba(0,0,0,.09)`, `aria-hidden`) + วงกลมเช็ค 24px
- การพลิกจาก pending → paid: animate side background + watermark fade .30s `--snap`

### 4.6 Goal card
`--surface` + มุม L เหลือง 10px ซ้ายบน (`aria-hidden`) → ชื่อ + `saved / target` → progress 4px เหลือง → mono `ETA · ...` (ใช้ค่าจาก `calculateGoals` เท่านั้น)

### 4.7 Bottom nav
พื้น `--sunken` ขอบบน `--line`; รายการ active = พื้น `--signal` ตัว #111 + `clip-path` ตัดมุมขวาบน `--cut-xs`; ตัวที่ไม่ active ใช้ #9A9A9A; label `--f-body` 10.5px; แต่ละช่องต้องสูง ≥44px; รายการเมนูเหมือนเดิม

### 4.8 ปุ่ม
- Primary: `--btn-primary` ตัว #111 + `clip-path` ตัดมุม 10px
- Secondary: #383838 (hover #484848)
- Light: `linear-gradient(#ECEDE8,#CDCEC9)`
- ทุกปุ่มสูง ≥44px; hover `--t-hover`, กด `--t-press` (scale .98)

### 4.9 Empty state
กล่อง `--hatch` ขอบ `--sep` + ข้อความหัวเรื่อง (20px 700 tracking .24em) + คำอธิบายไทย แทนที่ empty state เดิมทุกที่

### 4.10 Sheet / toast / notice
- sheet: พื้น `--surface` ขอบบน lead เหลือง 36×3px, ใช้ header แบบย่อ
- toast: พื้น #161616 ตัว #EEE, หัว UPPERCASE tracking .22em
- `.notice.warn/.neg`: แถบซ้าย 3px สีสถานะ + chip

## 5. Motion

ทุกอย่างสั้น เล่นจบในตัว และปิดหมดใต้ `prefers-reduced-motion` (rule เดิมที่บรรทัด 88 คลุมอยู่แล้ว)

```css
@keyframes stIn { from { opacity:0; transform:translateY(10px) } 60% { opacity:1 } to { opacity:1; transform:none } }
.st { animation: stIn var(--t-enter) var(--ease) backwards; animation-delay: calc(60ms + var(--i, 0) * 36ms); }
```
- render หน้าใหม่ → ใส่ `.st` และ `style="--i:N"` ให้ section/row ระดับบนสุด โดย cap `N ≤ 14`
- **ห้ามเล่นซ้ำตอน re-render ที่ไม่ได้เปลี่ยนหน้า** (เช่น `visibilitychange`, หลังบันทึกรายการ) ให้ใส่ `.st` เฉพาะตอน route เปลี่ยน
- ออกจากหน้า: ไม่ต้องทำ (เป็น SPA ที่ render ใหม่ทั้งหน้า) ถ้าจะทำให้ใช้ fade .13s
- Toggle / segctl: `--snap` .18s

## 6. Daily Boot Log

**เมื่อไหร่:** ครั้งแรกของวัน (เขตเวลา Bangkok ใช้ `todayBangkok()`) ที่เปิดแอปและผ่าน onboarding แล้ว
- เก็บ `prefs.lastBoot = 'YYYY-MM-DD'`
- ไม่แสดงถ้า `prefers-reduced-motion` หรือ `prefs.demo`
- เพิ่มสวิตช์ใน "อื่น ๆ": "แสดง Boot Log ตอนเปิดแอปครั้งแรกของวัน" (ค่าเริ่มต้นเปิด)

**หน้าตา:** overlay เต็มจอ พื้น #0E0E0E + scanline (`repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px)`, `aria-hidden`)
- โลโก้ `NEXUS` 22/700 tracking .22em + `PERSONAL FINANCE OS · v<version>` + crosshair
- panel terminal ตัดมุม `--cut`
- ปุ่ม `ENTER NEXUS` (primary) + บรรทัด "แสดงครั้งแรกของวัน · แตะที่ไหนก็ได้เพื่อข้าม"

**บรรทัด** (mono 12px, โผล่ทีละบรรทัดด้วย `clip-path` steps ห่างกัน ~300ms):
```
> BOOT SEQUENCE  2026.11.26 07:30
> SYNC LEDGER ........ OK
> BALANCE ............ ฿48,200          ← รวม accountBalances
> SAFE TO SPEND ...... ฿5,000 · 1,250/D ← calculateSafeToSpend().safeToSpend · perDay
> MONTH BUDGET ....... 62% USED         ← calculateBudgets (รวม spent/plan)
> BILLS DUE .......... 2 PENDING        ← billsInCycle ที่ยังไม่ paid
    · ค่าอินเทอร์เน็ต ฿599 — พรุ่งนี้    ← สูงสุด 3 รายการ ใกล้สุดก่อน, ชื่อไทย
> GOAL / <ชื่อ> ...... 60%              ← goal ที่ใกล้ครบกำหนดที่สุด 1 อัน
> TAX P.N.D.90 ....... READY 2027.03    ← เฉพาะเมื่อ estimateTax มีข้อมูล
ALL SYSTEMS ONLINE. WELCOME BACK, <ชื่อ>   (เขียว; ถ้า shortfall: "WARNING: SHORTFALL" ส้ม/แดง)
```
- ป้ายเป็นอังกฤษเสมอ (เป็น terminal) แต่ชื่อบิล/goal เป็นไทยตามข้อมูลจริง
- สีค่า: เหลือง = ตัวเลขหลัก, `--pos` = ดี, `--warn` = ค้างจ่าย, `--info` = ข้อมูล
- ห้ามบรรทัดไหนว่าง/เป็น 0 แบบไร้ความหมาย ถ้าไม่มีข้อมูลก็ข้ามบรรทัดนั้นไป
- **ข้าม:** คลิก/แตะ/กดปุ่มใดก็ได้ หรือรอจบแล้วอยู่ค้าง จนกด ENTER
- ปิดด้วย wipe ขึ้น .30s แล้ว focus ไปที่ `<h1>` ของ Home
- a11y: `role="dialog" aria-label="สรุปประจำวัน"`, ข้อความทั้งหมดอยู่ใน DOM ตั้งแต่แรก (animation แค่ซ่อนด้วยสายตา) ให้ screen reader อ่านได้ทันที

## 7. Accessibility (ต้องผ่านทุกข้อ)
- contrast ตัวหนังสือ ≥ 4.5:1 รวมตัวเล็ก 10px: บน #111/#1A1A1A ใช้อย่างต่ำ `#8A8A8A`
- ลวดลายตกแต่งทั้งหมด (hatch, ticks, tri-strip, มุม L, watermark, diamond) ใส่ `aria-hidden="true"`
- สถานะห้ามใช้สีอย่างเดียว: ต้องมีข้อความ chip หรือ sr-only คู่เสมอ
- touch target ≥ 44×44px
- ภาษาไทยมาก่อน: ป้าย EN เป็นตัวประกอบ ผู้ใช้ต้องเข้าใจได้จากข้อความไทยอย่างเดียว

## 8. Acceptance checklist
- [ ] `npm test` ผ่านทุกตัว (engine ไม่ถูกแตะ)
- [ ] `npm run build` (หรือ `web/build.mjs`) สำเร็จ, PWA ติดตั้งได้, offline ยังทำงาน
- [ ] Home / Ledger / Plan (งบ, บิลประจำ, เป้าหมาย) / Tax / More เปลี่ยนเป็นหน้าตาใหม่ครบ
- [ ] Dark เป็นค่าเริ่มต้น, Light ยังอ่านได้ทุกหน้า
- [ ] Boot Log แสดงครั้งเดียวต่อวัน ข้ามได้ ปิดได้ใน settings ไม่แสดงเมื่อ reduced motion
- [ ] เทียบกับ canvas ที่ 390px: header, hero, bill plates, nav ตรงกับแบบ
- [ ] ไม่มีตัวเลขสมมติในโค้ดจริง (ตัวเลขใน mockup เป็นตัวอย่างทั้งหมด)
- [ ] เปิด PR จาก `ui-v3-hud` พร้อม screenshot ก่อน/หลังของ Home และ Boot Log

## 9. ลำดับงานที่แนะนำ (commit ละเรื่อง)
1. tokens + fonts + theme default
2. module header helper + system strip + nav
3. hero + cap-bar + today meter + stat tiles
4. bill plates + goal card + empty states + buttons
5. motion `.st`
6. Boot Log + setting toggle
7. light theme pass + a11y pass

## 10. Decisions

การตัดสินใจเพิ่มเติมระหว่างลงมือทำ (เจ้าของอนุมัติแล้ว 2026-11-26) ใช้แทนสเปกข้างบนในจุดที่ขัดกัน

1. **ชื่อใน Boot Log** — ในข้อมูลไม่มีชื่อผู้ใช้ จึงเพิ่ม `prefs.name` (ไม่บังคับ) พร้อมช่องกรอกในหน้าตั้งค่า บรรทัดสุดท้ายเป็น `WELCOME BACK, <NAME>`; ถ้าไม่ได้กรอกชื่อจะแสดงแค่ `WELCOME BACK.`
2. **chip `NEAR LIMIT`** — แสดงเมื่อเข้าข้อใดข้อหนึ่ง: (ก) งบรวมจาก `getBudgets()` (ผลรวม spent / ผลรวม plan) ใช้ไปเกิน `elapsed + 10%` ซึ่งเป็นเกณฑ์เดียวกับแถบส้มของงบที่มีอยู่ หรือ (ข) วันนี้ใช้เกินงบรายวัน (`leftToday < 0`); `SHORTFALL` มาก่อนทุกกรณี
3. **โหมดไม่มีรายได้ประจำ (Runway)** — ใช้โครง hero ใหม่แบบเดียวกัน: label `RUNWAY · <ข้อความไทยเดิม>`, chip `ON TRACK` หรือ `SHORT RUNWAY` (เหลือน้อยกว่า 30 วัน ตามเกณฑ์เดิม); Boot Log ใช้บรรทัด `RUNWAY ...... N DAYS` แทน `SAFE TO SPEND`
4. **ธีมมืดเป็นค่าเริ่มต้น** — v2 บันทึก prefs ทั้งก้อน ผู้ใช้เดิมจึงมี `theme: 'auto'` ทั้งที่ไม่ได้เลือกเอง จึงย้าย `'auto'` เป็น `'dark'` **ครั้งเดียว** (flag `prefs.themeV3`) หลังจากนั้นถ้าผู้ใช้เลือก auto เองจะคงอยู่
5. **Stat tiles บน Home** — ไม่มี Health score ใน engine จึงใช้: (1) `TOTAL BALANCE` ยอดรวมทุกบัญชี + บรรทัดย่อย "ใช้จ่ายได้ / ออม"; (2) `NET · เดือนนี้` จาก `getCashFlow` (เดือนปฏิทิน) + บรรทัดย่อย `▲/▼ x จากเดือนก่อน` (เทียบ net เดือนก่อน)
6. **ปุ่มจ่ายบิล** — ข้อ 7 (ภาษาไทยมาก่อน) ชนะ canvas: ปุ่มแสดง **"จ่าย"** (`--f-body` 600) แทน `PAY` และมี `aria-label` "บันทึกว่าจ่าย <ชื่อบิล> แล้ว"
7. **Empty state** — หัวข้อ tracking .24em ใช้กับภาษาไทยไม่ได้ จึงเป็นหัวข้อภาษาอังกฤษ (เช่น `NO BILLS`, `aria-hidden`) แล้วตามด้วยหัวข้อไทยตัวหนาและคำอธิบายเดิม
8. **Module header ในหน้าย่อย** — ปุ่มย้อนกลับ (44px) ย้ายไปอยู่หน้า breadcrumb เช่น `// NEXUS / MORE / TAX`; ป้าย "วันที่เหลือในรอบ" บน topbar ถูกตัดออก (hero แสดงวันที่เหลืออยู่แล้ว); counter chip: Home = เดือนอังกฤษ 3 ตัว (`NOV`), Plan = `n / 3` ตามแท็บ, หน้าอื่นไม่มี
9. **แท็บที่เลือกอยู่ใน nav** (แทนข้อ 4.7) — ไม่ใช้พื้นเหลืองแล้ว: พื้น `--surface-2` + แถบเหลือง 3px ด้านบน + ตัดมุมขวาบน `--cut-xs` ตัวหนังสือ `--ink`; rail ฝั่ง desktop ใช้หลักเดียวกันแต่แถบเหลืองอยู่ด้านซ้าย; พื้นเหลืองเต็มสงวนไว้ให้ปุ่ม + (จด) ซึ่งเป็น primary action

อื่น ๆ: `APP_VERSION` เป็น 3.0.0 · เก็บปุ่ม + (จด) ตรงกลาง nav และ rail ฝั่ง desktop โดยเปลี่ยนแค่สไตล์ · bill plate ใช้กับบิลในรอบนี้ ส่วนรายการ "บิลทั้งหมด" ยังเป็นแถว · tiles ในหน้า Ledger/Plan/บัญชีใช้สไตล์ใหม่แต่คงจำนวนช่องเดิม · `sw.js` ไม่ได้ cache ชื่อไฟล์ font และเปลี่ยน cache version ทุกครั้งที่ build จึงไม่ต้อง bump · screenshot ก่อน/หลังเก็บไว้ที่ `screenshots/` ในเครื่อง (อยู่ใน `.gitignore`) ไม่ commit เข้า repo
