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

Managers, cashiers, and security staff receive a grant for one brand code. A grant for 001 cannot read players, balances, transactions, or staff of 002. The owner identity lives in the group database and is not a brand manager.

## What NextPari does today

Player IDs are six-digit text on `wallets.public_id` and `profiles.public_id`. There is no `app_users` table. Login lookup is `private.resolve_player_login_email` in migration `039`, which accepts exactly six digits and matches `private.player_digits` on those two columns.

New IDs come from `private.player_public_id_counter`, a locked singleton, through `private.allocate_next_player_public_id()` in migration `044`. The counter is an integer from 1 to 1000000. The function skips IDs already stored on a wallet or profile, formats with `lpad` to six digits, and stops at 999999 with `PUBLIC_ID_SPACE_EXHAUSTED`. `ensure_player_account` calls that function only when the player has no wallet yet. Existing IDs are not rewritten.

An older helper, `next_player_public_id()` in `20260820143000_mobcash_agent.sql`, picks a random six-digit value. Current registration does not use it. The server helper `allocateSequentialPlayerId` in `server/player/playerPublicId.ts` is the same six-digit rule for tests. `parseLoginPlayerId` still requires `^[0-9]{6}$`.

Those files stay as they are. This pull request does not reset the counter and does not change any stored player ID.

## Central allocator

`server/group` is the model of the future control-plane allocator. The SQL drafts next to it describe the same rules. Nothing in `api/` or `vercel.json` calls it, and NextPari registration does not call it.

Rules:

- A player ID is a decimal string, unique across every brand.
- IDs from 1 through 999999 stay six digits with leading zeros, so today's NextPari IDs still match.
- 1000000 and above are the full decimal string. The space is not capped at 999999.
- Legacy IDs are reserved as the exact string stored on the wallet or profile. `000001` and `110790` cannot be issued again. A second reservation of the same legacy ID for NextPari is a no-op.
- The group counter is a separate row. It is not seeded to 1. Allocation before seeding fails with `COUNTER_NOT_SEEDED`.
- The seed value is `max(production next_value, max(reserved numeric ID) + 1)`. It is never lower than the production counter, and the production counter is not written.
- Allocation takes an idempotency key. The same brand and key return the same ID. The same key for another brand fails.
- Allocation is serialized the way `SELECT … FOR UPDATE` serializes the SQL function.
- If the allocator is unavailable, the call fails with `CENTRAL_ALLOCATOR_UNAVAILABLE`. There is no call to `allocateSequentialPlayerId` or `next_player_public_id()`.

Internal callers are a service with a private token. Android and browser callers are rejected even if they present that token. The token is not a `VITE_` variable and is not part of this commit.

## Player ID cutover

Do this only after the owner approves a group database, and before RYXO registration is turned on.

1. Leave NextPari registration on `private.allocate_next_player_public_id()` until the later switch in step 6.
2. On NextPari, read `public_id` from `wallets` and `profiles`, and read `next_value` from `private.player_public_id_counter`. Read only. Do not export email, phone, name, or balance.
3. On the group database, call `group_control.reserve_legacy_nextpari_ids` with that ID list and that next value. The draft refuses to update the NextPari counter.
4. Compare the reservation count with the distinct ID count. Stop if they differ.
5. RYXO may then call `group_control.allocate_player_id`. Those IDs cannot collide with a reserved NextPari ID.
6. When NextPari itself should use the central allocator, pause NextPari registration, repeat the read-only export, reserve any IDs issued during the gap, then switch NextPari. After that switch, a down central allocator stops registration. It must not fall back to the local counter.

Until step 6, NextPari behavior stays the current production behavior.

## Owner report

The owner report lists every catalog brand, including 003 while it is only planned. Each row has operational status, player count, financial totals, and the staff subjects granted to that brand. Totals add those counts. The report has no player rows.

Brand registration in this scaffold returns the fixed catalog entry. It does not create a Supabase project.

## Rollback

This pull request has nothing to roll back in production. The group modules are not on a request path.

If a later change wires NextPari to the central allocator and must be reversed:

- Stop calling `group_control.allocate_player_id` from NextPari.
- Leave every reserved ID in place. Do not delete reservations and do not reuse them.
- Leave `private.player_public_id_counter` at whatever value it already has. Do not set it back to 1.
- RYXO registration stays off until the group allocator is healthy again.

## Risks

- Turning RYXO registration on before the legacy reservation finishes can reuse a NextPari ID.
- Seeding the group counter at 1 would collide with IDs NextPari already issued. The draft does not insert that seed.
- NextPari login still accepts only six digits. A seven-digit ID needs a later login change before a player can sign in with it. That change is not in this pull request.
- A wrong or partial ID export leaves a hole. The count check in the cutover is the stop condition.
- Staff grants store a brand auth user id. Putting a NextPari manager uuid into a RYXO grant would authorize the wrong brand. Grants are inserted only by the group service, not by the Android client.
- The in-memory allocator is the test model. Production allocation, when approved, is the SQL function in the group database, still with no local fallback.

## Later steps, after approval

1. Create the empty group database and apply the drafts there. Do not apply them to NextPari.
2. Run the read-only ID export and the reservation function. Check the counts.
3. Add the internal service, its token, and the brand databases for RYXO.
4. Teach NextPari registration to reserve through the group service, fail closed when it is down, and keep the local counter from moving backward.
5. Extend player ID login beyond six digits only when the counter can pass 999999.
6. Build the owner dashboard on the aggregate report. Do not query another brand's wallets from a manager session.

## Approval stop

Owner approval is required before any group database, brand database, ID export, or registration switch. Until then, run `npm run group:foundation:test` only.
