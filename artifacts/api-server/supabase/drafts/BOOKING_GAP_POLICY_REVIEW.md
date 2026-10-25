# Booking gaps: review and activation

This draft extends the existing canonical timeline engine; it does not create a second booking engine. It has not been applied to a real Supabase database. Nelson must review and authorize activation together with the matching API version.

## Admission

`minimum_service` derives M from the selected professional's explicit `serviceIds`: active, visible, reservable services of the same business with positive duration, excluding products. Empty or absent assignments produce no availability. M is not stored or configured. A catalog or assignment edit recalculates future admission without changing an existing receipt.

`plan` calls `gap_admission` after its existing professional, customer, resource and working-time validations. New residuals touching the placement must be zero or an exact positive multiple of M. Real opening, closing and break boundaries delimit these residuals; no padding or rounding is inserted. Unaffected historical gaps are ignored. Closed periods are subtracted before evaluation. Configured waits inside one service remain intentional phases, not gaps between two reservations; a second booking inserted into such a wait is checked normally.

Availability, explicit or automatic professional assignment, creation, catalog combinations and negotiated rescheduling all reuse `plan`. Automatic assignment tests the complete plan for each candidate. Business advisory transaction locks already serialize bookings, changes and configuration updates. Existing snapshots retain their original services, duration, prices and identity. Cancellation still releases occupation without rewriting another reservation.

## Authorization and audit

The existing professional-schedule fold, inside the eight-step business configuration, stores only `gapPolicy.allowLastMinuteGaps` and `lastMinuteMinutes`. Default: disabled, 1440 minutes. Presets: 24, 12, 6 and 3 hours; custom positive whole minutes up to 525600 are supported through a fractional-hours field. No manual M or new setup step is introduced.

Existing owner/RLS rules apply; this draft does not add employee-management permissions. The database stamps authorization identity/time and preserves that stamp on unrelated saves. Only a real policy change refreshes it. SQL compares the actual start instant with the current clock. Establishment working windows use their existing IANA timezone, including overnight shifts and DST. The exception waives only the gap equation, never a conflict, closed time, resource limit or normal confirmation rule. Past starts are refused. The frozen admission snapshot records M, use of exception and authorization.

The owner-only day-analysis RPC reads persisted reservations and the same disjoint work/resource projection. The existing suggestions screen requests a finished day when opened; there are no background interruptions or automatic authorization changes. Occupation is scheduled occupation, not proof of attendance or lost revenue. Recommendations are estimates. Pending/confirmed occupation follows the existing engine's status policy.

## Atomic activation, not an automatic migration

Prerequisites are the reviewed existing multi-service, negotiation, verification, timeline and catalog schemas. For an existing timeline installation, render the complete transactional upgrade:

```sh
node artifacts/api-server/scripts/render-booking-gap-upgrade.mjs /path/to/review-booking-gap.sql
```

This command renders SQL only. The result creates the helpers and replaces the canonical `plan`, `availability` and `lock_configuration` definitions in one transaction, then requests a PostgREST schema reload. It does not update booking data, global permissions, roles, payments or authentication. Review the generated SQL before execution. A fresh isolated installation can install the timeline and helpers in order before accepting requests; prefer the atomic renderer when upgrading a running installation.

Publish/restart the reviewed API after authorized database activation. The capability RPC and availability envelope must report `gapPolicyVersion = 1`. The mobile client and API fail closed against an old server before a new booking write or timing-changing negotiation; reads, cancellation and rejection retain their existing flow. Publishing frontend source alone does **not** activate the database rule. Do not claim remote confirmations are verified until this activation and a real authenticated two-participant test have occurred.

## Reproducible isolated validation

`tests/booking-gap-policy.postgres.test.mjs` requires the explicitly marked loopback-only `go_booking_gap_test_20261025` database, owner `go_booking_test_owner`, and `GO_BOOKING_GAP_TEST_CONFIRM=isolated`. It refuses another target. Fixtures use unique isolated businesses and authenticated database roles. No real accounts, bookings or production migration are used. Tests include strict mathematics, breaks, real boundaries, per-professional assignment, exceptions, concurrent clients, real SQL negotiation, cancellation, historical preservation, resources, permissions and analysis. API contract tests run handlers without opening ports. Mobile tests exercise the actual data/configuration functions; physical iPhone validation remains separate.

Availability caches necessary free-window/modulo conditions once under the existing business lock to avoid rebuilding a complete plan for obviously impossible minutes. This cache never confirms or bypasses validation: every surviving option still runs the complete canonical plan. Services with phases only use a safe first-work-phase condition; their full sequence remains authoritative.
