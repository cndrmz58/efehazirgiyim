# EFE Financial Operations Platform

**Status: architecture proposal — awaiting approval.** This repository does not yet contain a runnable application or Supabase migrations. The setup commands below describe the intended workflow after implementation.

The private platform will replace EFE HAZIR GIYIM's Excel payment and collection trackers. Its primary workspace will be a searchable, filterable transaction table, not an analytics dashboard. The public website at `www.efehazirgiyim.com` stays separate; the production application is planned for `https://app.efehazirgiyim.com`.

## Architecture

- **Web:** A React, TypeScript, Vite and Tailwind CSS single-page application hosted on Vercel. Supabase Auth manages sessions; the browser uses the Supabase URL and publishable key to make authenticated requests to Postgres and private Storage. Supabase Edge Functions are reserved for privileged operations, starting with account invitations and lifecycle management.
- **Operations:** Payments and Collections use the same table and detail patterns, with server-side pagination, sorting and filters for department, status, currency and dates, plus search by description or counterparty. Desktop shows detailed columns and forms; tablet and phone use condensed lists, touch-friendly forms and quick settlement actions. Documents can be selected from files or captured with a phone camera. Quick actions use the same validation and permissions as full forms.
- **Navigation:** Overview (work queues and due items), Payments, Collections, Calendar, Business Contacts, Departments, Documents, User Management and Settings. Calendar uses transaction dates for upcoming and overdue items and settlement dates for completed items. Authorized activity history is available on each transaction.
- **PWA:** Provide an installable manifest and icons. Any service worker caches only versioned public shell assets, never authenticated API responses, accounts, documents or financial records. No offline writes or native apps are planned.
- **Integration boundaries:** Keep UI, financial write operations and document storage separate so Excel/CSV, Dropbox, AI invoice processing and OpenAI, reconciliation, accounting integrations and advanced reporting can be added later without giving them direct access to browser sessions.

## Proposed Supabase schema

Use UUID identifiers, `timestamptz` for system events and `date` for business dates. Every tenant-owned row carries an `organization_id`; department-owned rows also carry a `department_id`. Composite foreign keys enforce that related records belong to the same organization and, for department-owned records, the same department.

| Tables | Purpose and key fields |
| --- | --- |
| `organizations`, `profiles` | Organization name and business time zone; minimal user display profile keyed to `auth.users.id`. Profiles are not a source of authority. |
| `organization_memberships`, `department_memberships`, `roles`, `permissions`, `role_permissions` | Active organization membership and organization role; per-department membership and department role. A department membership references both an organization membership and a department in that organization. Role-to-permission mappings are migration-managed in the first release. |
| `invitations` | Organization, intended email and role, department assignments, inviter, expiry and lifecycle state. A pending invite does not confer access. |
| `departments` | Organization-scoped name and active flag. Seed Accounting, Finance, Purchasing, Sales and Management for the initial organization; administrators can add departments. |
| `business_contacts`, `payment_categories` | Department-scoped suppliers, beneficiaries and customers, with display name and optional contact details; organization-scoped payment category names. |
| `financial_records` | One table with a checked kind (`payment` or `collection`), organization, department, contact, description, expected amount, currency, due/expected date, notes, creator and timestamps. Payments additionally allow invoice date and payment category; collection rows cannot use payment-only fields. |
| `settlements` | Append-only partial or full payment/collection entries, linked to a financial record; amount in the parent currency, actual date, actor, recording time and idempotency key. Corrections use linked reversal entries rather than deleting history. |
| `documents` | Parent financial record, private object key, original filename, MIME type, size, uploader, timestamp and upload state. |
| `audit_logs` | Server-written actor, action, entity, organization, applicable department, event time and relevant before/after fields. No session tokens, document contents or credentials. |

Use `numeric(20,4)` for money and supported ISO 4217 currency codes. Validate currency precision before storage and pass monetary values across the API as decimal strings; don't use JavaScript floating-point arithmetic for balances. Never sum different currencies into one total. Paid or received amount comes from settlement entries; remaining amount is expected minus net settled. Derive open, partial and completed from the balance, and flag an unpaid or partially paid record as overdue after its business due date in the organization's time zone. Show individual actual dates in history and the effective final settlement date for a completed record.

Record a settlement through a single database operation that checks permission, locks the parent and validates the amount, reversal and idempotency rules before updating history. Edits to expected amounts use the same parent lock and cannot reduce the amount below the net settled balance. Keep currency and department fixed after the first settlement. Audit record, settlement, document and administration changes at the database boundary, in the same transaction as the corresponding database writes. Start with indexes on membership lookup keys, records by organization/department/kind/due date, and settlements, documents and audit events by parent.

## Authentication and authorization

1. **Invite-only access.** Disable public sign-ups and unused Auth providers. Bootstrap the first administrator using an operator-only procedure that links a verified Auth user to the initial organization. Thereafter an authenticated organization administrator invites employees through a privileged Edge Function. The function verifies the caller's Auth identity and current database permission before using server-only Auth Admin credentials. Bind each invite to its intended Auth identity and activate membership only after successful invite acceptance; failed or incomplete provisioning must leave no active membership. Guard against removing the last active administrator.
2. **Login, recovery and sessions.** Use Supabase email/password login, invitation password setup and email-based password recovery. Return a generic response for recovery requests, use only allowlisted redirects, and require a valid recovery session before accepting a new password. Do not retain tokens in logs or analytics. Gate routes until Auth and membership are loaded, clear application caches on sign-out, and revoke sessions where supported on account removal. An inactive membership loses data access even if a previously issued Auth token has not expired.
3. **Database permissions.** Organization admins manage users, departments and organization settings and can operate on records across their organization. Department operators read and write financial records, contacts and documents only in assigned departments. Department viewers have read-only access in assigned departments. No role grants cross-organization access; anonymous or unassigned accounts get no business data. Department history follows the parent record's visibility; account administration events are admin-only.
4. **Enforcement.** Enable RLS and least-privilege grants on every exposed business table, with both read and write scope checks. Check live memberships using `auth.uid()`, not editable user metadata or client-side guards. Expose only the write operations needed by each role; restrict any privileged SQL functions to explicit callers, fixed search paths and internal permission checks. Clients cannot rewrite audit or settlement history.
5. **Documents.** Use a private bucket with Storage policies tied to the authorized record and its reserved object key. Validate allowed types and file sizes; use authenticated downloads so permissions are checked on each request. Finalize uploads only after verifying the object, and sweep abandoned pending uploads. Do not put originals or download links in service-worker caches.

## Proposed repository layout

```text
src/
  app/                 # router, providers, authenticated layout
  features/            # auth, overview, payments, collections, calendar,
                       # contacts, departments, documents, users, settings
  components/          # shared table, form, list and status components
  lib/                 # typed Supabase client, money and date helpers
  types/               # generated database types
public/                # PWA manifest and icons
supabase/
  migrations/          # schema, RLS, audit and reference-data migrations
  functions/           # privileged account administration
  tests/               # database constraint and policy tests
vercel.json            # SPA routing configuration
.env.example           # public client configuration placeholders only
```

## Development milestones

| Milestone | Exit criteria |
| --- | --- |
| 0. Approve architecture | Confirm the scope of admin access, department role matrix, business time zone, currency precision and settlement correction rules before coding. |
| 1. Foundation and access | Reproducible React/Vite scaffold and Supabase migrations; sign-in, invitation, recovery, session handling and admin/department management. Policy tests cover anonymous, inactive, cross-department and cross-organization denials directly at the data layer. |
| 2. Financial operations | Payments, Collections and Contacts work through the desktop table and mobile lists. Tests cover partial and final settlements, repeated submissions, concurrent updates, reversals, balances and audit events. |
| 3. Documents, Calendar and PWA | Private attachments and activity history, dated work queues, responsive layouts and installation. Test phone uploads and verify sessions, financial data and documents are not available from offline caches. |
| 4. Production readiness | Verify backups and restore procedures, staging-to-production migrations, invite/recovery email delivery, access revocation, DNS/TLS and rollback. Pilot with authorized users before retiring Excel; do not seed fabricated company financial records. |

## Setup runbook (after implementation)

### Local development

1. Install the Node.js version declared by the scaffold, npm, the Supabase CLI and Docker. From the repository root, run `npm ci`, `supabase start` and `supabase db reset` to apply migrations to the **local** database.
2. Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the local Supabase CLI output (use the local anon key if the CLI reports that name). Everything prefixed with `VITE_` is public. Never put a service-role key, secret key, database password or SMTP password there.
3. Run `npm run dev`. Register `http://localhost:5173/auth/callback` and `http://localhost:5173/auth/reset-password` as local Auth redirect URLs and use the local Supabase email inbox to verify invitations and recovery.
4. After the test scripts are added, run `npm run lint`, `npm test`, `supabase test db` and `npm run build`. Use isolated test fixtures, not production data.

### Hosted Supabase

1. Use distinct staging and production projects. Link to the intended project with `supabase link --project-ref <project-ref>` and apply reviewed migrations with `supabase db push`, first in staging. Local database reset is not a production deployment step.
2. Configure Auth with public sign-ups disabled, a production site URL of `https://app.efehazirgiyim.com` and exact redirect URLs `https://app.efehazirgiyim.com/auth/callback` and `https://app.efehazirgiyim.com/auth/reset-password`. Allow staging URLs only in staging. Set up company SMTP and verify invite and recovery delivery before onboarding.
3. Deploy the privileged Edge Functions against the intended project, with any secrets configured only in the server environment. Verify the private bucket and its policies, bootstrap the first admin, create the initial departments and test the role matrix before inviting staff.

### Vercel and custom domain

1. Import the GitHub repository into Vercel with the Vite preset. Use `npm run build` and output directory `dist`. Configure an SPA fallback for navigational routes, including Auth redirects, without shadowing static files.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel's environment settings. Production points to production Supabase; preview deployments point to staging, never production data. Redeploy after changing build-time variables.
3. Add `app.efehazirgiyim.com` in Vercel and publish only the DNS record Vercel requests for the `app` subdomain; leave the public website's records unchanged. Verify HTTPS, direct navigation, sign-in, invite/recovery links and access denial before enabling production use.

**Approval requested:** Confirm the architecture and milestone 0 decisions above before implementation starts.
