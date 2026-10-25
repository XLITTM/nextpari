package com.nextpari.app.feature.wallets

import com.nextpari.app.core.network.ApiErrorMapper
import com.nextpari.app.core.network.NetworkError
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.userMessage
import java.io.IOException
import com.nextpari.app.core.player.MappedWalletRow
import com.nextpari.app.core.player.PlayerJsonMapper
import com.nextpari.app.core.player.PlayerStateStore
import com.nextpari.app.core.player.bool
import com.nextpari.app.core.player.mappedWalletsToRows
import com.nextpari.app.core.player.num
import com.nextpari.app.core.player.str
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import retrofit2.Response

/**
 * Player wallet mutations use the signed-in cookie session and the display
 * currency accepted by normalizeRegistrationCurrency (TMT, never TMTM).
 * Balances are replaced only from a validated GET /api/player/wallets payload.
 */
class RemoteWalletsRepository(
    private val store: PlayerStateStore,
    private val api: PlayerApi,
    private val json: Json,
    private val hasSession: () -> Boolean,
) : WalletsRepository {
    private val gate = Mutex()

    override fun ownedWallets(): List<PlayerWalletRow> = store.wallets()

    override suspend fun refresh(): Result<Unit> = gate.withLock {
        if (!hasSession()) return@withLock Result.success(Unit)
        reloadAuthoritative()
    }

    override suspend fun addWallet(currency: String): Result<Unit> = gate.withLock {
        val display = apiCurrency(currency)
            ?: return@withLock Result.failure(IllegalArgumentException(WalletsCatalog.CURRENCY_INVALID))
        if (!hasSession()) {
            return@withLock Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
        }
        val posted = execute(buildJsonObject { put("currency", display) }, api::addWallet)
        if (posted.isFailure) posted else reloadAuthoritative()
    }

    override suspend fun setActiveWallet(currency: String): Result<Unit> = gate.withLock {
        val display = apiCurrency(currency)
            ?: return@withLock Result.failure(IllegalArgumentException(WalletsCatalog.CURRENCY_INVALID))
        if (!hasSession()) {
            return@withLock Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
        }
        val posted = execute(activeBody(display), api::setActiveWallet)
        if (posted.isFailure) posted else reloadAuthoritative()
    }

    private fun apiCurrency(code: String): String? {
        if (WalletsCatalog.storageCurrency(code) == null) return null
        val display = WalletsCatalog.displayCurrency(code)
        return display.takeIf { it in WalletsCatalog.displayCodes }
    }

    private fun activeBody(display: String): JsonObject {
        val walletId = store.wallets().firstOrNull { row ->
            WalletsCatalog.displayCurrency(row.currency) == display && row.walletId.isNotBlank()
        }?.walletId
        return buildJsonObject {
            put("currency", display)
            if (!walletId.isNullOrBlank()) put("walletId", walletId)
        }
    }

    private suspend fun execute(
        body: JsonObject,
        call: suspend (JsonObject) -> Response<JsonObject>,
    ): Result<Unit> {
        val response = try {
            call(body)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            return callFailure(error)
        }
        val parsed = response.jsonBody(json)
        if (response.code() == 401 || response.code() == 403) {
            return Result.failure(IllegalStateException(WalletsCatalog.SESSION_EXPIRED))
        }
        if (!response.isSuccessful || parsed?.bool("ok") != true) {
            return Result.failure(IllegalStateException(messageFor(PlayerJsonMapper.errorCode(parsed))))
        }
        return Result.success(Unit)
    }

    private suspend fun reloadAuthoritative(): Result<Unit> {
        val response = try {
            api.wallets()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            return callFailure(error)
        }
        val body = response.jsonBody(json)
        if (response.code() == 401 || response.code() == 403) {
            return Result.failure(IllegalStateException(WalletsCatalog.SESSION_EXPIRED))
        }
        if (!response.isSuccessful || body == null) {
            return Result.failure(IllegalStateException(WalletsCatalog.REFRESH_FAILED))
        }
        val validated = validatedRows(body)
            ?: return Result.failure(IllegalStateException(WalletsCatalog.REFRESH_FAILED))
        val active = validated.firstOrNull { it.isActive }
        store.applyAuthoritativeWallets(
            rows = mappedWalletsToRows(validated),
            activeBalance = active?.availableBalance,
            activeCurrency = active?.let { WalletsCatalog.displayCurrency(it.currency) },
        )
        return Result.success(Unit)
    }

    private fun validatedRows(body: JsonObject): List<MappedWalletRow>? {
        if (body.bool("ok") != true) return null
        val rows = body["wallets"] as? JsonArray ?: return null
        val parsed = ArrayList<MappedWalletRow>(rows.size)
        val seen = HashSet<String>()
        for (element in rows) {
            val raw = element as? JsonObject ?: return null
            val walletId = raw.str("walletId", "wallet_id")
            if (walletId.isBlank() || !seen.add(walletId)) return null
            val currencyRaw = raw.str("currency")
            if (WalletsCatalog.storageCurrency(currencyRaw) == null) return null
            if (raw["isActive"] == null && raw["is_active"] == null) return null
            val available = raw.num("availableBalance", "available_balance") ?: return null
            val locked = raw.num("lockedBalance", "locked_balance") ?: return null
            if (!available.isFinite() || available < 0.0 || !locked.isFinite() || locked < 0.0) return null
            parsed += MappedWalletRow(
                walletId = walletId,
                currency = currencyRaw,
                availableBalance = available,
                lockedBalance = locked,
                isActive = raw.bool("isActive") == true || raw.bool("is_active") == true,
                displayNameRu = raw.str("displayNameRu", "display_name_ru"),
            )
        }
        return parsed
    }

    private fun callFailure(error: Throwable): Result<Unit> {
        val mapped = ApiErrorMapper.fromThrowable(error)
        val message = when {
            mapped !is NetworkError.Unknown -> mapped.userMessage()
            isDroppedConnection(error) -> NetworkError.Offline.userMessage()
            else -> WalletsCatalog.OPERATION_FAILED
        }
        return Result.failure(IllegalStateException(message))
    }

    private fun isDroppedConnection(error: Throwable): Boolean {
        var current: Throwable? = error
        while (current != null) {
            if (current is IOException) return true
            val text = current.message.orEmpty()
            if (text.contains("EOF", ignoreCase = true) || text.contains("unexpected end of stream", ignoreCase = true)) {
                return true
            }
            current = current.cause
        }
        return false
    }

    private fun messageFor(code: String): String = when (code) {
        "CURRENCY_UNSUPPORTED" -> WalletsCatalog.CURRENCY_UNSUPPORTED_MESSAGE
        "CURRENCY_WALLET_ALREADY_EXISTS" -> WalletsCatalog.CURRENCY_EXISTS
        "JWT_REQUIRED", "JWT_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED", "AUTH_REQUIRED",
        "STAFF_ACCOUNT", "PLAYER_ACCOUNT_REQUIRED",
        -> WalletsCatalog.SESSION_EXPIRED
        "PLAYER_CURRENCY_WALLET_REQUIRED" -> WalletsCatalog.ADD_CURRENCY_FIRST
        "WALLET_BLOCKED", "WALLET_CLOSED", "WALLET_NOT_OWNED", "WALLET_UNAVAILABLE" ->
            WalletsCatalog.WALLET_UNAVAILABLE_MESSAGE
        else -> WalletsCatalog.OPERATION_FAILED
    }
}

private fun Response<JsonObject>.jsonBody(json: Json): JsonObject? {
    body()?.let { return it }
    val raw = errorBody()?.string().orEmpty()
    if (raw.isBlank()) return null
    return runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull()
}
