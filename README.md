# SGA Skoda CRM

A lead management CRM for a Skoda automotive dealership — built to replace spreadsheet-based lead tracking with a multi-user web dashboard.

> **Note:** screenshots below show a local instance seeded with **fictional demo data**. No real customer information is included.

## Screenshots

### Login

![Login](screenshots/login.jpg)

### Dashboard

Lead KPIs, conversion rate, and the filterable lead table.

![Dashboard](screenshots/dashboard.jpg)

### Consultants

Per-consultant performance and assignment.

![Consultants](screenshots/consultants.jpg)

### Activity Log

Audit trail of every status change, remark, and assignment.

![Activity](screenshots/activity.jpg)

### Calendar

Follow-up dates across the month.

![Calendar](screenshots/calendar.jpg)

### Settings

Platforms, branches, and notification configuration.

![Settings](screenshots/settings.jpg)

### Accounts

User management with branch- and platform-scoped access.

![Accounts](screenshots/accounts.jpg)

## Features

- **Lead pipeline** — track leads through *Not Contacted → Contacted → Completed / Lost* with per-status counts and conversion rate
- **Multi-user access** — role-based accounts (ADMIN / USER / SUPERADMIN) scoped to a branch, a platform, or everything
- **Consultant assignment** — assign leads to sales consultants and track per-consultant performance
- **Activity audit log** — every status change, remark, and reassignment is recorded with the acting user and timestamp
- **Follow-up calendar** — two follow-up dates per lead, surfaced in a monthly calendar view
- **Google Sheets sync** — pull leads from a linked spreadsheet, with automatic column mapping
- **External lead upload** — CSV/XLSX import with a column-mapping preview before commit
- **Duplicate detection** — phone-number fingerprinting flags repeat enquiries
- **Excel export** — export the current filtered view to `.xlsx`
- **Push notifications** — new-lead and follow-up-due alerts via web push
- **Admin impersonation** — an admin can act as any consultant for support and debugging

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma 7 (with `@prisma/adapter-pg`)
- **Auth:** JWT sessions in an `HttpOnly` cookie (`jose`), scrypt password hashing
- **Styling:** TailwindCSS
- **Export:** `xlsx` and `jspdf`

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` in the project root:

```env
DATABASE_URL="postgresql://user:password@127.0.0.1:5432/sga_skoda?schema=public"
JWT_SECRET="<a-long-random-string>"

ADMIN_USERNAME="admin"
ADMIN_PASSWORD="<admin-password>"

SUPERADMIN_USERNAME="sudo"
SUPERADMIN_PASSWORD="<superadmin-password>"
```

### 3. Create the schema

```bash
npx prisma db push
```

### 4. Run

```bash
npm run dev     # development
npm run build && npm start   # production
```

Then open <http://localhost:3000/login> and sign in with the admin credentials above. The default admin user is created automatically on first login.

## Project Structure

```
├── prisma/
│   └── schema.prisma            # Lead, Consultant, User, LeadActivity, Settings
├── src/
│   ├── app/
│   │   ├── api/                 # Route handlers (auth, leads, consultants, sheets, webhooks…)
│   │   ├── dashboard/           # Main lead table + KPIs
│   │   ├── consultants/         # Consultant performance
│   │   ├── activity/            # Audit log
│   │   ├── calendar/            # Follow-up calendar
│   │   ├── accounts/            # User management
│   │   ├── settings/            # Platforms, branches, notifications
│   │   └── login/
│   ├── components/              # Sidebar, modals, notification system
│   ├── lib/                     # auth, prisma client, passwords, notifications
│   └── proxy.ts                 # Route protection (session check)
├── public/
└── shell.nix                    # Nix development shell
```

## Data Model

- **Lead** — name, phone, city, ad name, branch, status, two follow-up dates, remark, platform, assigned consultant, phone fingerprint
- **Consultant** — name and branch
- **User** — username, hashed password, role, optional branch/platform scope
- **LeadActivity** — immutable audit entries (actor, action, old → new value)
- **HiddenLead** — leads suppressed from the default view
- **Settings** — per-deployment configuration

## License

MIT
