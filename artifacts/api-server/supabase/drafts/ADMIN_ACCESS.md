# Private administrative access — local preparation

## Status and deployment prerequisites

`admin_memberships.sql` is an **unapplied draft**, not a registered migration. No accounts have been assigned privileges. The Supabase CLI and a local PostgreSQL runtime are unavailable in this environment, so database execution/RLS tests remain pending.

Before any deployment, inspect the target schema, register the approved draft with `supabase migration new admin_memberships`, and execute it in an isolated Supabase database. Do not deploy this backend without the schema: missing tables deny administrative access. The draft deliberately fails on existing object names rather than assuming compatibility or overwriting objects. It creates tables, policies, functions and a private schema; it does not alter profiles, auth identities, businesses or existing policies.

`admin_memberships.test.sql` prepares rollback-only isolated database checks with generated fixture UUIDs and an explicit isolated-environment opt-in. It has **not** been executed here. Also validate with separate real test Usuario/Empresa identities: own-membership SELECT only; no direct INSERT/UPDATE/DELETE; anonymous RPC denied; normal/technical membership RPC denied; owner grants/modifies/revokes technical membership; owner target always rejected; revoked access denied with the same JWT; audit records retained. HTTP tests use mocked Supabase responses and do not replace database checks.

Security references reviewed: [Supabase database functions](https://supabase.com/docs/guides/database/functions) and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Identity and private entry

Everyone registers/signs in through the existing personal account flow with individual credentials. Public selection remains Empresa | Usuario. `profiles.role` continues classifying the account and never grants ADMIN. After login, the existing private ADMIN entry and GoAdminDashboard are shown only if `/api/supabase/admin/access` authorizes the current UUID with an active membership. No dashboard or login UI is duplicated.

Permissions are live server data, not client grants or persisted ADMIN flags. Each backend request validates the bearer with Supabase Auth and reads the same identity's current membership using RLS. Technical grants are a subset of `admin.access`, `development`, `diagnostics`, `maintenance`. Owner receives all these plus reserved `memberships.manage` and `ownership.manage`. Future privileged APIs must explicitly require their permission; existing dashboard tools remain local prototypes, not newly implemented remote maintenance operations.

## Activating the first owner — separate express authorization required

1. The intended owner creates/confirms their own account normally and sets their own password. An authorized database operator verifies the actual `auth.users.id` UUID and confirmation status, and independently verifies that the person is the owner. Knowing an email is insufficient.
2. Obtain and record the owner's express authorization naming that UUID. No bootstrap is performed by this implementation.
3. A trusted database owner/operator (not a mobile client or service-role API) may then run the private `go_admin_private.bootstrap_owner(verified_uuid, authorization_reference)` function in a transaction. The reason must be nonempty and at most 1000 characters. This private function has no public/anon/authenticated/service_role execution grant, checks confirmation, refuses an existing owner, and writes an audit event. Never expose it through an endpoint.

Nelson similarly creates/confirms his individual account. After the owner is activated, the owner explicitly authorizes his verified UUID using the existing authenticated backend boundary:

`PUT /api/supabase/admin/memberships/:userId`

Body: `level: "technical"`, `permissions: ["admin.access", "development", "diagnostics", "maintenance"]`, `active: true`, and an authorization `reason`. Revocation uses the same operation with `active: false`. Reduced permission sets must still contain `admin.access`. No credentials belong in documentation, command history or logs.

Only the owner can list memberships (`GET /memberships`), read the last 200 audit events (`GET /audit`) or manage technical grants. The database RPC repeats the live owner check transactionally, including on direct calls bypassing Express. No public operation can create/modify/revoke the owner, promote a technical member to owner, or grant reserved permissions. Ownership transfer/recovery has no public endpoint; it requires a separately reviewed, explicitly authorized database procedure. Database superusers remain trusted operators and must be controlled externally.

## Revocation and limitations

Backend revocation takes effect on the next protected request, with no permission cache. The existing mobile provider rechecks on session changes, foreground return and opening ADMIN; it closes access on denial. An already visible local prototype may remain on screen until the next recheck; it cannot authorize protected data/operations. Real-time push revocation is not added.

The SQL audit records UUIDs, old/new membership, reason, timestamp and database actor. It never stores passwords or tokens. Existing account classifications/data are untouched. Do not activate accounts or apply this draft in production without separate authorization and successful isolated database validation.
