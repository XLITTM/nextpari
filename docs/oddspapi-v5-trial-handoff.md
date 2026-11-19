# NextPari — OddsPapi V5 trial-only integration starter

**State: preview-only groundwork. NOT connected to NextPari player routes. NOT approved for real bets or production.**

Source repository: `XLITTM/nextpari`
Existing draft branch: `cursor/betsapi-readonly-feed-b001` (PR #92).

The V5 API key was retrieved securely from the one-time link and saved only as a Vercel Preview **sensitive** environment variable named `ODDSPAPI_V5_API_KEY`, restricted to the draft branch above. No key is inside this artifact.

## Real verification (20 Nov 2026)

- REST V5 `/en/sports`: HTTP 200, ten IDs: Soccer 10, Basketball 11, Tennis 12, Ice Hockey 15, Dota 16, Counter-Strike 17, League of Legends 18, Volleyball 23, Table Tennis 25, Valorant 61.
- REST V5 `/en/bookmakers`: HTTP 200; configured bookmaker: `1xbet`.
- REST `/en/fixtures/today?sportId=10&bookmakers=1xbet`: HTTP 200; events found.
- REST `/en/fixtures/live?sportId=10&bookmakers=1xbet`: HTTP 200; live events found.
- REST `/en/fixtures/odds?fixtureId=...&bookmakers=1xbet`: HTTP 200; live odds nested under `odds['1xbet']`. Quotes have `price`, `active`, `changedAt`, `marketId`, `outcomeId`.
- WebSocket `wss://v5.oddspapi.io/ws`: explicit `channels` and `bookmakers=['1xbet']` yielded `login_ok`; subsequent `UPDATE` frames on fixtures/odds arrived. Without channels, `login_failed` was observed.

## Included code

- `server/oddspapi/v5TrialClient.ts`: server-only read-only REST reader, fixed origin/bookmaker, 10 sport IDs, fail-closed quote filtering, timeouts and rate-limit handling.
- `server/oddspapi/v5WebSocket.ts`: explicitly scoped login frame and safe stream classification; **not** a running persistent consumer.
- `server/oddspapi/v5TrialClient.test.ts`: mock-based safety/unit tests.

## Wired in this branch

- Canonical ids use the `oddspapi-v5` namespace in `server/oddspapi/canonical.ts`. Event, market, and selection ids come from provider ids. Display names are not identity.
- `GET /api/internal/oddspapi-v5-preview` is closed in production. Preview requires `ODDSPAPI_V5_READONLY_PREVIEW=1` and header `x-oddspapi-v5-preview-key`. Responses set `betsAccepted: false` and `websocket: not-running`.
- `resolveSportsQuoteProvider('oddspapi-v5')` stays unsupported, so this provider cannot place a bet.
- The durable WebSocket worker is still a dependency. `V5_STREAM_WORKER_DEPENDENCY` records that stop. REST is the only runtime path here.

## Still required before switching source

1. Push this branch through authorized GitHub write access.
2. Run a persistent WebSocket ingestion worker outside short-lived Vercel request functions; implement REST bootstrap, cursor resume/replay, `snapshot_required` handling, bounded reconnect/backoff.
5. Subscribe to `bookmakers`, `odds`, `fixtures`, `scores`, `settlements`, test bookmaker `hasOdds`, `staleOdds`, `suspended`, per-price `active` and market settlement. Reject ambiguous market mappings.
6. Only when fully verified and separately owner-approved, switch read paths and then bet-acceptance/settlement paths behind feature flags. Maintain BetsAPI rollback until reliability is confirmed.
7. Run full NextPari web+Android+wallet regression tests; never take real money in trial tests.

**Safety**: Do not modify payments, casino, existing balances, settled bets, Supabase security or NextPari production. Do not merge/deploy automatically.
