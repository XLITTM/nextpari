package com.nextpari.app.feature.wallets

import com.nextpari.app.core.network.ApiErrorMapper
import com.nextpari.app.core.network.NetworkError
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.userMessage
import java.io.IOException
import com.nextpari.app.core.network.session.WalletResponseScope
import com.nextpari.app.core.player.WalletRead
import com.nextpari.app.core.player.PlayerJsonMapper
import com.nextpari.app.core.player.PlayerStateStore
import com.nextpari.app.core.player.bool
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
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
    private val onUnauthorized: (WalletRead) -> Unit = {},
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
        val read = store.beginWalletRead()
        val playerId = read.playerId ?: return Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
        val response = try {
            api.wallets(WalletResponseScope { store.isCurrentWalletRead(read) })
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            return callFailure(error)
        }
        if (!store.isCurrentSession(read)) return Result.failure(IllegalStateException(WalletsCatalog.SESSION_EXPIRED))
        if (!store.isCurrentWalletRead(read)) return Result.success(Unit)
        if (response.code() == 401 || response.code() == 403) {
            onUnauthorized(read)
            return Result.failure(IllegalStateException(WalletsCatalog.SESSION_EXPIRED))
        }
        val validated = response.body()?.takeIf { response.isSuccessful }
            ?.let { PlayerJsonMapper.walletsFromBody(it, playerId) }
            ?: return Result.failure(IllegalStateException(WalletsCatalog.REFRESH_FAILED))
        if (!store.applyWalletRead(read, validated) && store.isCurrentWalletRead(read)) {
            return Result.failure(IllegalStateException(WalletsCatalog.REFRESH_FAILED))
        }
        return Result.success(Unit)
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
