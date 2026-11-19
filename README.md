# EFE Financial Operations Platform

Private payment and collection management for EFE HAZIR GIYIM.

- Company website: https://www.efehazirgiyim.com
- Planned application address: https://app.efehazirgiyim.com
- Status: **browser-local test payments; Supabase Auth configured and three Auth users created, but memberships and database migrations are not deployed; Vercel app deployment awaits DNS and the login gate**.

The Supabase foundation adds invite-based login, password recovery, and a
versioned RLS migration for organizations and departments. Production Auth
now has public signup and anonymous sign-ins disabled, email/password login
enabled, a 12-character minimum password, and the production app/callback URLs.
Three Auth users exist, but organization/department memberships are not
assigned. The Vercel production project is configured, and the app subdomain
is attached, but DNS and deployment remain pending. SMTP and hosted email
templates, shared financial records, and uploads are not active. The optional
test workspace stores only owner-entered example records in this browser,
never in Supabase. No sample financial records are presented as company data.
Do not enter real company financial or personal information into test mode.

## Current agreed delivery: a simple manually filled table

Following architecture approval, the initial scope was narrowed to an
Excel-like payment table rather than automated financial operations:

| Visible column | Agreed input |
| --- | --- |
| Ödeme Detayı | Manually entered payment detail |
| Ödeme Türü | Dropdown: Vergi, Kredi, Fatura, Maaş, Sigorta, Kira, Diğer |
| Tutar | Decimal amount; TL (TRY) by default, EUR and USD selectable |
| Vade Tarihi | Optional, manually entered due date, independent of status |
| Gerçekleşen Ödeme Tarihi | Actual payment date, not the due date |
| Açıklama | Manually entered notes |
| Durum | Dropdown: Ödendi / Ödenmedi |

The interface supports creating, editing, and deleting test payments, searchable
and combined type/status/currency filters, desktop tables, mobile record cards,
and a data-driven General Overview (`/overview`). TL is the default currency
for both new records and the initial table filter. New or edited records become
visible by resetting other filters and selecting that record's currency.

Only **Ödemeler** and **Genel Bakış** are selectable in the sidebar. The
other entries, including **Ayarlar**, are visible but disabled.

### Using test mode

1. Open `/payments` and select **Test modunu aç**.
2. Select **Test Ödemesi Ekle** and enter example details, type, positive amount,
   currency, status, and optional notes.
3. Use a comma or period for decimals without thousands separators, for example
   `1250,50` or `1250.50`. Up to 12 whole and 2 decimal digits are supported.
4. Enter a due date if known. An **Ödendi** record requires an actual payment
   date. Changing to **Ödenmedi** clears only the actual payment date, not
   the due date.
5. Edit or delete individual rows/cards, or open **Genel Bakış** to see total,
   paid and unpaid record counts, the count by payment type, and each
   currency's amounts, percentage of the total amount paid, and latest
   actual payment date.
6. Reloading retains test records and test-mode state in this browser.
   **Test modunu kapat** hides records without deleting them.
   **Tüm test verilerini sil** asks for confirmation, deletes them, and exits
   test mode. This also recovers malformed test storage after confirmation.

Test mode is off on first use and is clearly labeled even when deployed as a
preview. It does not depend on Supabase configuration. Records and mode state
are stored under the versioned localStorage key `efe:test-payments:v1`.
Browser storage is not encrypted, shared between employees, access-controlled,
audited, backed up, or suitable for real company records. Clearing browser data
or changing the origin/browser loses access to these examples. No automatic
seed records, demo login, network persistence, or simulated production save
are provided.

Amounts are stored as canonical decimal strings and aggregated as integer
minor units with `bigint`; currency totals are never mixed or converted.
Every edit/deletion immediately updates the shared overview. Storage failures
and invalid stored data show explicit errors instead of false success or
silent resets. Cross-tab storage events refresh the view; stale edit revisions
and detected snapshot conflicts are rejected. Browser storage has no atomic
multi-user transaction guarantees; collaborative editing requires the future
database-backed workflow.

A manually entered exchange-rate field is planned, but its location,
persistence, and meaning are deferred by the owner. No currency conversion,
automatic exchange-rate lookup, partial-settlement balance, or settlement automation
is part of this initial manual-table delivery.

The detailed platform design below retains the original broader roadmap.
Its partial-settlement ledger, derived statuses, due-date workflow, and
additional modules are **future options**, not a requirement to build them now.
The manual table above takes precedence. Before database implementation, map
these fields explicitly, including manual payment status, optional due date,
and nullable actual date for unpaid records; do not silently substitute
derived ledger status.
Keep organization/department isolation, invitation-only access, decimal money,
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

An additional owner-approved pre-backend increment adds browser-local test
payment CRUD and its live overview. This does not complete the database-backed
payment module or change the future authentication/RLS requirements.

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
shows the real-backend setup notice and the optional test workspace at `/payments`.
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
for the remaining Auth email, user provisioning, and database migration steps.
The production database migrations have not been deployed.

## 11. Vercel deployment and custom domain

The repository is linked to the `efe-financial-operations` Vercel project,
configured for Vite, `npm run build`, `dist`, and Node 24.x. Production
Supabase environment variables are set. The exact Supabase project origin is
allowlisted in the Content Security Policy; do not broaden it to arbitrary
hosts. The app domain is attached to the project, but its DNS record is not
configured and no deployment has been made.

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
- Browser-local test data with reload persistence, clearing controls, and a
  per-currency overview were subsequently approved before backend development.
- Communication/questions and the initial UI are Turkish.
- The manual payment table uses the columns documented above. The optional
  due date is separate from the actual payment date; it does not change status.
- TL (TRY) is the default; EUR and USD are selectable.
- Manual exchange-rate behavior is deferred; do not implement conversion.
- The identity and manual-payment migrations are in the repository. Hosted
  rollout and application access to the payment table remain separate steps.
- The broader roadmap is retained for reference, not automatic implementation.
- Confirm scanning, retention, recovery, and compliance requirements before any
  production document upload or live financial-data rollout.
