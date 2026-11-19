# Database

This is the starting point for database work. Read it before changing the
schema, migrations, policies, functions, or SQL tests. Update it with the
design decision first, then implement the matching SQL and tests. Executable
migrations live in [supabase/migrations](./supabase/migrations); do not edit an
already-applied migration. SQL regression tests live in
[supabase/tests](./supabase/tests).

## Current schema and rollout status

- [Identity foundation](./supabase/migrations/20261118163700_identity_foundation.sql):
  Supabase Auth identities, organizations, departments, and both membership
  tables. RLS permits active administrators to read within their organization;
  other active members see assigned departments. Membership changes are not
  available to application users.
- [Manual payments](./supabase/migrations/20261118164700_manual_payments.sql):
  creates `public.payments` with no rows and no API access.
- [Payment access](./supabase/migrations/20261119110000_payment_access.sql):
  adds server-owned revision/actor metadata, department-scoped RLS for the
  payment screen, and the append-only `public.payment_audit` table.
- [Organization payment access](./supabase/migrations/20261119120000_organization_payment_access.sql):
  switches only payments to explicitly assigned organization-wide roles.
  The owner applied the migrations and individual role assignments manually;
  the matching frontend deployment and production flow verification remain.
  The browser test mode was removed; its records are never imported.
- Payment method is stored as `check`, `cash`, or `bank`. Historical rows stay
  null because their method cannot be inferred; new rows must specify a method.

## Manual payments (`public.payments`)

| Columns | Contract |
| --- | --- |
| `id`, `organization_id`, `department_id` | UUID record ID and required organization scope. Historical department IDs remain unchanged; new payments have a null department. If present, the composite foreign key requires the department to belong to the same organization. |
| `detail`, `notes` | Nonblank detail, up to 200 characters; optional notes, up to 2,000 characters. |
| `payment_type` | `tax`, `credit`, `invoice`, `salary`, `insurance`, `rent`, or `other`. |
| `payment_method` | `check`, `cash`, or `bank` for new payments. Existing rows may be null; their historical method is unknown. |
| `amount`, `currency` | Positive exact `numeric` less than `1000000000000` with at most two fractional digits; `TRY` by default, with `EUR` and `USD` also supported. A check rejects excess precision without silently rounding it. |
| `due_on`, `paid_on`, `status` | Optional finite due date; status is manually set to `paid` or `unpaid`. A finite actual payment date is required if paid and must be null if unpaid. The due date is independent of status. |
| `created_at`, `created_by` | Set by trigger on insert to the transaction time and `auth.uid()`; never client-supplied or changed later. |
| `revision`, `updated_at`, `updated_by` | Set by trigger: revision starts at 1 and increments on every update. |

### Access contract

| Role | Read | Insert / update | Delete |
| --- | --- | --- | --- |
| Active organization `admin` | All organization payments | Yes | Yes |
| Active member with payment role `manager` | All organization payments | Yes | Yes |
| Active member with payment role `viewer` | All organization payments | No | No |
| Other members, `anon`, `service_role` | No | No | No |

- The nullable `payment_role` is explicitly assigned by a trusted operator.
  A regular membership or department role alone grants no payment access.
  Organization/department membership policies for other features are unchanged.
- `authenticated` may insert only `organization_id` and editable business
  columns; new payments cannot specify a department. It may update only business
  columns. Record ID, organization, historical department and metadata cannot
  be changed by clients. Existing records and audit rows are not rewritten.
- New payment inserts require `payment_method`; legacy rows with a null method
  remain readable and can be assigned a method when edited.
- Clients update/delete with `id = … and revision = <seen revision>`. Zero
  affected rows means the record changed, was deleted, or is not permitted; the
  UI reports a conflict and reloads. Row locks make concurrent edits of the
  same revision succeed at most once.
- Amounts are read as `amount::text` and written as decimal strings.
- `public.payment_audit` stores one row per insert/update/delete with the actor,
  time, and full old/new row JSON. A `security definer` trigger writes it;
  API roles have no write privileges. Only active organization admins can read it.
  Deleting a payment removes it from the table, but the audit history keeps it.

Use a database owner only for migrations and disposable SQL tests; no product
workflow should use owner credentials. Collections, settlements, currency
conversion, and storage are out of scope.

## Local SQL validation

Use Node.js, a Docker-compatible runtime, and a disposable local Supabase
database. Run the same validation as GitHub Actions from the repository root:

```sh
npx --yes supabase@3.2.0 db start
for test in supabase/tests/*.sql; do
  docker exec -i supabase_db_efe-financial-operations \
    psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < "$test" || exit 1
done
npx --yes supabase@3.2.0 stop --no-backup
```

Run these commands only on a disposable stack: `stop --no-backup` removes
local data. SQL tests roll back their fixtures and are never run against
hosted databases. Never use reset as a hosted deployment step.

## Automated schema deployment

[GitHub Actions](./.github/workflows/ci.yml) applies and tests the SQL
migrations in a fresh local Supabase database on pull requests and pushes to
`main`. When enabled, successful application and SQL checks on `main` are
followed directly by production migration deployment; there is no staging
project or staging migration step. The production job previews pending
migrations and applies them in version order, using Supabase migration history
to skip versions already applied. It never pushes seed data, custom roles,
Vault secrets, or hosted Auth configuration. This is a direct production
schema change, not production activation of the application.

One-time setup in GitHub **Settings → Environments**:

1. Create or configure the `production` environment and restrict deployments
   to `main`. This job runs automatically after successful CI and local SQL checks;
   required reviewers add a manual approval gate. Enable the workflow only
   after confirming the production target, backups, and recovery procedure.
2. Set `SUPABASE_DB_URL` as a secret in the `production` environment, using
   the Supabase direct connection (if reachable from the runner) or
   **session-mode** pooler URL (port `5432`, not transaction mode). Use a
   percent-encoded password and `sslmode=verify-full` with a trusted server
   certificate. Do not put the database URL in repository variables,
   frontend configuration, or chat.
3. Set the repository Actions variable `ENABLE_DATABASE_DEPLOYMENTS` to
   `true` only when ready to deploy directly to production. Run **Foundation
   checks** from `main` or wait for the next push. A failed local SQL check
   blocks deployment. If production schema/history has drift, investigate
   before retrying; do not auto-repair migration history or reset the database.

## Manual production application (owner-approved path)

The owner chose to apply migrations in the Supabase SQL Editor instead of the
automated workflow. Run the migration files in version order inside one
transaction, and record each version in `supabase_migrations.schema_migrations`
so a later `supabase db push` does not try to reapply them. Never run
`supabase/tests/*.sql` against production. If `ENABLE_DATABASE_DEPLOYMENTS`
is later enabled, first confirm the recorded history matches the files.
The organization-wide migration and the new frontend are incompatible with
the old frontend/schema respectively: coordinate a short maintenance window,
apply the migration and reviewed role assignments, then deploy the frontend.
Verify both before reopening access; do not enter sample financial data in production.

## Supabase production activation (partially applied)

1. This repository has no staging project. The automated schema deployment
   above applies migrations directly to production after local SQL checks;
   enable backups and review the production recovery plan before turning it
   on. The owner applied the migrations manually. Production Auth and
   application payment flows still require separate verification.
2. The hosted `Efehazirgiyim Project` Auth core settings are applied: public
   signup and anonymous sign-ins are disabled, email/password login remains
   enabled, minimum password length is 12, the Site URL is
   `https://app.efehazirgiyim.com`, and the only allowed redirect is
   `https://app.efehazirgiyim.com/auth/callback`. Do not allow localhost or
   arbitrary preview domains on production Auth. Local `config.toml` remains
   for local development and does not configure hosted Auth.
3. Configure production SMTP and paste the contents of
   [invite.html](./supabase/templates/invite.html) and
   [recovery.html](./supabase/templates/recovery.html) into the matching hosted
   Auth email templates. Until then, password recovery and email delivery are
   not verified. The fragment keeps the one-time token out of HTTP request
   URLs; the app consumes it only after the user submits a new password.
4. Three Auth user records have been created directly in the Supabase
   Dashboard. Verify each identity and its organization/payment role
   before granting membership. The user accounts alone grant no database
   membership; do not share passwords.
5. The Vercel Production environment now has the three public `VITE_` values
   from [local development](./README.md#9-local-development). The exact
   production Supabase origin is in the `connect-src` allowlist in
   `vercel.json`. Never put database credentials or secret keys in these
   variables. The Vercel project and app domain have served the application.
6. The owner created the organization, departments, initial administrator, and
   payment role assignments. Users without an active membership and an explicit
   payment role (or admin role) have no payment access. The application cannot
   change memberships.

Historical operator example for an empty target only; do not rerun it on the
existing organization:

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

## Deferred full-platform proposal

### Financial domain

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

### Full-platform entities (not migrated)

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

### Document storage

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
