# SoftAggregator standard casino

Standard and demo share catalog normalization. They use separate server credentials and routes. The native Android client opens the authenticated website Slots and Live Casino pages through the existing WebView session bridge.

## Accounting

USD is derived from both enabled owner USDT deposit rate rows. The player must accept the current version before launch. Each player/game/rate binding keeps both rates, the TMT wallet ID and the exact provider game ID. A changed rate produces a new binding. A successful launch opens a two-hour debit window. Settlement and reversals on activated bindings survive rate changes, expiry and the new-play switch.

All movements use the shared Wallet Core. Provider amounts are integer USD cents. Display balance uses floor division. Ledger movements use cumulative round amounts per direction, rounding to the nearest TMT minor unit with ties away from zero. A partial rollback reverses the change in the recorded cumulative net. A full rollback restores the exact original amount. Calls and ledger entries can be joined on ledger ID. Standalone provider credits are supported. Enable production only after signed debit, credit and rollback examples from the intended provider site have been reconciled with both Wallet Core and the existing fund-attribution trigger.

## Controlled release

- Use the existing operator credentials for the authorized site. The production callback is `/api/internal/casino/softaggregator/callback`. It requires both signatures documented by SoftAggregator and its fixed source IP.
- Use the existing site's real login/password, salt, exact callback host, launch-origin allowlist and independent player-identity secret. Variable names have the prefix `SOFTAGGREGATOR_REAL_` and are read by `server/casino/softAggregatorReal.ts` and `server/casino/softAggregator.ts`. Use the verified player's residence country from the existing player record in the provider request.
- `CALLBACK_ENABLED` admits signed balance reads, including in catalog-only mode. With a designated `PILOT_PLAYER` and monetary operations disabled, `LAUNCH_ENABLED` permits a production balance-only launch for that account. These sessions have `debit_until = '-infinity'`. A signed debit, credit or rollback that arrives while wallet writes are disabled is rejected and logged as `softaggregator_signed_wallet_write_blocked`, without wallet data or a ledger entry.
- `PILOT_MONETARY=1` together with `PILOT_MONETARY_UNTIL` no more than 48 hours ahead opens debit and credit together for that one player. A successful launch confirms the existing two-hour debit window. Callbacks are accepted only when the stored session belongs to `PILOT_PLAYER`. Each new stake is at most 100 USD cents, and cumulative net loss is at most 500 USD cents. Removing `PILOT_MONETARY` stops further money movement on the next request. This switch does not set `CALLBACK_VERIFIED`, `WALLET_VERIFIED`, or `NEW_PLAY_ENABLED`.
- Normal launches require `LAUNCH_ENABLED`, `CALLBACK_VERIFIED`, `WALLET_VERIFIED`, `OPERATOR_CREDIT_READY` and `NEW_PLAY_ENABLED`. Confirm genuine provider debit, credit and rollback and reconcile Wallet Core before setting the financial release flags. Clear `PILOT_PLAYER` when releasing normal production access to all eligible players. The SQL callback enforces the verified player binding, currency, exact game ID and wallet lock. Preview requires a designated pilot.
- For an incident, disable `NEW_PLAY_ENABLED` and leave the settlement callback active. The public catalog can be hidden separately with `CATALOG_ENABLED`. Until a supported operator-credit API is confirmed, credit readiness is an explicit operator control. Upstream launch errors do not activate a new debit window.

## Operator verification

The operator verifies the player's identity, age and residence using the existing manual-verification workflow. Launch checks the completed review and reads the country and date of birth from the player's record. Production debits require an active session, a current verified adult account and the independent wallet release switches. SoftAggregator checks the player's country for the selected game.

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
