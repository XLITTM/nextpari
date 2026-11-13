# SoftAggregator standard casino

Standard and demo share catalog normalization. They use separate server credentials and routes. The native Android client opens the authenticated website Slots and Live Casino pages through the existing WebView session bridge.

## Accounting

USD is derived from both enabled owner USDT deposit rate rows. The player must accept the current version before launch. Each player/game/rate binding keeps both rates, the TMT wallet ID and the exact provider game ID. A changed rate produces a new binding. A successful launch opens a two-hour debit window. Settlement and reversals on activated bindings survive rate changes, expiry and the new-play switch.

All movements use the shared Wallet Core. Provider amounts are integer USD cents. Display balance uses floor division. Ledger movements use cumulative round amounts per direction, rounding to the nearest TMT minor unit with ties away from zero. A partial rollback reverses the change in the recorded cumulative net. A full rollback restores the exact original amount. Calls and ledger entries can be joined on ledger ID. Standalone provider credits are supported. Enable production only after signed debit, credit and rollback examples from the intended provider site have been reconciled with both Wallet Core and the existing fund-attribution trigger.

## Controlled release

- Use the existing operator credentials for the authorized site. The production callback is `/api/internal/casino/softaggregator/callback`. It requires both signatures documented by SoftAggregator and its fixed source IP.
- Use branch-scoped real login/password, salt, exact callback host, launch-origin allowlist, independent player-identity secret and approved country allowlist. Variable names have the prefix `SOFTAGGREGATOR_REAL_` and are read by `server/casino/softAggregatorReal.ts` and `server/casino/softAggregator.ts`. Apply the additive wallet migration only to the designated environment after verification.
- `CALLBACK_ENABLED` admits signed balance reads, including in catalog-only mode. `LAUNCH_ENABLED` permits an eligible player to open `getGame` once the launch origins, market and operator credit are configured. `CALLBACK_VERIFIED` and `WALLET_VERIFIED` permit financial callbacks after signed verification and reconciliation. `NEW_PLAY_ENABLED` independently allows new debits. The SQL callback enforces the verified player binding, currency, exact game ID and wallet lock. Preview requires a designated pilot.
- For an incident, disable `NEW_PLAY_ENABLED` and leave the settlement callback active. The public catalog can be hidden separately with `CATALOG_ENABLED`. Until a supported operator-credit API is confirmed, credit readiness is an explicit operator control. Upstream launch errors do not activate a new debit window.

## Reconcile a session

Use read-only SQL in the designated administrative context. Match the provider's documented player round history by game and round. Compare accepted USD cents, rollback direction and applied rate with the canonical ledger entries. A zero TMT delta can have a successful callback with no ledger row due to cumulative rounding.

```sql
SELECT c.provider_round_id, c.call_hash, c.action, c.rollback,
       c.provider_currency, c.provider_amount_minor,
       s.usdt_tmt, s.usdt_usd, c.error, c.balance_minor,
       l.id AS ledger_id, l.currency, l.available_delta, l.available_after
FROM private.softaggregator_wallet_calls c
JOIN private.softaggregator_sessions s ON s.id = c.session_id
LEFT JOIN private.wallet_ledger l ON l.id = c.ledger_id
WHERE c.session_id = $1
ORDER BY c.created_at, c.call_hash;
```
