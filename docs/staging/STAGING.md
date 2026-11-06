# Staging environment

This repository can boot a separate staging deployment. Production is unchanged when `NEXTPARI_ENV` is unset. Staging refuses to start until its Supabase project, public host, cookies, wallets, payments, and provider settings are isolated.

Nothing in this change creates cloud resources, applies migrations, copies player data, or turns on real-money play. Stop after review and wait for owner approval before any provisioning step below.

## Topology

Use four separate places. Do not reuse the production project, service, or database.

| Surface | Production today | Staging |
| --- | --- | --- |
| Web and API | Existing Vercel project. `vercel.json` rewrites stay as they are. | A second Vercel project. Same `vercel.json`. Set `NEXTPARI_ENV=staging`. |
| LSports worker | Existing Railway service. `railway.toml` stays as it is. | A Railway environment named `staging`. The feed consumer stays off. |
| Database and auth | Existing Supabase project. | A new empty Supabase project. Apply the existing migration files only after approval. |
| Players and staff | Real accounts. | Synthetic accounts on `staging.nextpari.test` only. |

Vercel sets `VERCEL_ENV=production` on the main branch of every project, including a future staging project. That value does not mean Nextpari production. `NEXTPARI_ENV=staging` is the isolation switch. Vercel Preview is not staging. Do not point Preview at the production service-role key.

Player, staff, and Android clients keep the current HTTP paths and cookie names (`nextpari_player_access` and the matching staff cookies). Android uses the player API. Isolation is a different site with host-only cookies, not a second API and not multi-tenancy.

## Templates

Variable names live in:

- `.env.staging.example`
- `deploy/staging/vercel.env.example`
- `deploy/staging/railway.env.example`

Those files hold switches such as `false`, `0`, and `staging`. Secret values stay empty. Fill secrets only in the host dashboard. `npm run staging:check` reads the process environment and prints a result code. It does not print secret values and it does not call Supabase.

## Required staging values

| Name | Value |
| --- | --- |
| `NEXTPARI_ENV` | `staging` |
| `NEXTPARI_SYNTHETIC_USERS_ONLY` | `true` |
| `NEXTPARI_REAL_MONEY_ENABLED` | `false` |
| `NEXTPARI_PAYMENTS_ENABLED` | `false` |
| `NEXTPARI_WALLET_MODE` | `synthetic` |
| `NEXTPARI_ALLOW_PRODUCTION_PLAYER_IMPORT` | `false` |
| `NEXTPARI_STAGING_CREDENTIALS_ARE_DISTINCT` | `true` after new keys and peppers exist |
| `NEXTPARI_PLAYER_EMAIL_DOMAIN` | `staging.nextpari.test` |
| `NEXTPARI_COOKIE_DOMAIN` | empty, so cookies stay host-only |
| `NEXTPARI_PUBLIC_ORIGIN` | `https` host whose name contains `staging` and is outside `nextpari.net` |
| `NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF` | 20-character ref from the production dashboard URL |
| `NEXTPARI_STAGING_SUPABASE_PROJECT_REF` | 20-character ref of the new project |
| `SUPABASE_URL` and `VITE_SUPABASE_URL` | `https://<staging-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` and `VITE_SUPABASE_ANON_KEY` | anon key generated in the staging project |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key generated in the staging project. Never a `VITE_` name. |
| `PLAYER_EMAIL_OTP_PEPPER` and `PLAYER_SECURITY_SIGNAL_PEPPER` | two different values, each at least 32 characters, generated for staging |
| `BETCONSTRUCT_ENABLED` | `0`, and every other `BETCONSTRUCT_` value empty |
| `CANONICAL_SPORTS_BET_ENABLED` | `0` |
| `LSPORTS_DISPLAY_FEED` and `VITE_LSPORTS_DISPLAY_FEED` | `0`, and every LSports credential, package id, and feed URL empty |
| `VITE_SENTRY_ENVIRONMENT` and `SENTRY_ENVIRONMENT` | `staging` when a DSN is set. DSNs may stay empty. |
| `RESEND_API_KEY`, `PLAYER_EMAIL_FROM` | empty |
| `DATABASE_URL` and other direct Postgres URLs | empty in Vercel and Railway |

`NEXTPARI_STAGING_CREDENTIALS_ARE_DISTINCT=true` means the operator generated the staging anon key, service-role key, and peppers for this project. It is not a substitute for those values being different from production. The checker also rejects any staging value that contains the production project ref, `nextpari.net`, or `nextpari-production.up.railway.app`.

Known production LSports package ids `4351` and `4352` stay on the production worker. Staging rejects every LSports credential, including a different package id. Ordering a staging feed is a later decision.

## What staging refuses

The process exits the request or the worker with `EnvironmentIsolationError` when staging configuration is incomplete or points at production.

- Supabase URL whose project ref is the production ref, or a different ref than `NEXTPARI_STAGING_SUPABASE_PROJECT_REF`
- A direct database URL, so a production Postgres connection string cannot be deployed
- Public origin `nextpari.net`, any host under it (including `staging.nextpari.net`), or the production Railway host
- Any `NEXTPARI_COOKIE_DOMAIN`, because a parent domain would send production cookies to staging
- `NEXTPARI_REAL_MONEY_ENABLED` other than `false`
- Payment-provider variables (`STRIPE_`, `PAYPAL_`, `NOWPAYMENTS_`, `COINBASE_`, and the other prefixes in the checker)
- BetConstruct operator id, shared keys, allowlists, or iframe origins
- LSports usernames, passwords, package ids, feed URLs, or the production Railway feed
- Live sports betting (`CANONICAL_SPORTS_BET_ENABLED=1`)
- Resend or any outbound player email
- Import of production players (`NEXTPARI_ALLOW_PRODUCTION_PLAYER_IMPORT` must be `false`)
- A Railway environment named `staging` when `NEXTPARI_ENV` is missing
- `NEXTPARI_ENV=production` on a Railway environment named `staging`, or on a public origin whose host contains `staging`

Current production, with `NEXTPARI_ENV` unset, does not need these variables. `NEXTPARI_ENV=test` and `NEXTPARI_ENV=development` are local roles. A deployed Vercel or Railway process cannot use them.

Wallet balances live in the Supabase project named by `SUPABASE_URL`. Synthetic wallet mode plus a separate project keeps staging balances off the production ledger. This does not add a second wallet engine and does not add tenant ids.

## Synthetic users

Create accounts only in the staging Supabase project, after that project exists and after approval.

1. In the staging project, open Authentication and add each user by hand.
2. Use emails at `staging.nextpari.test`, such as `player.one@staging.nextpari.test`, `owner.one@staging.nextpari.test`, `manager.one@staging.nextpari.test`, `cashier.one@staging.nextpari.test`, and `security.one@staging.nextpari.test`.
3. Generate each password in a password manager. Do not commit passwords, do not reuse production passwords, and do not paste real player emails or phone numbers.
4. Sign in on the staging host only. Host-only cookies named `nextpari_player_access` (and the staff equivalents) are not sent to `nextpari.net`.

There is no seed file under `supabase/migrations`. A seed there would run on the next production migrate.

## Supabase provisioning

Do this only after the owner approves a new project. The steps create a billed or quota-consuming project once they are run.

1. In the Supabase dashboard, create a new project. Leave it empty. Do not use a production backup, restore, or CSV import.
2. Copy the new project ref from the project URL. It is the 20-character label in `https://<ref>.supabase.co`. Put it in `NEXTPARI_STAGING_SUPABASE_PROJECT_REF`.
3. Copy the existing production ref the same way, from the production project URL only. Put it in `NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF`. Do not copy the production service-role key into staging notes or into git.
4. In the new project, open API settings and generate the anon key and service-role key. Those are the only keys staging may use.
5. Generate two new peppers for `PLAYER_EMAIL_OTP_PEPPER` and `PLAYER_SECURITY_SIGNAL_PEPPER`.
6. Store the keys and peppers in the staging Vercel project and the staging Railway environment. Leave them out of git, logs, and pull requests.
7. Set `NEXTPARI_STAGING_CREDENTIALS_ARE_DISTINCT=true` only after steps 4 and 5 used new values.

## Migration procedure

The SQL already in `supabase/migrations` is the schema staging should reach. This task does not add a migration and does not run one.

After the owner approves applying that existing schema to the new project:

1. Export only the staging ref in the shell that will run the CLI. Do not export a production database URL in that shell.
2. From this repository, link the CLI: `supabase link --project-ref <staging-ref>`.
3. Read the linked ref back and confirm it is the staging ref.
4. Apply the existing files: `supabase db push`.
5. Run `npm run staging:check` with the staging dashboard values loaded in that shell. The only success line is `STAGING_ENVIRONMENT_OK`.

Do not run `supabase db dump`, `supabase db pull`, or a backup restore against production. Do not point `supabase link` at the production ref. If the linked ref is the production ref, stop.

## Checks

`npm run staging:isolation:test` covers the rules below with fake refs and fake keys. `npm run staging:check` is the operator command for a real staging shell.

Production paths covered by the unit tests stay on these contracts:

- Player: `/api/player/auth/login`, `/api/player/auth/register`, `/api/player/me`, `/api/player/wallet`, `/api/player/wallets`, `/api/player/wallets/add`, `/api/player/wallets/active`
- Staff: `/api/owner/auth/login`, `/api/manager/auth/login`, `/api/cashier/auth/login`, `/api/security/auth/login`
- Cookies: `nextpari_player_access`, `nextpari_player_refresh`, `nextpari_player_device`, and the owner, manager, cashier, and security access and refresh cookies
- Deploy files: `vercel.json` still rewrites to `/index.html`. `railway.toml` still starts with `npm start` and checks `/health`.

## Costs

This pull request provisions nothing and costs nothing.

Later, after approval, expect a separate Supabase project, a separate Vercel project, and a Railway staging environment. Confirm current prices in each dashboard before creating them.

- Supabase free organizations can hold only a small number of active projects, and idle free projects may pause. If the organization is already at that limit, another project needs a paid plan. Supabase Pro is billed per project. The public list price has been $25 per project per month plus usage. Treat that as a planning figure, then confirm it.
- Vercel charges by plan and by usage. An extra project on Pro is often included, with bandwidth and function invocations metered. The Hobby plan limits how many projects an account can have.
- Railway is usage-priced. A staging service that does not sleep can cost a small monthly amount even when idle. Leaving the LSports consumer off avoids a provider package purchase.
- BetConstruct stays disabled, so there is no operator setup and no real-money traffic.
- No domain purchase is required when the public origin is the Vercel hostname that contains `staging`.
- Sentry and Resend can stay empty. An optional staging Sentry environment uses the existing account quota. Outbound email stays off, so Resend is not billed.
- No production data is copied, so staging storage starts empty.

## Risks

- Setting `NEXTPARI_ENV=staging` on the production Vercel project or the production Railway service fail-closes that process. Leave production unset.
- The checker can see the production database only when `NEXTPARI_PRODUCTION_SUPABASE_PROJECT_REF` is the real production ref. A wrong ref defeats that comparison.
- Cookie names are shared by design so the Android and web clients stay compatible. A later change that sets a cookie `Domain` of `nextpari.net` would merge sessions. Staging rejects `NEXTPARI_COOKIE_DOMAIN`.
- Vercel Preview is outside this guard. Keep production service-role keys out of Preview.
- Staging has no LSports odds and no BetConstruct launch until a later approved project. The player API still responds; those providers stay not configured.
- This is one staging project and one production project. It is not multi-tenant.

## Approval stop

Owner approval is required before creating the Supabase project, the Vercel project, or the Railway environment, and before `supabase link` or `supabase db push`. Until then, use the templates and `npm run staging:isolation:test` only.
