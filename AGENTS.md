# EFE Financial Operations Platform — Agent Guide

## Mission and current state

Build the EFE Financial Operations Platform for EFE Hazır Giyim: a secure,
responsive, multi-user financial operations application, with payments and
collections as its product focus.

The current frontend uses React, TypeScript, Vite, and Tailwind CSS, with
Vercel hosting configuration and GitHub Actions CI. The approved delivery is
a manual payment table, stored in Supabase behind login, with a per-currency
overview. The former browser-local test mode was removed at the owner's request.

The Supabase foundation includes browser auth flows and versioned PostgreSQL
RLS migrations for organization/department access and organization-scoped,
audited payments. The owner applied the organization-wide payment migration
and role assignments; the matching frontend deployment and production flow
verification remain necessary. Private Supabase Storage is not implemented.
Do not treat the frontend foundation as a production-ready financial system.

GitHub Copilot and collaborating agents should read this guide before planning
changes, then consult only the relevant parts of the repository. Treat
[README.md](./README.md) as the detailed source for current product decisions,
architecture proposals, local setup, and deployment. The broader roadmap in
this guide is not authorization to implement deferred features. If this guide,
the README, or a new user request appear to conflict, stop before a material
scope or architecture change and ask the user to confirm the intended direction.

## Agent organization and collaboration

### Primary orchestrator

One primary agent owns each user request from understanding through delivery.
The orchestrator:

- Clarifies the objective and acceptance criteria; identifies relevant files
  and existing decisions before making changes.
- Breaks substantial work into bounded tasks, with dependencies and file
  ownership stated explicitly.
- Uses the specialist responsibilities below as logical roles. Delegate only
  when separate expertise or independent work has a measurable benefit; do
  not spawn agents for routine or tightly coupled edits.
- Avoids concurrent edits to the same files, reviews all delegated output, and
  integrates it consistently with the existing architecture.
- Verifies the change using relevant repository checks and reports any
  unverified behavior or blockers accurately.

### Specialist responsibilities

- **Architecture Agent:** application architecture, technical decisions,
  project structure, integration standards, and architecture documentation.
- **Frontend Agent:** React components, UI/UX, responsive layouts, forms,
  tables, accessibility, and frontend state management.
- **Backend and Database Agent:** Supabase integration, PostgreSQL schema,
  versioned SQL migrations, database functions, RLS policies, and data
  integrity.
- **Security Agent:** authentication and authorization, RLS and permissions,
  secure document access, secret handling, and security risk identification.
- **QA Agent:** TypeScript checks, lint, builds, automated and regression
  tests, and clear reporting of failures.

These are areas of responsibility, not a requirement to create separate agents
for every task. Authentication, authorization, RLS, or other security-sensitive
changes require a security review before completion. Do not treat frontend
checks as a substitute for database-policy review.

### Task boundaries and handoffs

For every development task, even when working solo, define the **objective,
relevant files, expected output, dependencies, acceptance criteria, and
required tests** before editing. A short in-session checklist is sufficient;
do not create a planning file by default.

Assign one owner per file or module and sequence work that touches the same
files. Agree on typed interfaces and database contracts before coordinating
frontend and backend changes. Review existing implementations before replacing
them, and keep unrelated improvements out of the task. Report blockers rather
than inventing business rules or silently changing approved architecture.

### Cost and context management

- Start with a focused task and read only the files needed to complete it.
  Reuse documented decisions and prior findings; do not repeatedly scan the
  repository or repeat completed investigations.
- Use the minimum number of agents. For routine work, use the simplest
  suitable model and reasoning level when configurable. Parallelize only
  independent work with a clear benefit.
- Reuse existing components, utilities, and dependencies. Avoid redundant
  searches, duplicate checks, and lengthy handoffs. Broaden validation when
  risk or failures warrant it.
- Never trade security, correctness, or code quality for token savings.

## Repository map and working conventions

The current source is organized as follows:

- `src/app/`: application shell, routing, and providers.
- `src/components/`: shared components.
- `src/features/`: feature-specific UI and logic (currently overview, payments,
  and settings).
- `src/lib/`: shared helpers, including environment validation and currencies.
- `src/locales/`: Turkish UI text.
- `src/styles/`: global styles.
- `src/test/`: test setup; unit tests also live beside source files.
- `tests/e2e/`: Playwright end-to-end tests.
- `public/`: static assets.

Add or expand directories when a milestone needs them; proposed future
structures in the README are not instructions to scaffold unused modules.
Follow established naming, formatting, component, and localization patterns.
Prefer feature-scoped data access and reusable components where repeated use
justifies them. Keep business rules out of presentation-only components.

## Development standards

- Preserve strict TypeScript. `tsconfig.app.json` enables `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and unused-code
  checks; do not weaken compiler settings to make a change pass.
- Use typed component props and explicit data contracts. Validate external,
  persisted, and user-provided input at boundaries (Zod is already in use).
- Keep UI state, remote/server state, and domain rules distinct. Handle loading,
  empty, success, conflict, and error states explicitly; never turn a failure
  into a success-shaped response or silently discard user input.
- Reuse the feature or shared error-handling conventions for consistent user
  messages and safe diagnostics; do not invent a separate handler per screen.
- Make forms accessible and responsive. Support keyboard use, semantic labels,
  visible validation, and layouts that work on small screens; do not rely on
  color or hover alone.
- Keep user-facing text consistent with the existing Turkish localization
  convention. Avoid scattering duplicate business rules or hard-coded variants.
- Follow existing dependencies and patterns. Do not add a package, service, or
  abstraction without a demonstrated need and a compatible approved design.

## Financial correctness and auditability

Financial values are sensitive business data. Apply these rules to every
financial workflow, not only its UI:

- Never store authoritative monetary values in floating-point database
  columns. Use PostgreSQL `NUMERIC`/`DECIMAL` with an explicitly chosen
  precision and currency-aware scale. At API/UI boundaries, use decimal
  strings or an exact decimal/integer-minor-unit representation; do not use
  JavaScript `number` for authoritative financial arithmetic.
- Validate amount, currency precision, sign, dates, and cross-field business
  invariants on trusted server/database boundaries as well as in forms.
  UI validation improves usability; it does not enforce integrity.
- Keep amounts in different currencies separate. Never sum or convert them
  without an explicitly approved exchange-rate rule and traceable rate source.
- Distinguish expected/due activity from completed activity. Preserve the
  approved meaning of statuses and actual dates; do not silently substitute
  derived ledger states for manually entered statuses.
- When partial payments or collections are approved, support multiple
  settlements against a single obligation. Calculate the remaining balance
  from the original amount and effective settlements in the same currency.
  Apply related writes atomically and enforce approved limits in the
  database. Test partial, complete, reversal/correction, and concurrent
  settlements. Do not infer settlement rules from the current manual table.
- Do not silently overwrite or delete financial history. Use explicit,
  auditable correction or reversal flows when approved. Record sensitive
  changes with trustworthy actor/time information and restrict alteration of
  audit history.
- Do not display fabricated balances, sample transactions as real data, or
  success messages for unsaved operations.

## Security and privacy

- Enforce authorization in trusted services and PostgreSQL RLS, not only in
  frontend routes, controls, or client state. Enable and test RLS for every
  exposed sensitive table and private storage object when those resources are
  introduced.
- Scope access to the correct organization and, where applicable, department
  on reads and writes. Payments are organization-scoped as documented in
  `database.md`; they require an explicit payment role or organization admin.
  Include `WITH CHECK`-equivalent enforcement for writes and validate target
  identifiers against the caller's permissions.
- Never expose or commit Supabase `service_role`/secret keys, database
  passwords, tokens, or other credentials. Every `VITE_` variable is public
  browser configuration; only publishable configuration belongs there.
  Use the environment-specific secret store for privileged server-side
  credentials. Keep `.env.example` limited to empty or clearly fake placeholders.
- Use invitation-only access if that remains the approved authentication
  policy; do not add public signup or privileged administrative APIs without
  explicit design and review.
- Store financial documents privately. Authorize every upload/download against
  current organization, department, and record access; a guessed storage path
  must not grant access. Do not persist signed URLs or cache sensitive files.
- Do not log secrets, tokens, financial document contents, or unnecessary
  personal data. Clear user/organization-scoped client caches on logout or
  access-context changes when remote state is introduced.
- Review security implications for every change. Authentication, authorization,
  RLS, privileged functions, and document-access changes must receive explicit
  Security Agent review.

## Database and schema changes

Read [database.md](./database.md) before any database change and update it
before editing the related SQL. Keep database decisions, schema and access
contracts, and SQL validation instructions there. Confirm the approved scope
and architecture, then:

- Commit schema, indexes, constraints, functions, grants, RLS policies, and
  required reference data as reviewed, version-controlled migrations.
- Keep database types and documentation synchronized with schema/API changes.
  Prefer generated Supabase types where the approved integration supports them.
- Review foreign keys, organization/department boundaries, currency precision,
  concurrency, and audit behavior as part of each relevant migration.
- Make migrations safe and repeatable where appropriate. Avoid destructive
  changes; never remove financial history or perform production resets without
  explicit authorization and a reviewed recovery plan.
- Test database integrity and authorization, including denied cross-organization
  and cross-department access. Frontend tests do not verify RLS.
- Never make undocumented production schema changes in a dashboard. Review
  deployment targets and migration effects before applying changes.

## Product scope and approval gates

The initial product scope is a roadmap, not a single implementation task:

1. Authentication.
2. User and department management.
3. Payment management.
4. Collection management.
5. Partial payment and collection tracking.
6. Calendar.
7. Transaction history.
8. Document management.

The **current narrower delivery** remains the Supabase-backed manual payment
table described in the README. Wait for explicit user
approval before beginning further application development or expanding the
approved milestone. A roadmap entry alone is not authorization.

Dropbox integration, Excel automation, AI document processing, OpenAI,
financial dashboards, and accounting software integrations are deferred.
Do not implement these or other future features without an explicit request
and any required data-handling/security approval. Avoid unrelated improvements
and scope creep.

Do not make material architectural or financial-policy changes without approval.
When documentation describes a proposal rather than an implemented/approved
decision, keep it labeled as such. In particular, do not treat proposed
settlement-ledger behavior or schemas in the README as migrated or as approval
to expand the current manual-table delivery.

## Validation and completion

Before closing an application change, run the TypeScript checks, relevant
automated tests, the production build, and the configured lint checks. Run
end-to-end tests for affected user flows and the full applicable suite for a
release. Use existing commands:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm run build` already runs `tsc -b`, so a successful build covers the
local TypeScript check. Playwright needs Chromium (`npx playwright install
chromium`) and a production build. [GitHub Actions CI](./.github/workflows/ci.yml)
runs lint, typecheck, unit tests, build, and end-to-end tests. Database changes
also require migration, integrity, and authorization/RLS checks in a
non-production environment. Review security implications before closing any
change. For documentation-only edits, use applicable documentation checks
without running unrelated application suites. Never claim a check passed if
it was not run; state what remains unverified and why.

At the end of each task, concisely report:

1. What changed and which files were modified.
2. Tests/checks run and their actual results.
3. Outstanding issues or unverified behavior.
4. Important architectural or business decisions, if any.

Update directly related documentation when an approved architecture, important
interface, or operational procedure changes. Avoid creating extra documentation
for a focused task unless requested or needed to maintain an existing contract.
