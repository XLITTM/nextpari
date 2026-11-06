# Group control foundation

This repository can later host one owner for several brands. This change is the architecture and an isolated code foundation. It does not create a database, apply SQL, copy players, or change NextPari registration.

Brands:

| Code | Brand | Data plane |
| --- | --- | --- |
| 001 | NextPari | The existing production database. Unchanged by this pull request. |
| 002 | RYXO | A future separate database. Not created here. Android-first. |
| 003 | Future brand | Reserved in the catalog with status `planned`. No database. |

## Database boundaries

Two kinds of database stay separate.

The **group control plane** is a future database of its own. It holds:

- the brand catalog
- owner identities and permissions
- which staff subject belongs to which brand
- globally reserved player IDs
- an opaque pointer from a brand auth user to a global player ID
- audit events that name an action, a brand, and a player ID
- aggregate report rows: player count, manager count, cashier count, operational status, and money totals

The **brand data plane** is one database per brand. It keeps that brand's player accounts, wallets, ledger, managers, cashiers, bets, and casino transactions. NextPari's current Supabase project remains brand 001. RYXO does not share it.

Personal information and wallet balances do not move to the control plane. A report row is a number the brand publishes. It is not a player list.

Managers, cashiers, and security staff receive a grant for one brand code plus the auth user id from that brand's own database. The pair is the identity. The same UUID in another brand's database is a different person and a different grant. A grant for 001 cannot read players, balances, transactions, or staff of 002.

The owner is not a brand manager and is not a hardcoded name. The owner signs in to the group control-plane project. The group service checks that session, then looks up `group_control.owner_identities` and `group_control.owner_permissions`. `reports.read` is what opens the dashboard for every brand. A brand staff UUID is never accepted as that owner subject. The test fixture `00000000-0000-4000-8000-000000000001` is not a production credential.

## What NextPari does today

Player IDs are six-digit text. They are stored on `wallets.public_id` and `profiles.public_id`. `public.app_users` exists in production. A read-only inspection found zero rows in it, 42 profiles, 44 distinct public IDs across profiles and wallets, and IDs reaching 979426. Those counts are a snapshot. The next export must read the tables again.

Login lookup is `private.resolve_player_login_email` in migration `039`, which accepts exactly six digits and matches `private.player_digits` on wallet and profile ids.

New IDs come from `private.player_public_id_counter`, a locked singleton, through `private.allocate_next_player_public_id()` in migration `044`. The counter is an integer from 1 to 1000000. The function skips IDs already stored on a wallet or profile, formats with `lpad` to six digits, and stops at 999999 with `PUBLIC_ID_SPACE_EXHAUSTED`. `ensure_player_account` calls that function only when the player has no wallet yet. Existing IDs are not rewritten.

An older helper, `next_player_public_id()` in `20260820143000_mobcash_agent.sql`, picks a random six-digit value. Current registration does not use it. The server helper `allocateSequentialPlayerId` in `server/player/playerPublicId.ts` is the same six-digit rule for tests. `parseLoginPlayerId` still requires `^[0-9]{6}$`.

Those files stay as they are. This pull request does not reset the counter and does not change any stored player ID.

## Central allocator

`server/group` is the model of the future control-plane allocator. The SQL drafts next to it describe the same rules. Nothing in `api/` or `vercel.json` calls it, and NextPari registration does not call it.

Rules:

- A player ID is a decimal string, unique across every brand.
- IDs from 1 through 999999 stay six digits with leading zeros, so today's NextPari IDs still match.
- 1000000 and above are the full decimal string. The space is not capped at 999999.
- Legacy IDs are reserved as the exact string stored on a wallet, a profile, or a player-id column found on `public.app_users`. A wallet-only ID is included. A second reservation of the same legacy ID for NextPari is a no-op. An ID already issued as an allocation is not overwritten.
- The group counter is a separate row. It is not seeded to 1. Allocation before seeding fails with `COUNTER_NOT_SEEDED`.
- The floor is `max(production next_value, max(imported numeric ID) + 1)`. A repeated import may advance that counter. It never decreases it. The production counter is not written.
- Allocation takes an idempotency key. The same brand and key return the same ID. The same key for another brand fails.
- Allocation is serialized the way `SELECT … FOR UPDATE` serializes the SQL function.
- If the allocator is unavailable, the call fails with `CENTRAL_ALLOCATOR_UNAVAILABLE`. There is no call to `allocateSequentialPlayerId` or `next_player_public_id()`.

Internal callers are a service with a private token. Android and browser callers are rejected even if they present that token. The token is not a `VITE_` variable and is not part of this commit.

## Player ID cutover

NextPari and RYXO must not allocate at the same time from different counters. RYXO registration stays closed until NextPari registration is using the central allocator and a final sync has been verified. This pull request does not perform that switch. Production registration stays on the local counter.

Gates, both closed until the owner approves the window:

- `nextpariUsesCentralAllocator`. While this is false, this allocator refuses NextPari and refuses RYXO with `RYXO_BEFORE_NEXTPARI_CUTOVER`.
- `ryxoRegistrationEnabled`. This can be true only after the NextPari gate is true and the verification below has passed. Otherwise RYXO gets `RYXO_REGISTRATION_DISABLED`.

Maintenance window:

1. Close new NextPari registration. Leave the local counter where it is. Do not enable RYXO.
2. Read public IDs only: every `wallets.public_id`, including wallets with no profile; every `profiles.public_id`; and `public.app_users` after its columns are inspected. Also read `private.player_public_id_counter.next_value`. Do not export email, phone, name, or balance. Do not treat 42, 44, or 979426 as the expected totals.
3. On the group database, call `group_control.reserve_legacy_nextpari_ids`. Missing legacy IDs are inserted. IDs already reserved as NextPari legacy are left as they are. The group counter moves up to the new floor if it is behind. It does not move backward. An allocated ID is not rewritten. The NextPari counter is not written.
4. Verify. Every exported ID is present as legacy for brand 001. The group counter is at least `max(production next_value, highest imported ID + 1)`. A second call with the same export returns the same counter. Stop if any exported ID belongs to another brand or has source `allocation`.
5. Open `nextpariUsesCentralAllocator` and point NextPari registration at `group_control.allocate_player_id`. Keep RYXO closed. If the central allocator is down, NextPari registration fails with `CENTRAL_ALLOCATOR_UNAVAILABLE`. It does not call `allocate_next_player_public_id()` or `next_player_public_id()`.
6. Verify the switch. Create one controlled NextPari registration. Confirm the new ID is in the group reservations with source `allocation` and brand 001, and that a fresh read-only export has no ID missing from the group reservations. Then repeat the import once. It must not decrease the counter and must not change that allocated row.
7. Only after step 6 passes, open `ryxoRegistrationEnabled`. RYXO uses the same counter and the same fail-closed rule.

Seven-digit IDs are not issued for a brand while its login contract still accepts only six digits. NextPari's contract today is exactly six digits (`parseLoginPlayerId`). The allocator raises `SEVEN_DIGIT_LOGIN_UNSUPPORTED` and leaves the counter unmoved. Raising that contract is a later change to that brand's login, not part of this pull request.

Until step 5 is implemented in a later change, NextPari behavior stays the current production behavior.

## Owner report

The owner report lists every catalog brand, including 003 while it is only planned. Each row has operational status, player count, staff subjects for that brand, and one financial block per currency. Totals add player, manager, and cashier counts. They do not add money. Adding TMTM to USD requires a conversion policy that does not exist yet, and `sumMoney` refuses mixed currencies. The report has no player rows.

Brand registration in this scaffold returns the fixed catalog entry. It does not create a Supabase project.

## Rollback

This pull request has nothing to roll back in production. The group modules are not on a request path.

If a later change wires NextPari to the central allocator and must be reversed:

- Stop calling `group_control.allocate_player_id` from NextPari.
- Leave every reserved ID in place. Do not delete reservations and do not reuse them.
- Leave `private.player_public_id_counter` at whatever value it already has. Do not set it back to 1.
- RYXO registration stays off until the group allocator is healthy again.

## Risks

- Opening the RYXO gate before NextPari is on the central allocator is rejected by the scaffold. A later implementation must keep that order.
- Seeding the group counter at 1 would collide with IDs NextPari already issued. The draft does not insert that seed.
- NextPari login still accepts only six digits. A seven-digit ID stays blocked until that brand's login contract is widened. That change is not in this pull request.
- A partial ID export leaves a hole. The verification step compares the fresh export with reservations. It does not compare against a stored count of 44.
- The same UUID can exist in two brand databases. Authorization matches brand code and UUID together. A grant is not a UUID alone.
- The owner dashboard in this pull request is a scaffold. It does not authenticate a real owner session.
- The in-memory allocator is the test model. Production allocation, when approved, is the SQL function in the group database, still with no local fallback.

## Later steps, after approval

1. Create the empty group database and apply the drafts there. Do not apply them to NextPari.
2. Run the read-only ID export and the reservation function. Check the counts.
3. Add the internal service, its token, and the brand databases for RYXO.
4. Freeze NextPari registration, run the read-only export, reserve IDs, verify, then switch NextPari to the central allocator. Keep RYXO closed until that verification passes.
5. Widen a brand's login past six digits before that brand is allowed to receive a seven-digit ID.
6. Build the owner dashboard on the group-auth session and the aggregate report. Keep each currency on its own line. Do not query another brand's wallets from a manager session.

## Approval stop

Owner approval is required before any group database, brand database, ID export, or registration switch. Until then, run `npm run group:foundation:test` only.
