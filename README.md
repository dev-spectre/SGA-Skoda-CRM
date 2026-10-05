# SGA Skoda CRM

A Customer Relationship Management system for Skoda automotive dealerships, built with Next.js and Prisma.

## Overview

A CRM platform designed for Skoda dealerships to manage customers, consultants, service appointments, and vehicle sales. Features impersonation for admin access and notification systems.

## Features

- **Customer management** — track leads and customers
- **Consultant management** — assign and manage sales consultants
- **Service appointments** — schedule and track services
- **Impersonation** — admin can impersonate consultants
- **Notifications** — toast notification system
- **Proxy routing** — custom proxy for external services

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Styling:** TailwindCSS
- **Dev environment:** Nix shell

## Getting Started

```bash
npm install
npm run dev
```

## Project Structure

```
├── app/                     # Next.js App Router pages
├── src/
│   ├── components/          # React components
│   │   ├── ImpersonationBanner.tsx
│   │   └── NotificationInit.tsx
│   ├── proxy.ts             # Proxy routing
│   └── instrumentation.ts   # Monitoring
├── prisma/
│   └── schema.prisma        # Database schema
├── public/                  # Static assets
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── shell.nix                # Nix development shell
```

## License

MIT
