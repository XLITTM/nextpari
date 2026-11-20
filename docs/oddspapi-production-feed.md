# OddsPapi V5 in the existing NextPari sports section

Production source base: `84a0e0a430a28eb2f347d9680fbb3228fcf54181`, branch `work/casino-demo-softaggregator-w001` in `XLITTM/nextpari`. The deployed casino and wallet source matches that base. This change touches only sports display and the sports placement refusal; it contains no migration or financial write.

`ODDSPAPI_V5_API_KEY` is a server-only Production secret in Vercel project `nextpari.nm`. No provider credential belongs in Git or a public frontend variable.

`ODDSPAPI_V5_READONLY_FEED=1` switches the existing `/api/player/sports/football-feed` list, `eventId`, and `oddsFor` reads to OddsPapi. The existing home, sport filters, match cards and market detail components render these responses. Namespaced `oddspapi-v5:id…` identities cannot be confused with BetsAPI event ids. All displayed selections are locked. The deployed `/api/player/sports/place` refuses before authentication or wallet access while this flag is set. `SPORTSBOOK_EMERGENCY_STOP=1` is also required operationally.

The reader uses fixed-host HTTPS REST GET requests for the ten configured V5 sport ids. It caches listings, catalogs and quotes, coalesces concurrent reads, limits quote batches to eight fixtures and backs off for 60 seconds on HTTP 429. Listing coverage is bounded; event detail fetches its available markets on opening. There is no persistent WebSocket consumer and no claim of subsecond delivery.

Only explicitly active, correctly mapped prices from a non-stale, non-suspended, non-rotated 1xBet fixture are displayed. Period, market and outcome identities come from the provider catalog. Player props without mapped player identity are excluded. An unchanged price can have an old change timestamp; a freshly fetched non-stale snapshot may display it, but never accept a stake. Unknown team names, sport mismatches, ambiguous markets and missing odds remain unavailable. Scores and football clocks are supplied only when the provider publishes them.

Verification: frontend and server typechecks, production frontend build, provider-reader tests, display/identity tests, place-refusal tests and sports selection regressions. A direct authorized live read returned HTTP 200 and 192 fixtures across six sports in about nine seconds before deployment. Production must additionally be checked on `https://nextpari.net` after its deployment is READY.

Do not enable bet acceptance or add an OddsPapi quote/settlement adapter until settlement, idempotency and accounting have been separately verified and approved.
