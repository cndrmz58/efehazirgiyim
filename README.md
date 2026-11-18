# EFE Financial Operations Platform

Private payment and collection management for EFE HAZIR GIYIM.

- Company website: https://www.efehazirgiyim.com
- Planned application address: https://app.efehazirgiyim.com
- Status: **browser-local test payments; Supabase identity foundation prepared, not deployed**.

The Supabase foundation adds invite-based login, password recovery, and a
versioned RLS migration for organizations and departments. Hosted Auth,
shared financial records, and uploads are not active. The optional test workspace stores only
owner-entered example records in this browser, never in Supabase. No sample
financial records are presented as company data. Do not enter real company
financial or personal information into test mode.

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

### Financial domain (optional later expansion)

For the originally requested full platform, use one canonical
`financial_records` table with a `direction` of `payment` or
`collection`, and one `settlements` ledger for actual payments/receipts. This
avoids maintaining two implementations of balances, permissions, and auditing.
Direction-specific forms expose supplier/beneficiary versus customer wording.

Read-only `payments` and `collections` views provide separate query surfaces.
They must use `security_invoker = true` so underlying RLS remains effective.
Mutations go through narrow, authorized RPCs, not writable views.

No separate approval workflow, bank integration, tax accounting, foreign exchange
conversion, or native mobile app is included in the initial scope.

## 3. Full-platform database proposal (not migrated)

This is the retained full-platform proposal. It is not the final schema for the
narrowed manual-payment MVP. In particular, manual payment state and actual
payment date must be modeled directly for the initial table. Collections,
settlements, and derived financial calculations remain deferred.

Unless stated otherwise, identifiers are UUIDs. Business tables include
`organization_id`, `created_at`, `updated_at`, `created_by`, and `updated_by`
where applicable. Actor fields are assigned by the database, not trusted from
request payloads. Timestamps use `timestamptz`; business dates use `date`.

| Table | Principal columns and purpose |
| --- | --- |
| `organizations` | `id`, `name`, `timezone`, `default_currency`, `archived_at` |
| `profiles` | `user_id` referencing `auth.users`, `display_name`; authentication credentials remain in Auth |
| `organization_memberships` | `id`, `organization_id`, `user_id`, `organization_role_id`, `status`; unique organization/user |
| `departments` | `id`, `organization_id`, `name`, `archived_at`; organization-local unique name |
| `roles` | `id`, `key`, `scope` (`organization` or `department`); system-managed role definitions |
| `permissions` | `id`, unique `key`; explicit capabilities such as `records.read` and `settlements.create` |
| `role_permissions` | `role_id`, `permission_id`; unique pair |
| `department_memberships` | `organization_id`, `department_id`, `organization_membership_id`, `role_id`; unique membership/department |
| `business_contacts` | `id`, `organization_id`, `name`, `contact_type` (`supplier`, `customer`, `both`, `other`), optional contact details, `archived_at` |
| `financial_categories` | `id`, `organization_id`, `name`, `direction`, `archived_at` |
| `currencies` | ISO currency `code`, supported `minor_units`; system-managed reference data |
| `financial_records` | `id`, `organization_id`, `department_id`, `direction`, `contact_id`, `category_id`, `description`, `amount numeric(20,4)`, `currency_code`, optional `invoice_date`, `due_date`, `notes`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, `archived_at`, `version` |
| `settlements` | `id`, `organization_id`, `financial_record_id`, `entry_type` (`settlement` or `reversal`), positive `amount numeric(20,4)`, `occurred_on`, `notes`, optional `reverses_settlement_id`, `idempotency_key`, creation actor/time |
| `documents` | `id`, `organization_id`, `department_id`, optional `financial_record_id`, `storage_path`, original filename, declared/detected MIME metadata, `size_bytes`, upload state, upload actor/time, `archived_at` |
| `audit_logs` | `id`, `organization_id`, optional `department_id`, actor, action, entity type/id, changed fields, event time, request correlation identifier |
| `user_invitations` | `id`, `organization_id`, normalized email, requested organization role and department assignments, status, invited Auth user id when available, inviter/time; no invitation tokens |

### Relationships and integrity

- Every department membership requires an active organization membership.
- Composite foreign keys include `organization_id` to prevent cross-organization
  contact, department, category, record, settlement, and document references.
- A linked document must also match its record's department.
- Role scope must match the membership type; category direction must match the
  record direction. These invariants are enforced in the database.
- Financial amount is positive and respects the selected currency's precision.
  Settlement currency is inherited from its parent record and cannot differ.
- Financial records reference a department; users may belong to multiple
  departments. Archived departments accept no new operational records.
- Financial history is not cascade-deleted. Referenced entities are archived;
  settled records are corrected through controlled changes and ledger reversals.
- Financial indexes begin with organization/department where useful, followed
  by due date, direction, contact, and creation time. Ledger and audit indexes
  cover parent/entity identifiers and time. Search indexes follow actual queries.
- Calendar and table queries use the same permission-filtered database queries.

### Balance, dates, and status

```text
settled_amount = SUM(settlement entries) - SUM(reversal entries)
remaining_amount = record.amount - settled_amount
```

Amounts and statuses are calculated in PostgreSQL, not independently maintained
in editable columns.

- Settlement state: unpaid/unreceived, partial, or paid/collected.
- Due state: upcoming, due today, or overdue while a balance remains.
- Lifecycle state: active, cancelled, or archived.
- Partial overdue records display both properties rather than losing one.
- Actual completion date is the date the effective settlement ledger reaches
  the record amount; settlement history retains every individual actual date.
  It is null again if a correction reopens the balance.
- Reversals retain the original entry and reason. Each original entry can be
  fully reversed once; a corrected amount is entered as a new settlement.
- Initial policy: reject overpayments/overcollections. Credits and advances
  require a later explicit model.
- Record currency/direction cannot change after ledger entries exist. Changes
  to amount cannot reduce it below the effective settled total.
- Cancellation requires a zero effective settled amount and a reason.
- Due-state calculations use the organization's date, not the browser timezone.

### Concurrent updates

Settlement RPCs lock the parent record before checking and inserting ledger
entries. This prevents simultaneous requests from exceeding its amount.
Organization-scoped idempotency keys prevent duplicate settlements on retries.
Record edits use a version check and report conflicts rather than overwriting
another employee's changes. Record edits and reversals share the parent-lock
discipline. All related changes and audit entries commit or roll back together.

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

### Proposed initial access matrix

| Capability | Organization admin | Department manager | Department editor | Department viewer |
| --- | --- | --- | --- | --- |
| Read financial records | All organization departments | Assigned departments | Assigned departments | Assigned departments |
| Create/edit records and add settlements | Yes | Assigned departments | Assigned departments | No |
| Reverse settlements, cancel/archive records | Yes | Assigned departments | No | No |
| Upload documents | All departments | Assigned departments | Assigned departments | No |
| Read documents | All departments | Assigned departments | Assigned departments | Assigned departments |
| Read financial audit history | Organization-wide | Assigned departments | No | No |
| Manage users, departments, and access | Yes | No | No | No |
| Manage organization settings | Yes | No | No | No |

The organization member role alone grants no financial department access.
Initial roles are fixed and seeded; an arbitrary permission/role editor is not
part of phase one. Prevent removing or suspending the last active administrator.
Users cannot change their own roles through profile or membership endpoints.

Proposed contact policy: active users with at least one authorized department
can read the organization-wide business-contact directory. Managers and admins
can maintain it. Contact visibility does **not** grant visibility into related
transactions. This sharing policy requires architectural approval.

### Database enforcement

- Enable RLS on every exposed business table, including memberships, documents,
  configuration, and audit logs. Explicitly grant only required operations.
- Apply organization isolation and current permission checks to both reads and
  writes; write policies include `WITH CHECK`.
- Never authorize using editable user metadata or frontend route guards.
- Restrict membership, role, invitation, and configuration writes to authorized
  administrative operations.
- Revoke direct financial ledger writes. Allow only specific audited RPCs.
- Prefer invoker functions. Where a definer function is necessary, fix its
  `search_path`, qualify objects, restrict execution grants, validate the caller
  and every target identifier, and avoid dynamic SQL.
- Keep authorization helpers in a non-exposed schema and design them to avoid
  recursive membership RLS evaluation.
- Audit triggers record financial and administrative changes. Application users
  cannot insert, rewrite, or delete audit entries. Never log passwords, tokens,
  service credentials, or document bodies.
- Audit logs are application-append-only, not tamper-proof against database
  owners. External immutable retention is a separate future requirement.

## 5. Document storage

- Use a private Supabase Storage bucket, never public invoice URLs.
- Suggested object path:
  `organization-id/department-id/document-id/random-object-name`.
- Storage RLS checks active membership, department permissions, and matching
  document metadata; guessing a path must not grant access.
- Downloads use authenticated access or short-lived signed URLs after an
  authorization check. Signed URLs remain usable until expiry, so keep expiry
  short and never persist them in database records.
- Uploads have explicit pending/ready/failed states. Failed uploads are visible
  as failures; bounded cleanup removes orphaned pending uploads.
- Validate allowed formats and file size on trusted infrastructure, not just
  the file picker. Treat client MIME metadata as untrusted; do not render
  executable attachments inline. Initial scope: PDF, JPEG, and PNG, up to 10 MiB.
- Camera capture is offered where supported, alongside a standard file input.
- Malware scanning is not supplied automatically by Storage. If mandatory,
  choose a scanner before enabling production uploads; otherwise document the
  residual risk and restrict file formats and download behavior.

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

Install the Supabase CLI, a Docker-compatible runtime, and `psql` to validate
the identity foundation locally:

```sh
supabase start
supabase db reset
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/tests/identity.sql
```

`supabase db reset` is for the disposable local database only: it destroys local
data and reapplies migrations. Never use reset as a production deployment step.

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

## 10. Supabase production activation (not applied)

1. Verify migration, invitation, recovery, login, and logout on an isolated
   staging project before deploying. Enable backups and review the production
   recovery plan. Confirm the linked project, inspect `supabase db push
   --dry-run`, and run `supabase db push` only after review and approval.
2. In production Supabase Auth, disable public signup and anonymous sign-ins,
   keep the email provider enabled, and require passwords of at least 12
   characters. Set up SMTP. Set the Site URL to `https://app.efehazirgiyim.com`
   and allow `https://app.efehazirgiyim.com/auth/callback`. Do not allow
   localhost or arbitrary preview domains on production Auth.
3. Paste the contents of [invite.html](./supabase/templates/invite.html) and
   [recovery.html](./supabase/templates/recovery.html) into the matching hosted
   Auth email templates. Local `config.toml` does not configure hosted Auth.
   The fragment keeps the one-time token out of HTTP request URLs; the app
   consumes it only after the user submits a new password.
4. In Vercel **Production** only, set the three public `VITE_` variables from
   the local-development section with production values. The configured
   project origin must match the `connect-src` allowlist in `vercel.json`.
   Do not use database credentials or a secret key in these variables.
5. Invite the initial administrator from the Supabase Dashboard. After their
   email and Auth UUID are verified, a trusted database operator can create
   the organization, departments and active membership in one transaction
   (see below). Invitees without an active membership have no business access.
   The application cannot change memberships, including for administrators.

Operator example for an empty target, to adapt and review before execution:

```sql
begin;
with new_org as (
  insert into public.organizations (name) values ('EFE Hazır Giyim')
  returning id
), initial_departments as (
  insert into public.departments (organization_id, name)
  select id, d.name from new_org
  cross join (values ('Muhasebe'), ('Finans'), ('Satın Alma'), ('Satış'), ('Yönetim')) d(name)
)
insert into public.organization_memberships (organization_id, user_id, role, active)
select id, '<verified-auth-user-uuid>'::uuid, 'admin', true from new_org;
commit;
```

In-app invitations, audited membership administration, remote payments, and
private document storage are deferred. Do not import browser test records.

## 11. Vercel deployment and custom domain

The foundation includes Vite build settings, extensionless SPA-route rewrites,
and baseline security headers in `vercel.json`. A preview deploy is possible,
but it is **only a browser-local test preview**, not a secure working platform.
The current Content Security Policy permits same-origin connections only;
before connecting Supabase, add the exact project HTTPS/WebSocket origins
and test the policy. Do not broaden it to arbitrary hosts.

1. Connect the GitHub repository to Vercel.
2. Select Vite; build with `npm run build`; publish `dist`.
3. Configure the public environment variables for each Vercel environment.
   Production targets production Supabase; previews target staging, never
   production by default.
4. Verify the configured SPA rewrites on direct links and future Auth callbacks;
   real static assets must continue to be served normally.
5. Review the baseline security headers and extend the Content Security Policy
   only for the exact Supabase origins when that integration is implemented.
   Never place secrets in Vercel frontend build variables.
6. Add `app.efehazirgiyim.com` in Vercel and create the DNS record Vercel
   specifies. Do not modify the existing company website's root or `www` records.
7. Verify HTTPS, canonical application URL, deep links, login, password recovery,
   invitation acceptance, and private document access on the real domain.
8. Coordinate Auth URL settings when changing the canonical domain; redeploy
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
- The identity foundation is in the repository; production activation and
  the narrowed remote payment schema are separate steps.
- The broader roadmap is retained for reference, not automatic implementation.
- Confirm scanning, retention, recovery, and compliance requirements before any
  production document upload or live financial-data rollout.
