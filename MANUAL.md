# BlackWire FSM — Installation & User Manual

This is a complete, beginner-friendly guide to installing and using BlackWire FSM.
If you've never run a self-hosted app with Docker before, start at the top and work
down — every step is spelled out. If you just want a quick reference, see `README.md`
instead, which is written for people already comfortable with Docker.

---

## Table of Contents

1. [What You're Installing](#1-what-youre-installing)
2. [What You Need First](#2-what-you-need-first)
3. [Installing BlackWire FSM](#3-installing-blackwire-fsm)
4. [Logging In For the First Time](#4-logging-in-for-the-first-time)
5. [Securing Your Install](#5-securing-your-install)
6. [Using the App: A Tour](#6-using-the-app-a-tour)
7. [Setting Up Email (Optional but Recommended)](#7-setting-up-email-optional-but-recommended)
8. [The Customer Portal](#8-the-customer-portal)
9. [Importing Your Existing Data](#9-importing-your-existing-data)
10. [Backing Up Your Data](#10-backing-up-your-data)
11. [Updating to a New Version](#11-updating-to-a-new-version)
12. [Common Problems and Fixes](#12-common-problems-and-fixes)
13. [Getting Help](#13-getting-help)

---

## 1. What You're Installing

BlackWire FSM is field service management software for small contracting
businesses (electrical, HVAC, plumbing, handyman, etc.) — it covers the whole job
lifecycle: **Customer -> Property -> Job -> Schedule -> Technician -> Estimate ->
Invoice -> Payment**.

It's **self-hosted**, meaning it runs on a computer or server you control (your
office PC, a home server, a small cloud VM) rather than depending on someone else's
cloud service. Nothing about it requires an internet connection to function day to
day, though features like email notifications need one.

It's made of a few pieces that all run together via Docker:

- The **app itself** (what you see in your browser)
- A **database** (PostgreSQL) that stores all your data
- **File storage** (MinIO) for photos and documents
- A small **cache/queue service** (Redis)

You don't need to understand any of these individually — Docker starts them all
together with one command.

---

## 2. What You Need First

### A computer to run it on

Any of these work:
- Your own Windows, Mac, or Linux computer (for testing or a very small team)
- A dedicated Linux server or mini PC that stays on (recommended for real use)
- A cloud VM (e.g. a $5-10/month virtual server from any provider)

It should have at least 2GB of RAM and a few GB of free disk space to start.

### Software you need to install first

**Docker** and **Docker Compose** — these are free and do all the heavy lifting.

- **Windows or Mac**: install Docker Desktop from docker.com. This includes Docker
  Compose automatically.
- **Linux**: install Docker Engine and the Docker Compose plugin. On Ubuntu/Debian:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  ```
  Then log out and back in for the group change to take effect.

Check it worked:
```bash
docker --version
docker compose version
```
Both commands should print a version number, not an error.

### A way to get the BlackWire FSM files onto your computer

Either:
- Download the project as a ZIP and extract it, or
- If you have `git` installed: `git clone <repository-url>`

Either way, you'll end up with a folder containing files like `docker-compose.yml`,
`.env.example`, a `backend/` folder, and a `frontend/` folder.

---

## 3. Installing BlackWire FSM

Open a terminal (Command Prompt or PowerShell on Windows, Terminal on Mac/Linux) and
navigate into the project folder:

```bash
cd path/to/blackwire-fsm
```

### Step 1: Create your configuration file

The project ships with a template file called `.env.example`. Copy it to a new file
named `.env`:

```bash
cp .env.example .env
```

(On Windows Command Prompt, use `copy .env.example .env` instead.)

### Step 2: Fill in secrets

Open `.env` in any text editor (Notepad, TextEdit, VS Code, whatever you have). You'll
see lines like:

```
POSTGRES_PASSWORD=changeme_use_a_long_random_string
MINIO_ROOT_PASSWORD=changeme_use_a_long_random_string
JWT_SECRET=changeme_use_a_long_random_string
```

Replace each `changeme_...` value with a long random string. You don't need to
remember these — they're just secret keys the app uses internally. If you have a
terminal handy, this generates a good random value:

```bash
openssl rand -hex 32
```

Run it three times and paste a different result into each of the three password/secret
fields above. If you don't have `openssl`, any long random mix of letters and numbers
(20+ characters) works fine.

**Leave everything else in `.env` at its default for now** — you can change company
name, ports, and other settings later from inside the app or by editing `.env` again.

### Step 3: Start everything

```bash
docker compose up -d --build
```

This will take a few minutes the first time — it's downloading and building all the
pieces. You'll see a lot of text scroll by; that's normal. When it finishes, check
that everything started correctly:

```bash
docker compose ps
```

You should see several services (`backend`, `frontend`, `postgres`, `redis`, `minio`)
all showing as `running` or `healthy`. If something shows `restarting` or `exited`,
see Section 12, Common Problems, below.

### Step 4: Load demo data (optional but recommended for your first look)

This creates sample customers, jobs, and technician accounts so you have something to
click around in immediately:

```bash
docker compose exec backend npm run seed
```

You should see a message confirming customers and jobs were created, along with login
credentials for a demo admin, office, and a few technician accounts.

**If you're setting this up for real use and don't want demo data**, skip this step —
see Section 5, Securing Your Install, for creating your own first admin account
instead.

---

## 4. Logging In For the First Time

Open a web browser and go to:

```
http://localhost:8080
```

(If you're running Docker on a different computer than the one you're browsing from,
replace `localhost` with that computer's IP address or hostname — see the "Accessing
From Other Devices" part of Section 6 for details on setting this up properly.)

If you ran the seed script, log in with:

- **Email**: `admin@example.com`
- **Password**: `ChangeMe123!`

You'll land on the Dashboard. From here you can explore Customers, Jobs, Schedule, and
everything else — see Section 6 for a full walkthrough.

---

## 5. Securing Your Install

If you loaded demo data, **do this before using the app for real work**:

1. Log in as the seed admin account.
2. Go to **Users** in the sidebar.
3. For each seed account (`admin@example.com`, `dispatch@example.com`,
   `john@example.com`, etc.), either:
   - Click **Reset password** and set a real password only you know, or
   - Click **Deactivate** if you don't need that particular account.
4. If you want a completely fresh start with your own admin account instead of the
   seed data, see the command in `README.md` under "First administrator" for creating
   one directly, then deactivate the seed accounts.

**Also change**: the random secrets you generated in `.env` should stay private —
don't commit `.env` to a public code repository or share it. If you ever suspect a
secret has leaked, generate a new one and restart the backend
(`docker compose up -d backend`) — this will invalidate all existing login sessions,
so everyone will need to log in again.

---

## 6. Using the App: A Tour

### Dashboard

Your homepage after logging in. Shows today's jobs, jobs needing attention, unassigned
jobs, upcoming appointments, recent customers, estimates awaiting approval, and unpaid/
overdue invoices — the things you need to see first thing in the morning.

### Customers & Properties

A **Customer** is a person or company. Each customer can have multiple
**Properties** (service addresses) — useful for landlords, property managers, or
anyone with more than one location. Click into a customer to see their properties,
service history, portal access status, messages, and documents.

You can **archive** a customer instead of deleting them — this hides them from the
main list while keeping all their job/invoice history intact.

### Jobs

The heart of the app. A job belongs to one customer and one property, has a status
(New, Scheduled, En Route, In Progress, Completed, etc.), and can be assigned to one
or more technicians. From a job's page you can:

- Change its status
- Assign/reassign technicians
- Set it to repeat on a schedule (see "Recurring Jobs" below)
- Add photos, materials, and time entries (mostly done from a technician's phone)
- Create an estimate or invoice
- Send the customer an email (confirmation, reminder, "on my way", completion)

### Schedule

A day-view board showing each technician's assigned jobs, plus a list of unassigned
jobs you can quickly assign from. Switch days with the date picker at the top.

### The Technician Mobile Experience

If you log in as a Technician (or a user with the Technician role), the Jobs and Job
Detail pages are built mobile-first with large tap targets: **En Route**, **Arrived**,
**Start Work**, **Add Photo**, **Add Material**, **Customer Signature**, **Complete
Job**. This is designed to be used on a phone in the field.

### Estimates & Invoices

Create either from scratch or straight from a job. Both support multiple line items,
tax, and a running total. An estimate can be sent, then approved or declined (approval
records who approved it and when). An invoice can be sent, paid (partially or in
full), voided, and always shows a downloadable PDF.

**Draft** documents can be freely edited. **Sent** documents can be reopened for
correction as long as nothing depends on them yet (no payments recorded on an invoice,
no approval recorded on an estimate) — otherwise, void/decline and create a new one so
your records stay accurate.

### Price Book

A reusable catalog of materials and services (name, cost, sale price, whether it's
taxable). Once you've added something here, it shows up as a quick "add from price
book" option when building job materials, estimate line items, or invoice line items.

### Payments

Recorded against a specific invoice — cash, check, card, ACH, or other. The invoice's
status (Sent -> Partially Paid -> Paid) updates automatically as payments come in.

### Recurring Jobs

On any scheduled job, set **Repeats** to weekly, biweekly, monthly, quarterly,
semi-annually, or annually. A background process checks every 30 minutes and
automatically creates the next occurrence when it's due, then schedules the one after
that — so a maintenance contract with quarterly visits keeps generating new jobs
without you doing anything.

### Reports

Revenue collected, outstanding/overdue invoices, jobs completed, technician hours,
estimate win/loss rate, and top materials used — all filterable by date range.

### Users & Roles

Three roles: **Admin** (full control), **Office/Dispatcher** (day-to-day scheduling,
billing, customer management), and **Technician** (their own assigned jobs only). A
single person can hold more than one role — useful if you're a one-person or very
small operation and need to be your own dispatcher and technician.

### Settings

Company name/address/phone/email (used on PDFs), default labor rate, default tax rate,
and the prefix used for job/estimate/invoice numbers (e.g. changing `JOB-` to
`ACME-`). Also where you turn on automatic appointment reminders if you want them —
they're off by default.

### Notification Log

Every email/text the app has tried to send, with whether it actually sent, failed, or
was skipped (usually because email isn't configured yet — see Section 7). Useful for
figuring out "did the customer actually get that email."

### Light / Dark Mode

Click the toggle at the bottom of the sidebar to switch. Your choice is remembered on
that device.

### Accessing From Other Devices on Your Network

By default the app is only easily reachable from the same computer it's running on
(`localhost`). To use it from a phone, tablet, or another computer on the same WiFi/
network:

1. Find the IP address of the computer running Docker (e.g. `192.168.1.50`). On
   Linux/Mac, run `ip addr` or `ifconfig`. On Windows, run `ipconfig`.
2. In `.env`, set:
   ```
   PUBLIC_API_URL=http://192.168.1.50:3001
   PUBLIC_S3_URL=http://192.168.1.50:9000
   PUBLIC_APP_URL=http://192.168.1.50:8080
   ```
   (using your actual IP instead of the example)
3. Rebuild the frontend so it picks up the new address:
   ```bash
   docker compose up -d --build frontend
   docker compose up -d backend
   ```
4. On the other device, browse to `http://192.168.1.50:8080`.

If this still doesn't work, your computer's firewall may be blocking incoming
connections on ports 8080/3001/9000 — check your OS firewall settings and allow them.

---

## 7. Setting Up Email (Optional but Recommended)

Without email configured, the app still works completely — notifications just get
logged as "skipped" instead of sent, and you can always use each document's PDF
directly with the customer instead.

To turn on real email sending, edit `.env`:

```
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=you@yourcompany.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=you@yourcompany.com
SMTP_FROM_NAME=Your Company Name
```

Any SMTP provider works — Gmail (with an app password), Office 365, SendGrid,
Postmark, or your own mail server. A common gotcha: many providers require
`SMTP_FROM_EMAIL` to match the account you authenticated with (`SMTP_USER`) — if
emails fail, try setting them to the same address first.

After editing `.env`, restart just the backend (no rebuild needed):
```bash
docker compose up -d backend
```

Then check **Notification Log** in the app after triggering a test email (e.g. click
"Email Confirmation" on a scheduled job) to confirm it went through.

---

## 8. The Customer Portal

Customers can get their own login to view appointments, estimates, invoices, message
your office, and upload files you've requested — without needing a staff account.

To invite a customer:
1. Open their customer page.
2. Click **Send Portal Invite** (requires an email on file for them).
3. They receive an email with a link valid for 48 hours to set their own password.

Customers log in at `/portal/login` (e.g. `http://192.168.1.50:8080/portal/login`),
completely separately from staff logins — a customer account can never access staff
pages, and staff accounts can't log into the portal.

**On payments**: unless you've configured a payment processor (not included out of the
box — see `README.md`), clicking "Pay" in the portal doesn't charge anything. It lets
the customer know online payment isn't set up yet and notifies your office so a human
follows up.

---

## 9. Importing Your Existing Data

If you're moving from another platform, you can bulk-import via CSV from the
**Customers**, **Jobs**, and **Price Book** pages ("Import CSV" button).

- **Customers**: needs at minimum `firstName` and `lastName` columns. Optional columns
  include phone, email, billing address, and — if you want to create their first
  service property at the same time — `propertyAddressLine1`, `propertyCity`,
  `propertyState`, `propertyZip`.
- **Jobs**: needs `customerEmail` (must match an existing customer already in the
  system) and `title`. Optional: `propertyAddressLine1` (matches an existing property
  by address, or creates a new one), `description`, `priority`, `status`,
  `scheduledDate`.
- **Price Book**: needs `name` and `salePrice`. Optional: `sku`, `description`,
  `cost`, `taxable` (true/false).

Each page also has an **Export CSV** button — export first to see the exact column
format expected, edit that file, then re-import.

**Import order matters**: import Customers first, then Jobs (since jobs need to match
an existing customer by email).

After importing, you'll see a summary of how many rows succeeded and a list of any
rows that had problems (e.g. a job row whose customer email didn't match anyone) — fix
those rows and re-import just those.

**Note**: invoice import isn't offered. Invoices carry real accounting history
(payments, balances), and a wrong import could quietly corrupt financial records — you
can export existing invoices to CSV, but recreating historical invoices should be done
by hand or with direct database assistance so a person reviews each one.

---

## 10. Backing Up Your Data

Do this regularly, especially before updating the app.

```bash
# Database
docker compose exec postgres pg_dump -U fsm fsm > backup_$(date +%F).sql

# Uploaded photos/documents
docker compose exec minio sh -c "tar czf - /data" > minio_backup_$(date +%F).tar.gz
```

Store these backup files somewhere other than the same disk your Docker volumes live
on (an external drive, another server, cloud storage) — a backup on the same failing
disk doesn't help you.

**To restore** the database from a backup:
```bash
cat backup_2026-08-23.sql | docker compose exec -T postgres psql -U fsm fsm
```

---

## 11. Updating to a New Version

1. **Back up first** (see above).
2. Get the new files (pull the latest code, or download/extract a new ZIP over your
   existing folder — your `.env` file won't be touched since it's not part of the
   app's source files).
3. Rebuild and restart:
   ```bash
   docker compose up -d --build
   ```
4. Apply any new database changes:
   ```bash
   docker compose exec backend npx prisma migrate deploy
   ```

This is safe to run even if there's nothing new to apply — it just does nothing in
that case.

---

## 12. Common Problems and Fixes

### "Cross-Origin Request Blocked" or a generic network error when logging in

This almost always means the browser can't reach the backend at all (wrong address,
backend not running, firewall) rather than an actual CORS policy issue. Check:
```bash
docker compose ps
```
If `backend` isn't showing as running, check its logs:
```bash
docker compose logs backend --tail 100
```

### Photos won't load / links look broken

Check that `PUBLIC_S3_URL` in `.env` is set to an address your browser can actually
reach (not the internal Docker hostname `minio`) — see the "Accessing From Other
Devices" part of Section 6.

### PDF download says "Not authenticated"

This means you're looking at an old build — current versions fetch PDFs through the
authenticated app rather than a plain link. Make sure you've rebuilt after updating:
`docker compose up -d --build`.

### Backend keeps restarting / crash-looping after `docker compose up`

Check the logs:
```bash
docker compose logs backend --tail 100
```
A common cause on some systems is a Prisma/OpenSSL mismatch inside the container —
if you see an OpenSSL-related error, make sure you're using an unmodified
`backend/Dockerfile` from this project, which already handles this.

### I ran `docker compose up` before and now migrations won't apply cleanly

If you've been testing and want a completely clean slate (this **deletes all data**):
```bash
docker compose down -v
docker compose up -d --build
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

### I forgot my admin password

Reset any user's password directly against the database:
```bash
docker compose exec backend node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const passwordHash = await bcrypt.hash('YourNewPassword123!', 12);
  await prisma.user.update({ where: { email: 'admin@example.com' }, data: { passwordHash } });
  console.log('Password updated.');
})();
"
```

---

## 13. Getting Help

This is an open-source project — if you hit a problem not covered here:

1. Check `docker compose logs backend` and `docker compose logs frontend` for error
   messages — they usually point directly at the problem.
2. Check the project's issue tracker (wherever you obtained this code) to see if
   someone's already hit the same problem.
3. If you're comfortable, open a new issue with: what you were trying to do, the exact
   error message, and the output of `docker compose ps`.

This software is provided as-is under an open-source license — there's no paid support
line, but the community (and the code itself, which is meant to be readable) is the
resource available to you.
