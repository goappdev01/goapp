# Dated business/professional availability — review before server activation

## Scope and user route

Empresa → Configuración de empresa → Horarios (existing step 3 of 8) → EXCEPCIONES DEL CALENDARIO.
Weekly hours remain in HORARIO HABITUAL. The dated editor reuses `useGoCalendarFlow` and `GoTimeField` (minute precision), without creating another agenda. Affected bookings open the existing business Calendar on the selected date; proposal/cancellation use its current actions.

## Server contract and persistence

`GET /api/supabase/booking-calendar-exceptions` reads the owner's future exceptions and effective open/closed windows for a selected date/professional.
`PUT` saves the complete ordered interval list for that date and scope; `DELETE` deactivates that exception and restores recurring hours. Each write supplies an expected revision and stable request key. A failed/uncertain request can be retried; reusing its key for another command is rejected.

`booking_calendar_exceptions_v1.sql` is a **review draft**, not a production migration. It requires the previously reviewed timeline, gap and phase SQL. It adds a canonical dated table and immutable operation events, with author/time/revision stamped in SQL. Records retain the establishment's IANA timezone and local date. Overnight weekly shifts are clipped by the exact dated intervals. DST full days preserve their actual 23/25-hour extent; nonexistent or ambiguous local interval endpoints are rejected with actionable errors.

## One availability engine

The existing weekly query is preserved in `recurring_shift_windows`. Its dated extension remains the common `shift_windows`/`in_shift`/`available_segments` used by the timeline compiler, search, gap policy, released-phase calendar capacity and confirmation/negotiation guards. It does not add another booking engine.

Whole-business closures take precedence over individual openings. An individual opening can enable that professional on a normally closed date, without enabling other professionals. Custom professional weekly hours remain required unless explicitly opened for that professional. Explicit closures never waive physical resource capacity, absence blocks, occupied interventions or ordinary minimum/multiple rules. Internal released waits and last-minute gap exceptions retain their separate existing meanings.

The existing business advisory transaction lock is used for both exception changes and booking confirmations. A stale session cannot confirm into a closure committed before its placement check. Two conflicting customer confirmations still cannot both succeed. Future/pending proposals are revalidated again on acceptance.

## Existing bookings, permissions and events

Saving an exception never updates/cancels a booking. The result identifies overlapping accepted/pending commitments, with names/details scoped to the verified owner. Business closures compare full customer presence; a professional closure compares actual occupied phases (legacy/unassigned commitments conservatively occupy their full interval). The company receives a visible warning/list and manages each conflict using existing proposal/cancellation flows. No cancellation notification is fabricated by a schedule edit; actual booking operations retain their own event/notification flow.

RLS protects the dated table; authenticated callers have owner-scoped SELECT only. All writes use the guarded owner RPC. The private event table has no client write privilege. RPC authorization is rechecked after acquiring the business lock, using the live verified owner and selected professional's business. No service-role credentials, metadata-based authorization, global permission expansion or direct table writes are introduced.

## Validation and activation boundary

Tests use only the existing loopback `127.0.0.1:65439` database `go_booking_phase_test_20261025`, owner `go_booking_test_owner`, marker `phase-isolated`. They refuse other hosts, database names, owners and markers. The draft installation verifies that previous isolated booking rows remain byte-for-byte unchanged. Tests cover exact-date independence, both scopes, CRUD/persistence/audit, authenticated mobile → API → real SQL, stale selection/acceptance, concurrent writes/confirmations, DST/overnight, phase waits/resources and multiservice compatibility. No public port, database, account or environment is created by these tests.

Before production activation, Nelson must review the SQL against the actual installed timeline/gap/phase schema, back up the target, apply it through the authorized backend process, deploy the matching API route, and verify schema-cache visibility and owner/tenant checks. This task does **not** deploy Railway or apply production SQL. Unavailable RPCs return explicit 501/503 failures, never AsyncStorage/fake persisted success. Expo publication alone does not activate database functions.

Preserve dated/event records during recovery; never remove them or modify bookings to roll back a display issue. Any server rollback requires a reviewed, conflict-safe maintenance plan and the preactivation backup. The source commit can be reverted normally after authorization; existing recurring hours/bookings are never rewritten by this feature.
