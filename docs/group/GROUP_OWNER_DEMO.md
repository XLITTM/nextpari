# Group Owner demo deployment

This is the setup for a new Vercel project named `group-owner-demo`. It serves the standalone Group Owner demonstration. It is not the NextPari production project, and this repository's root `vercel.json` stays the NextPari SPA rewrite.

Do not create the project, deploy, or copy environment variables until the owner approves that step.

## Build

From the repository root on branch `cursor/group-owner-dashboard-b002`:

```text
npm run build:group-owner
```

Output directory: `dist-group-owner`

That directory contains `index.html`, so the project root URL opens the dashboard. `group-owner.html` is the same file. The NextPari command remains `npm run build`, which still writes the production app and does not use this directory.

The dashboard is one page. Обзор, Бренды, Сотрудники, Игроки, Финансы, Доступ, and Журнал are controls inside that page. The root URL opens Обзор.

## Why the shared vercel.json still works

`vercel.json` rewrites a path to `/index.html` only when that path is not a built file and is not under `/api/`, `/images/`, or `/icons/`. Vercel checks the output directory first, so `/` and `/assets/...` from `dist-group-owner` are served as files. Any other non-API path falls back to this project's own `index.html`.

Do not edit that file for the demo. Changing the rewrite would change NextPari production routing.

The demo project uses the repository root, so Vercel can also upload the existing `api/` functions. Deployment Protection must cover those paths too. Do not give the project NextPari environment variables; the functions then have no production credentials.

## Owner setup

1. In the Vercel team that owns NextPari, create a project named `group-owner-demo`.
2. Import `XLITTM/nextpari`. Do not attach this project to the existing NextPari project.
3. Framework preset: Vite. Override the build settings exactly:
   - Build command: `npm run build:group-owner`
   - Output directory: `dist-group-owner`
   - Install command: the default `npm install`
   - Root directory: repository root
4. Production branch: `cursor/group-owner-dashboard-b002`. Do not use `main`.
5. Environment variables: leave the project empty. Do not import or paste NextPari variables.
6. Do not add a custom domain.

## Deployment protection

Open the new project, then Security → Deployment Protection.

1. Method: Vercel Authentication.
2. Scope: All Deployments. This is the API value `ssoProtection.deploymentType = "all"`. Standard Protection is not enough, because it leaves production domains open.
3. Shareable Links: off. Do not generate a link.
4. Protection Bypass for Automation: off. Do not create a bypass secret.
5. OPTIONS Allowlist: empty.
6. Deployment Protection Exceptions: none.
7. Custom domains: none.

Vercel Authentication then asks for a Vercel account that can view this project. A shareable link or a bypass secret would let someone skip that check.

## Verify protection before sharing the URL

Use a Chrome profile that is not signed in to Vercel. A private window is enough when it has no Vercel cookies.

1. Open the production URL Vercel shows for `group-owner-demo`.
2. Confirm the response is the Vercel sign-in wall. The page title must not be `Владелец группы — демонстрация`, and the HTML must not contain `Демонстрационные данные`.
3. Request `https://<project-domain>/api/player/` in that same signed-out window. Confirm it is the same sign-in wall, not a JSON payload.
4. Sign in with a Vercel account that is a member of the team, then reload `/`. Confirm the Russian demo opens, the gold demo banner is visible, and Создать бренд and Отправить приглашение stay disabled.
5. Sign out of Vercel, or use the private window again, and confirm `/` returns to the sign-in wall.
6. Only after those checks, send the URL to people who already have access to the Vercel project. Do not post it publicly.

## Authentication

The dashboard now starts at a group-owner login. It is not the NextPari owner login. Cookies are `np_group_access` and `np_group_refresh`, HttpOnly, and separate from `nextpari_owner_access`.

Password sign-in uses the Supabase anon key on the server. The server loads `owner_identities` before it allows TOTP enrollment. A password-only session cannot open data. Reads require an `aal2` session. MFA enrollment and verification are `POST /api/group-owner/auth/enroll` and `POST /api/group-owner/auth/mfa`.

After `aal2`, the server reads `group_control` with the `group_control_reader` database role over a pooled TLS connection. It does not use PostgREST and it does not use the service-role key. A brand staff UUID is not an owner. Rows are limited to `brand_owners` for that owner. The browser bundle does not contain the database URL.

This pull request does not create an owner account. The manual steps are in `docs/group/GROUP_OWNER_BOOTSTRAP.md`.

## Read API

`GET /api/group-owner/overview|brands|staff|players|finance|access|audit|treasury`

`POST /api/group-owner/treasury` returns `TREASURY_WRITES_DISABLED`. `POST /api/group-owner/staff` returns `STAFF_WRITES_DISABLED`. Player-id cutover and RYXO registration are not called.

Do not add `group_control` to the Supabase Data API exposed schemas. The reader compares the live catalog with `server/group/schemaContract.ts` and returns `GROUP_COLUMN_MISMATCH` when a required column is absent.

NextPari brand reports are not loaded with the group owner JWT. The response reason is `NEXTPARI_REPORT_ADAPTER_REQUIRED` until a separate server-to-server adapter exists.

On the group-owner project set `GROUP_OWNER_DEPLOYMENT=1`. Middleware then returns 404 for every `/api` route except `/api/group-owner`. Leave that variable unset on NextPari.

Server environment, after approval: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GROUP_CONTROL_DATABASE_URL`. Never copy the database URL into a `VITE_` variable. Do not put `SUPABASE_SERVICE_ROLE_KEY` on this project.

## What the demo does not do

Authenticated screens do not ship demonstration counts. The employee form never creates an account. Finance is read-only and does not add different currencies. Treasury movement stays closed.
