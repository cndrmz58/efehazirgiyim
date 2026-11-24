# EFE Financial Operations Platform

Private payment and collection management for EFE HAZIR GIYIM.

- Company website: https://www.efehazirgiyim.com
- Planned application address: https://app.efehazirgiyim.com
- Status: **Supabase-backed payment table behind login; organization-wide payment access is applied to the production database, with frontend deployment and flow verification pending.**

The Supabase foundation adds invite-based login, password recovery, and
versioned RLS migrations for organizations, departments, and payments.
Production Auth has public signup and anonymous sign-ins disabled,
email/password login enabled, a 12-character minimum password, and the
production app/callback URLs. Three Auth users and an initial administrator
exist. SMTP/email templates and document uploads remain pending. The former
browser-only test mode has been removed; leftover browser test records are deleted on the next
app load and are never imported. No sample records are presented as company data.

## Current agreed delivery: a simple manually filled table

Following architecture approval, the initial scope was narrowed to an
Excel-like payment table rather than automated financial operations:

| Visible column | Agreed input |
| --- | --- |
| Ödeme Detayı | Manually entered payment detail |
| Ödeme Türü | Dropdown: Vergi, Kredi, Fatura, Maaş, Sigorta, Kira, Diğer |
| Ödeme Şekli | Dropdown: Çek, Nakit, Banka |
| Tutar | Decimal amount; TL (TRY) by default, EUR and USD selectable |
| Kalan | Manually entered exact balance in the same currency |
| Vade Tarihi | Optional, manually entered due date, independent of status |
| Gerçekleşen Ödeme Tarihi | Actual payment date, not the due date |
| Açıklama | Manually entered notes |
| Durum | Dropdown: Ödendi / Ödenmedi / Kısmen Ödendi |

The interface supports creating, editing, and deleting payments, searchable
and combined type/status/currency/year/month filters (year and month use the
due date), desktop tables, mobile record cards, and a data-driven General
Overview (`/overview`). The **Firmalar** (`/firms`) directory is an explicitly
approved UI-only prototype: it contains no sample companies, does not persist
firm data, and keeps adding firms unavailable until its backend is approved and
implemented. TL is the default currency
for both new records and the initial table filter. New or edited records become
visible by resetting other filters and selecting that record's currency.

The **Kasa Defteri** (`/cashbook`) is connected to Supabase through the existing
authenticated client, with Tarih, Açıklama, İşlem Türü, Borç (Giren), and Alacak
(Çıkan) columns. Apply the cashbook migration and operator activation below
before deploying this frontend; hosted activation is not yet verified.
There are no sample transactions.
An always-visible bottom month bar switches the displayed period from
Kasım 2026 through Aralık 2027 (14 months). The bar scrolls horizontally on
smaller screens. The initial selection is Kasım 2026; month selection is
UI-only and resets on page reload.
Active organization members can read their organization's records. Only the
owner-designated accounting account, assigned the separate `cashbook_role` by
trusted operator SQL, can add, edit, or delete. Organization admins and payment
managers are read-only unless explicitly assigned that cashbook role.
There is no automatic integration with payments. Each row has a required date,
description, and one alphabetically sorted transaction type: Avans, Diğer,
Fazla Mesai, Gelen Para, Kasa (Devir), Maaş Ödemesi, Mutfak Masrafı, Yemek, or
Yol Ücreti. The SQL constraint enforces the same list. The compact add/edit
form opens in a keyboard-accessible dialog instead of expanding across the
page. Each row has exactly one positive TL direction;
the other amount must be zero. Enter records within the selected month; cancel
the form and switch months to enter another month. Select the organization
explicitly when multiple memberships exist; balances never combine organizations.
The header displays the selected month and a TL cash summary. The UI calculation
uses only records dated in that exact year and month: balance = incoming − outgoing,
without automatically carrying a previous month's balance. Amounts use validated
decimal strings and exact `bigint` minor-unit arithmetic, including negative
balances. The table and summary use the same filtered records. Until the connection
loads actual cashbook records, totals display `—` with an explicit unavailable
notice, not a fabricated zero balance. A successful empty load shows zero.
SQL constraints and RLS enforce the same money and permission rules. Every
mutation has an append-only audit snapshot, and revision-checked edits/deletes
report conflicts without losing open form input. Use **Yenile** for other users'
changes. Failed, invalid or row-limit-truncated responses never produce totals.

### Activating Kasa Defteri

1. Back up the target database. In Supabase SQL Editor, apply
   [20261124140000_cashbook.sql](./supabase/migrations/20261124140000_cashbook.sql)
   after all existing migrations, then
   [enable_cashbook.sql](./supabase/operators/enable_cashbook.sql).
   Follow the transaction and migration-history procedure in
   [database.md](./database.md#approved-manual-cashbook-publiccashbook_entries).
2. The operator script resolves the owner-approved, confirmed Auth account and
   its single active organization membership. It fails instead of guessing if
   either is missing or ambiguous. It replaces only cashbook-role assignments
   within that organization, never payment/admin permissions, and adds no users
   or financial records.
3. If Kasa Defteri is already installed, run
   [cashbook_entry_types.sql](./supabase/operators/cashbook_entry_types.sql)
   once in Supabase SQL Editor. It records migration `20261124160000` and
   rejects unrecognized existing transaction types without rewriting any
   records. If it reports values, review those existing rows before continuing.
   Then deploy the frontend using the existing Supabase public environment values.
   No additional key or backend service is needed. Verify accounting-account
   CRUD and another active member's read-only access in the deployed app.

**Ödemeler**, **Genel Bakış**, the UI-only **Firmalar** directory, and
**Kasa Defteri** are selectable in the sidebar. The other entries, including **Ayarlar**, remain
visible but disabled.

### Using the payment table

1. Sign in at `/giris`. Without a session the workspace is not shown.
2. Select **Ödeme Ekle** and enter details, type,
   payment method (Çek, Nakit, or Banka), positive amount, remaining balance,
   currency, status, and optional notes. The remaining balance starts at the
   full amount for a new record.
3. Use a comma or period for decimals without thousands separators, for example
   `1250,50` or `1250.50`. Up to 12 whole and 2 decimal digits are supported.
4. Enter a due date if known. An **Ödendi** record requires an actual payment
   date. A **Kısmen Ödendi** record may include an actual payment date.
   Changing to **Ödenmedi** clears only the actual payment date, not the due
   date. Entering a remaining balance strictly between zero and the total
   automatically selects **Kısmen Ödendi**. A zero balance does not change
   the status; it remains a manual choice.
5. Edit or delete rows/cards as permitted, or open **Genel Bakış** for counts
   by status, the count by payment type, and each currency's total, paid and
   remaining amounts, paid percentage, and latest actual payment date. Amount
   totals use the remaining balance; status counts use the selected status.
   The paid-amount chart can be filtered by currency, year, and month, and
   groups amounts by actual payment date. Partial amounts use the recorded
   amount-minus-remaining difference and the record's single actual payment
   date.

Records are stored in `public.payments` and scoped by organization
(see [database.md](./database.md)). An explicitly assigned payment **viewer**
can read; a payment **manager** and an organization **admin** can also
create, edit, and delete. Department membership alone grants no payment access.
The UI hides unavailable actions, but PostgreSQL RLS enforces them. Every
insert, update, and delete is written to an append-only audit table.

Amounts and remaining balances travel as decimal strings (`::text` on read) and
are aggregated as integer minor units with `bigint`; currency totals are never
mixed or converted. Edits and deletes send the record revision; if another user changed
or removed the record first, nothing is saved, an explicit conflict message is
shown, the open form keeps the user's input, and the list reloads. Load
failures, including a server row limit truncating results, show an error
rather than partial tables or totals. There is no live push update; use
**Yenile** to fetch other users' changes.

A manually entered exchange-rate field is planned, but its location,
persistence, and meaning are deferred by the owner. The manually entered
remaining balance and partial status are approved additions to the initial
manual table; they do not record individual settlements or provide settlement
automation. No currency conversion or automatic exchange-rate lookup is part
of this delivery.

The detailed platform design below retains the original broader roadmap.
Its partial-settlement ledger, derived statuses, due-date workflow, and
additional modules are **future options**, not a requirement to build them now.
The manual table above takes precedence. Before database implementation, map
these fields explicitly, including manual payment status, optional due date,
and nullable actual date for unpaid records; do not silently substitute
derived ledger status.
Keep organization isolation, invitation-only access, decimal money,
and auditing as foundational requirements even for the simpler table.

## 1. Wider platform product scope (future roadmap)

The primary workspace is a searchable, filterable financial table, not an
analytics dashboard. Payments and collections have separate navigation entries
and forms but share financial rules and table components.

Navigation:

1. Overview: actionable due, overdue, and recently updated records.
2. Payments.
3. Collections.
4. Calendar.
5. Business Contacts.
6. Departments.
7. Documents.
8. User Management.
9. Settings.

Desktop tables support server-side search, sorting, pagination, department and
date filters, currency filters, and status filters. Mobile uses compact record
lists, accessible detail screens, and touch-friendly forms. Both layouts support
partial settlements, quick actions, and camera/file attachments.

An empty installation displays onboarding and empty states, not fabricated
balances. Totals are grouped by currency; different currencies are never added
together without an explicit future exchange-rate feature.

## 2. Approved architectural direction

```text
Desktop / tablet / mobile browser
              |
       Vercel: React SPA
              |
     Supabase publishable key + user session
              |
     +--------+---------+------------------+
     |                  |                  |
 Supabase Auth    PostgreSQL + RLS    Private Storage
                        |
               transactional RPCs
               constraints + audit triggers

Authenticated administrative requests
              |
     Supabase Edge Functions
              |
     verified organization administrator
              |
     Supabase Auth administrative API
```

### Frontend

- React, TypeScript with strict checking, Vite, and Tailwind CSS.
- React Router for authenticated routes and password recovery.
- TanStack Query for remote state and explicit cache invalidation.
- TanStack Table for financial tables, with database-side pagination/filtering.
- React Hook Form and Zod for forms; database validation remains authoritative.
- Generated Supabase database types and feature-scoped data-access functions.
- A decimal arithmetic library and string-based money contracts: never use
  JavaScript floating-point arithmetic for authoritative financial calculations.
  RPC responses explicitly serialize monetary values as decimal strings.
- Locale-aware presentation, accessible controls, and translation-ready labels.
  Proposed initial language: Turkish; proposed timezone: Europe/Istanbul.

### Backend

- Supabase PostgreSQL is the source of truth.
- Supabase Auth provides invite-only email/password access and recovery.
- RLS protects every exposed business table and all private storage objects.
- SQL functions perform multi-row financial mutations atomically.
- Edge Functions handle user invitations and other Auth administrative actions.
- No custom always-running application server is needed initially.
- All schema changes, policies, functions, and reference-data seeds are committed
  as migrations. Dashboard-only schema changes are not the deployment process.

## 3. Database design

See [database.md](./database.md) for the manual-payment schema and deferred database proposals.

## 4. Authentication and authorization

### Authentication lifecycle

1. Disable public signup in Supabase Auth; the application has no signup page.
2. Bootstrap the first organization administrator using a documented trusted
   administrative procedure, never a public endpoint.
3. Administrators invite users through an authenticated Edge Function.
4. The function verifies the JWT, active organization membership, and current
   administrator permission from the database before using the Auth admin API.
5. Invitations bind the authenticated user to approved memberships; possession
   of an Auth account alone grants no access to business data.
6. Password recovery uses Supabase's recovery flow and allowlisted redirect URLs.
   Login/recovery errors avoid unnecessarily disclosing account existence.
7. Supabase manages access/refresh tokens. The app handles session expiry,
   recovery, logout, and authorization failures, clearing cached business data
   on logout or organization/account changes.
8. Suspension is checked in database policies on every request. Revoking a
   membership blocks data access even if an access token has not expired.

An Auth user may already exist when invited to an organization. User management
must not globally disable or delete an account to revoke a single organization's
membership. Organization membership and global Auth identity remain separate.

Invitation issuance crosses the Auth/email and database boundary: it is not one
PostgreSQL transaction. Persist invitation intent, make retries idempotent, and
surface delivery/provisioning failures explicitly. An incomplete invitation must
not accidentally grant permissions.

Database roles and row-level policies are documented in [database.md](./database.md).

## 5. Document storage

Private storage is deferred; see the [database proposal](./database.md#document-storage).

## 6. Responsive application and PWA

- Desktop: readable financial table, sticky headers, filtering, and detail panel.
- Mobile/tablet: compact list rows, full-screen forms, accessible date/amount
  entry, and camera/file uploads. Do not rely on hover or color alone.
- Calendar supports accessible month and agenda views for due and completed
  payments/collections. Filters distinguish expected dates and actual dates.
- PWA includes an installable manifest, icons, and HTTPS.
- Cache only versioned static application assets. Do not cache Auth traffic,
  database responses, financial records, attachments, or signed URLs in a
  service worker.
- Initial release is online-only for financial work. Offline mutations and
  background replay are deliberately excluded to avoid conflict and duplicate
  settlement risks.

## 7. Proposed folder structure

```text
/
├── public/                    # Icons and static PWA assets
├── src/
│   ├── app/                   # Router, providers, authenticated layout
│   ├── components/
│   │   ├── ui/                # Accessible shared primitives
│   │   └── financial-table/   # Shared operational table/list
│   ├── features/
│   │   ├── auth/
│   │   ├── overview/
│   │   ├── financial-records/ # Shared rules, queries, forms, settlements
│   │   ├── payments/          # Payment-specific screens
│   │   ├── collections/       # Collection-specific screens
│   │   ├── calendar/
│   │   ├── contacts/
│   │   ├── departments/
│   │   ├── documents/
│   │   ├── users/
│   │   └── settings/
│   ├── lib/                   # Supabase client, money/date helpers
│   ├── types/                 # Generated database types
│   ├── locales/               # Translation messages
│   └── styles/
├── supabase/
│   ├── migrations/            # Schema, constraints, RPCs, RLS, audit
│   ├── functions/             # Privileged user administration
│   ├── tests/                 # Database integrity and authorization tests
│   ├── config.toml
│   └── seed.sql               # Reference data only, no company finances
├── tests/
│   └── e2e/
├── .github/workflows/         # CI checks
├── .env.example               # Placeholders only
├── vercel.json                # SPA rewrites and security headers
└── README.md
```

Feature tests live beside their implementation. Add folders only when their
milestone needs them; this tree is a proposal, not pre-created scaffolding.

## 8. Development milestones and acceptance gates

Milestones 0–1 are approved. The identity foundation within milestone 2 is
prepared for validation; hosted activation and in-app membership administration
are not complete. Later milestones
must respect the narrowed manual-table scope above; partial settlements and
additional modules require renewed confirmation rather than automatic rollout.

The owner subsequently approved removing the browser-local test mode and
connecting the manual payment table to Supabase with organization-scoped RLS,
revision-based conflict detection, and an append-only audit trail. Partial
settlements, reversals, and the other milestone 3 items remain out of scope.

| Milestone | Deliverables | Acceptance gate |
| --- | --- | --- |
| 0. Architecture approval | This proposal and business-policy decisions | Approved; manual-table simplification recorded above |
| 1. Foundation | Vite/React/TypeScript/Tailwind, routing, responsive shell, localization, CI, environment validation | Implemented; lint, typecheck, unit checks, production build, desktop/mobile browser checks |
| 2. Database and identity | Migrations, reference departments, Auth, RLS, invitation/recovery, membership administration | Local reset succeeds; cross-organization/department denial tests; signup disabled; recovery/invitation flows verified |
| 3. Payments | Financial table, contacts/categories, CRUD, partial settlement/reversal, audit history | Exact decimal balances, concurrent settlement safety, idempotency, edit conflict tests |
| 4. Collections | Collection forms/table reusing the financial core | Partial receipts and reversals obey the same tested constraints |
| 5. Documents and calendar | Private attachments, camera/files, calendar/agenda, operational overview | Storage authorization tests; upload failure handling; organization-timezone date tests |
| 6. Production readiness | PWA, accessibility, mobile checks, Vercel setup, recovery/runbooks | End-to-end role/financial flows, backup/restore rehearsal, no sensitive offline caches, owner acceptance |

Initial departments: Accounting, Finance, Purchasing, Sales, and Management.
These are reference/configuration data, not sample transactions.

## 9. Local development

Prerequisites: Node.js 24.22.2 (pinned in `.nvmrc`) and npm. The lockfile is
committed for repeatable dependency installation.

```sh
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open the localhost URL printed by Vite. With no Supabase settings, the app
shows a setup notice and no payment records; sign-in and data require all
three Supabase values.
Never expose the development server to the public internet.

Environment values are optional for viewing the foundation. If configuring
Supabase, supply all three values:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<public-key>
VITE_APP_URL=http://localhost:5173
```

Only current `sb_publishable_` keys are accepted. Once configured, **Güvenli
giriş** opens the Auth screen; it does not read or write payments remotely.
If you are working locally, use the URL and publishable key reported by
`supabase status`, not the production project. Invalid settings show field
names, never their values.

For local migration and database test instructions, see
[Local SQL validation](./database.md#local-sql-validation).

Every `VITE_` variable is public browser configuration. Never put a Supabase
service-role/secret key, database password, email credential, or future
OpenAI/Dropbox credential there. Administrative credentials belong only in the
Supabase Edge Function secret store.

Available validation commands:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Build before running browser tests:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Vitest/Testing Library covers the Turkish shell, filter selections/reset,
navigation, environment validation, exact decimal summaries, validation, and
visible storage failures. Playwright checks the production build
at desktop (1440px) and mobile (390px) widths, including navigation, deep links,
page overflow, and internal table scrolling. Its loopback-only preview server
starts and stops with the test run. Browser checks also cover test payment
creation/editing/deletion, paid-date validation, persistence across reloads,
currency-isolated overview totals, clearing data, and stale cross-tab edits.
Populated payments use mobile cards; the empty-table header remains scrollable.

CI runs lint, strict typechecking, unit tests, production build, and Chromium
browser checks. It does not need production credentials or company data.
PostgreSQL/pgTAP and Auth/RLS tests belong to the database milestone.

### Dependency advisory

At initial validation, `npm audit --omit=dev` reported no runtime dependency
vulnerabilities. The full audit reported six high-severity development-tool
findings from the same transitive `picomatch` advisory,
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
The audit reports all published `picomatch` versions affected; there is no
compatible patched version available in this dependency tree. Do not apply a
forced tooling downgrade without reviewing compatibility. These packages
process trusted repository patterns in development/CI, not financial input in
the deployed browser. Reassess the advisory before production release.

## 10. Supabase production activation (partially applied)

Hosted Auth's core production settings are configured. See
[database.md](./database.md#supabase-production-activation-partially-applied)
for the remaining Auth email and production verification steps.
The owner applied the migrations and explicit payment role assignments manually.
The matching frontend must be deployed and verified against production.

## 11. Vercel deployment and custom domain

The repository is linked to the `efe-financial-operations` Vercel project,
configured for Vite, `npm run build`, `dist`, and Node 24.x. Production
Supabase environment variables are set. The exact Supabase project origin is
allowlisted in the Content Security Policy; do not broaden it to arbitrary
hosts. The app domain is attached to the project and has served the application.

1. Keep the GitHub repository connected to Vercel.
2. Verify the configured SPA rewrites on direct links and future Auth callbacks;
   real static assets must continue to be served normally.
3. Configure preview environments to use a staging Supabase project; never
   use production credentials in previews. Keep every `VITE_` variable public.
4. Create only the `app` CNAME record Vercel specifies at the DNS provider.
   Do not change nameservers or the existing company website's root or `www`
   records.
5. Add the session gate before starting a public deployment. Then verify HTTPS,
   canonical URL, deep links, login, and password recovery on the real domain.
6. Coordinate Auth URL settings when changing the canonical domain; redeploy
   frontend configuration rather than embedding a hard-coded hostname in code.

Frontend rollback and database rollback are separate operations. Use compatible
migrations and a reviewed recovery plan; do not assume reverting a Vercel
deployment reverts the database.

## 12. Future extension points

Keep stable record identifiers, typed feature APIs, versioned migrations, and
audited transactional mutations. Add background jobs and integration-specific
tables only when needed.

Deferred: Dropbox, Excel/CSV import and export, automated document processing,
AI invoice extraction, OpenAI, reconciliation, accounting integrations, and
advanced dashboards. Third-party processing of company documents requires
separate company approval and data-handling decisions.

## 13. Decisions and remaining gates

- Architecture and milestone 1 were approved.
- The earlier browser-local test mode was retired at the owner's request; the
  payment table now uses Supabase behind login.
- Communication/questions and the initial UI are Turkish.
- The manual payment table uses the columns documented above. The optional
  due date is separate from the actual payment date; it does not change status.
- TL (TRY) is the default; EUR and USD are selectable.
- Manual exchange-rate behavior is deferred; do not implement conversion.
- The identity, manual-payment, and payment-access migrations are in the
  repository. The owner applies them to production manually via the Supabase
  SQL Editor (see [database.md](./database.md)), then assigns memberships.
- The broader roadmap is retained for reference, not automatic implementation.
- Confirm scanning, retention, recovery, and compliance requirements before any
  production document upload or live financial-data rollout.
