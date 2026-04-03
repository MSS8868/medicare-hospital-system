# 🏥 MediCare Hospital Management System — v3

## What Changed in This Version

| Priority | Feature | File(s) |
|----------|---------|---------|
| 🔴 P1 | **MySQL everywhere** — same DB local + production | `config/database.js`, `models/index.js`, `package.json` |
| 🔴 P1 | **Seed race-condition fix** — `RUN_SEED=true` flag | `server.js`, `seed.js` |
| 🔴 P1 | **PatientId race-condition fix** — `Date.now().toString(36)` | `authController.js` |
| 🟡 P2 | **Slot visual** — booked=red, locked=grey, past=dim with legend | `BookAppointment.js`, `appointmentController.js` |
| 🟡 P2 | **Patient prescription inline** — medicine table with before/after food | `MyAppointments.js`, `pdfService.js` |
| 🟡 P2 | **Doctor date override** — extend hours one day without weekly change | `DoctorSchedule.js`, `doctorController.js`, `slotEngine.js`, models |
| 🟡 P2 | **Patient notifications** — in-app alert when doctor changes schedule | `patientController.js`, `doctorController.js`, models, `api.js` |
| 🟡 P2 | **Timezone bug fix** — `new Date('YYYY-MM-DD')` → local parse | `slotEngine.js` |
| 🟢 P3 | **CORS** — open in dev, env-var configurable in prod | `server.js` |
| 🟢 P3 | **Login unchanged** — OTP demo mode, Twilio ready | `authController.js` |

---

## Quick Start (Local — MySQL)

### Step 1: Install MySQL

**Option A — Docker (recommended, zero config):**
```bash
docker run -d \
  --name medicare-mysql \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=medicare_db \
  mysql:8
```

**Option B — XAMPP:** Start MySQL in XAMPP, open phpMyAdmin, create database `medicare_db`.

**Option C — Native MySQL:**
```bash
mysql -u root -p
CREATE DATABASE medicare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### Step 2: Configure environment

```bash
cd hospital-final/backend
cp .env .env.local   # keep a backup
# Edit .env — set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
```

Minimal `.env` for local Docker setup:
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=medicare_db
DB_USER=root
DB_PASSWORD=root
JWT_SECRET=change_this_to_something_random
OTP_DEMO_MODE=true
STATIC_OTP=123456
NODE_ENV=development
```

### Step 3: Install and seed

```bash
# Backend
cd hospital-final/backend
npm install            # installs mysql2 and all deps
npm run seed           # drops tables, recreates, inserts all data

# Frontend
cd hospital-final/frontend
npm install
```

### Step 4: Run

```bash
# Terminal 1
cd hospital-final/backend && npm run dev    # http://localhost:5000

# Terminal 2
cd hospital-final/frontend && npm start    # http://localhost:3000
```

---

## Login Credentials

| Role | Mobile | Password / OTP |
|------|--------|---------------|
| **Admin** | 9999999999 | Admin@123 |
| **Receptionist** | 9888888888 | Recep@123 |
| **Dr. Sunil N** (Ortho) | 9800000001 | Doctor@123 |
| **Dr. Dilip Raj** (Medicine) | 9800000002 | Doctor@123 |
| **Dr. Sumanjita Bora** (Cardio) | 9800000003 | Doctor@123 |
| **Dr. Preeti Kathail** (Medicine) | 9800000004 | Doctor@123 |
| **Dr. Hayesh V** (Emergency) | 9800000005 | Doctor@123 |
| **Dr. Lavanya K** (Diabetology) | 9800000006 | Doctor@123 |
| **Dr. Shivakumar** (Paeds) | 9800000007 | Doctor@123 |
| **Dr. Sumera Janvekar** (Paeds) | 9800000008 | Doctor@123 |
| **Dr. Dhanalakshmi** (Radiology) | 9800000009 | Doctor@123 |
| **Dr. Akshay Deshpande** (Gastro) | 9800000010 | Doctor@123 |
| **Dr. Chaitra Gowda** (Gynae) | 9800000011 | Doctor@123 |
| **Dr. Chaitra B G** (ENT) | 9800000012 | Doctor@123 |
| **Dr. Kamalika** (Physio) | 9800000013 | Doctor@123 |
| **Dr. Rachana Shetty** (Ayurveda) | 9800000014 | Doctor@123 |
| **Dr. Muthulakshmi** (Homeo) | 9800000015 | Doctor@123 |
| **Dr. Felix Raju** (Dental) | 9800000016 | Doctor@123 |
| **Mrs. Kanchana** (Nutrition) | 9800000017 | Doctor@123 |
| **Patient (sample)** | 9700000001 | OTP: **123456** |
| **New patient** | Any 10 digits | OTP: **123456** |

---

## Railway Production Deployment

### Backend

1. Push to GitHub
2. Railway → New Project → Deploy from GitHub
3. Set **Root Directory**: `hospital-final/backend`
4. Set **Start Command**: `npm start`
5. Add MySQL plugin: Railway dashboard → + New → Database → MySQL
6. Set these environment variables in Railway:

```
NODE_ENV=production
JWT_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
JWT_EXPIRES_IN=7d
OTP_DEMO_MODE=true
STATIC_OTP=123456
RUN_SEED=true         ← set this ONCE to seed on first deploy
HOSPITAL_NAME=MediCare Multi-Specialty Hospital
HOSPITAL_ADDRESS=Your Hospital Address
HOSPITAL_PHONE=+91-XXXXXXXXXX
FRONTEND_URL=https://your-vercel-url.vercel.app
```

Railway MySQL plugin auto-sets `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD` — the app reads those automatically.

7. After first successful deploy and seed: **set `RUN_SEED=false`** (prevents re-seeding on every restart)

### Frontend

1. Vercel → New Project → Import from GitHub
2. Set **Root Directory**: `hospital-final/frontend`
3. Set environment variable:
   ```
   REACT_APP_API_URL=https://your-backend.up.railway.app/api
   ```
4. Deploy

### Custom Domain

1. Buy at Namecheap/GoDaddy (~₹800/year for `.in`)
2. Vercel: Settings → Domains → Add domain
3. Copy CNAME from Vercel → add to Namecheap Advanced DNS
4. SSL automatic via Vercel ✅

---

## Feature Guide

### 1. Slot Visual Display (Patient — Book Appointment)

The slot grid shows all slots colour-coded:
- 🟢 **White border** = Available — click to book
- 🔴 **Red background + strikethrough** = Booked — cannot select
- ⬜ **Grey background** = Locked (held by another user for 3 min) — cannot select
- 🌫️ **Dim grey** = Past time — cannot select
- A **legend** above the grid explains the colours

### 2. Inline Prescription (Patient — My Appointments)

After a consultation is saved by the doctor, the patient sees:
- A "View prescription" toggle button on visited appointments
- Expanding it shows a medicine table: **Name | Dosage | Frequency | Duration | Before/After food**
- "After food" shown in green badge, "Before food" in orange badge
- Tests advised listed as purple pills
- Follow-up date shown in yellow banner
- "Download PDF" button for the formal prescription PDF

### 3. Doctor Date Override (Doctor — My Schedule)

The schedule page has two sections:
1. **Weekly Recurring Schedule** — same as before (Mon–Sat 9–5 etc.)
2. **Date-Specific Overrides** — new section at the bottom

To extend hours on one day only:
1. Click "Add Override"
2. Pick the date (e.g., today)
3. Set type = "Working (extended hours)"
4. Enter new start/end time (e.g., 08:00–20:00)
5. Save — slots for that date regenerate with the new times immediately
6. The weekly schedule for other days is untouched

To block a day off:
1. Click "Add Override"
2. Pick the date
3. Set type = "Blocked (day off)"
4. Save — slots deleted, no new bookings possible on that date
5. Existing patients with appointments on that date are notified

### 4. Patient Notifications (Schedule Change)

When a doctor changes their weekly schedule or blocks a date:
- All patients with confirmed future appointments that fall outside the new schedule receive an **in-app notification**
- The notification bell in the top-right (patient portal) shows the unread count
- Clicking it takes them to the follow-ups / notifications page
- Message: "Your appointment with Dr. X on DATE at TIME may no longer be valid. Please reschedule."

### 5. OTP Login (Unchanged)

- `OTP_DEMO_MODE=true` → OTP is always `123456` (or whatever `STATIC_OTP` is set to)
- The API response includes `demoOtp` field which the frontend displays in a yellow box
- When you integrate Twilio later: set `OTP_DEMO_MODE=false` and fill `TWILIO_*` env vars
- The app falls back to demo mode automatically if Twilio fails — it never crashes

### 6. Receptionist Dashboard Filters (Unchanged — already working)

The receptionist dashboard already has:
- **Department filter** — dropdown showing all departments from today's appointments
- **Visited / Not Visited filter** — dropdown to filter by status
- **Search** — by patient name, mobile, doctor name, appointment ID

---

## Debugging Guide

### MySQL connection error on startup
```
Error: Access denied for user 'root'@'localhost'
```
→ Check `DB_PASSWORD` in `.env`. For Docker: password is `root`. For XAMPP: usually empty.

### Tables already exist / seed error
```
Error: Table 'Users' already exists
```
→ `npm run seed` uses `force:true` — it drops and recreates. If it fails, manually drop:
```sql
DROP DATABASE medicare_db;
CREATE DATABASE medicare_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
Then run `npm run seed` again.

### JWT invalid signature (production)
```
Auth error: invalid signature
```
→ `JWT_SECRET` in Railway changed between deployments. Set it once and never change it.
All current users will need to log in again once after you fix the secret.

### CORS error in browser
```
Access to XMLHttpRequest blocked by CORS policy
```
→ Add your frontend URL to `ALLOWED_ORIGINS` in Railway backend env:
```
ALLOWED_ORIGINS=https://your-vercel-url.vercel.app
```

### Slots not showing
→ Check that `DB_*` env vars match your MySQL instance. The slot engine queries `DoctorSchedules` — if that table is empty, run `npm run seed` again.

### Override slots not updating
→ After saving an override, the old available/locked slots for that date are deleted and regenerated. Booked slots are never touched. If you see old times, hard-refresh the browser.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router 6, Recharts, date-fns |
| Backend | Node.js 18+, Express 4 |
| Database | MySQL 8 (local + production — same engine) |
| ORM | Sequelize 6 with mysql2 driver |
| Auth | JWT + OTP (Twilio-ready) |
| AI | Anthropic Claude API (mock fallback) |
| PDF | PDFKit + QRCode |
| Styling | Custom CSS Design System (DM Sans + Playfair Display) |
| Deployment | Railway (backend + MySQL) + Vercel (frontend) |
