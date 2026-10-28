package com.nextpari.app.feature.wallet

import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.PlayerCallResult
import com.nextpari.app.core.network.isSessionCode
import com.nextpari.app.core.network.playerCall
import com.nextpari.app.core.player.PlayerStateStore
import com.nextpari.app.core.player.bool
import com.nextpari.app.core.player.formatServerBalance
import com.nextpari.app.core.player.isPlayerProfileComplete
import com.nextpari.app.core.player.num
import com.nextpari.app.core.player.obj
import com.nextpari.app.core.player.str
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale

class RemoteWalletRepository(
    private val store: PlayerStateStore,
    private val api: PlayerApi? = null,
    private val json: Json? = null,
    private val hasSession: () -> Boolean = { false },
) : WalletRepository {
    override fun snapshot(): WalletSnapshot {
        val me = store.me()
        if (me == null) {
            return WalletSnapshot(
                displayBalance = WalletCatalog.UNAVAILABLE_BALANCE,
                currency = WalletCatalog.CURRENCY,
            )
        }
        return WalletSnapshot(
            displayBalance = formatServerBalance(me.wallet.balance),
            currency = me.wallet.currency,
        )
    }

    override fun publicId(): String = store.me()?.playerPublicId.orEmpty()

    override fun availableAmount(): Double? = store.me()?.wallet?.balance

    override fun profileComplete(): Boolean {
        val profile = store.me()?.profile ?: return false
        return isPlayerProfileComplete(profile)
    }

    override fun withdrawals(): List<WithdrawalUiModel> = emptyList()

    override fun payoutDestinations(): List<PayoutDestinationUiModel> = emptyList()

    override fun quoteTargets(): List<UsdtQuoteTarget> = emptyList()

    override suspend fun loadFinancials(): WalletFinancials {
        val client = api
        val parser = json
        if (client == null || parser == null || !hasSession()) return WalletFinancials()
        val withdrawals = playerCall(parser) { client.withdrawals() }
        val destinations = playerCall(parser) { client.payoutDestinations() }
        val targets = playerCall(parser) { client.usdtTargets() }
        return WalletFinancials(
            withdrawals = (withdrawals as? PlayerCallResult.Ok)?.body?.let(::mapWithdrawals).orEmpty(),
            destinations = (destinations as? PlayerCallResult.Ok)?.body?.let(::mapDestinations).orEmpty(),
            quoteTargets = (targets as? PlayerCallResult.Ok)?.body?.let(::mapTargets).orEmpty(),
            withdrawalsError = errorOf(withdrawals, "Не удалось загрузить заявки на вывод."),
            destinationsError = errorOf(destinations, WalletCatalog.DESTINATIONS_ERROR),
        )
    }

    override suspend fun submitWithdrawal(submission: WithdrawalSubmission): Result<WithdrawalUiModel> {
        val client = api
        val parser = json
        if (client == null || parser == null || !hasSession()) {
            return Result.failure(IllegalStateException(WalletCatalog.SESSION_UNAVAILABLE))
        }
        val body = buildJsonObject {
            put("method", submission.method)
            put("methodLabel", submission.methodLabel)
            put("amount", submission.amount)
            put("idempotencyKey", submission.idempotencyKey)
            if (submission.destinationRef.isNotBlank()) put("destinationRef", submission.destinationRef)
            if (submission.city.isNotBlank()) put("cashPickupCity", submission.city)
            if (submission.point.isNotBlank()) put("cashPickupPoint", submission.point)
            if (submission.payoutDestinationId.isNotBlank()) put("payoutDestinationId", submission.payoutDestinationId)
        }
        return when (val result = playerCall(parser) { client.createWithdrawal(body) }) {
            is PlayerCallResult.Ok -> {
                val row = mapWithdrawal(result.body.obj("data") ?: result.body)
                if (row == null) Result.failure(IllegalStateException(WalletMessages.CREATE_FAILED))
                else Result.success(row)
            }
            is PlayerCallResult.Rejected -> Result.failure(IllegalStateException(WalletMessages.of(result.code, result.transport)))
        }
    }

    override suspend fun quoteUsdt(sourceAmount: String, walletId: String): Result<String> {
        val client = api
        val parser = json
        if (client == null || parser == null || !hasSession()) {
            return Result.failure(IllegalStateException(WalletCatalog.SESSION_UNAVAILABLE))
        }
        if (walletId.isBlank()) return Result.failure(IllegalStateException(WalletCatalog.ADD_CURRENCY_FIRST))
        val body = buildJsonObject {
            put("sourceAmount", sourceAmount)
            put("walletId", walletId)
        }
        return when (val result = playerCall(parser) { client.usdtQuote(body) }) {
            is PlayerCallResult.Ok -> {
                val quoteId = result.body.str("quoteId")
                if (quoteId.isBlank()) Result.failure(IllegalStateException(WalletMessages.QUOTE_FAILED))
                else Result.success(formatQuote(result.body))
            }
            is PlayerCallResult.Rejected -> Result.failure(IllegalStateException(WalletMessages.of(result.code, result.transport)))
        }
    }

    private fun mapWithdrawals(body: JsonObject): List<WithdrawalUiModel> {
        val data = body.obj("data") ?: body
        val rows = data["rows"] as? JsonArray ?: return emptyList()
        return rows.mapNotNull { element -> (element as? JsonObject)?.let(::mapWithdrawal) }
    }

    private fun mapDestinations(body: JsonObject): List<PayoutDestinationUiModel> {
        val data = body.obj("data") ?: body
        val rows = data["rows"] as? JsonArray ?: return emptyList()
        return rows.mapNotNull { element ->
            val raw = element as? JsonObject ?: return@mapNotNull null
            val id = raw.str("id")
            if (id.isBlank()) return@mapNotNull null
            PayoutDestinationUiModel(id = id, city = raw.str("city"), label = raw.str("label"))
        }
    }

    private fun mapTargets(body: JsonObject): List<UsdtQuoteTarget> {
        val rows = body["targets"] as? JsonArray ?: return emptyList()
        return rows.mapNotNull { element ->
            val raw = element as? JsonObject ?: return@mapNotNull null
            if (raw.bool("enabled") == false) return@mapNotNull null
            val walletId = raw.str("walletId", "wallet_id")
            val rate = raw.num("rate")
            if (walletId.isBlank() || rate == null || !rate.isFinite() || rate <= 0.0) return@mapNotNull null
            UsdtQuoteTarget(walletId = walletId, currency = raw.str("currency"), rate = rate)
        }
    }

    private fun errorOf(result: PlayerCallResult, fallback: String): String = when (result) {
        is PlayerCallResult.Ok -> ""
        is PlayerCallResult.Rejected -> WalletMessages.of(result.code, result.transport).ifBlank { fallback }
    }
}

internal fun mapWithdrawal(raw: JsonObject): WithdrawalUiModel? {
    val id = raw.str("id")
    if (id.isBlank()) return null
    val status = WithdrawalStatus.entries.firstOrNull { it.id == raw.str("status") } ?: WithdrawalStatus.PENDING
    return WithdrawalUiModel(
        id = id,
        method = raw.str("method"),
        methodLabel = raw.str("method_label", "methodLabel"),
        amount = raw.num("amount") ?: 0.0,
        status = status,
        createdAt = raw.str("created_at", "createdAt", "requested_at"),
        pinCode = raw.str("pin_code", "pinCode", "code").ifBlank { null },
        city = raw.str("cash_pickup_city", "city").ifBlank { null },
        point = raw.str("cash_pickup_point", "point").ifBlank { null },
        playerNoticeCode = raw.str("player_notice_code", "playerNoticeCode").ifBlank { null },
        rejectionReason = raw.str("rejection_reason", "rejectionReason").ifBlank { null },
    )
}

private fun formatQuote(body: JsonObject): String {
    val source = body.str("sourceAmount")
    val credit = body.str("creditAmount")
    val currency = body.str("targetCurrencyCode")
    val rate = body.str("rateSnapshot")
    return "Котировка ${source.ifBlank { "USDT" }} USDT → $credit $currency, курс $rate. Платёж не создан."
}

object WalletMessages {
    const val CREATE_FAILED = "Ошибка при создании заявки"
    const val QUOTE_FAILED = "Не удалось получить котировку"

    fun of(code: String, transport: String?): String {
        if (!transport.isNullOrBlank()) return transport
        if (isSessionCode(code)) return "Требуется вход в аккаунт"
        return when (code) {
            "AMOUNT_NOT_POSITIVE", "AMOUNT_SCALE_INVALID", "USDT_AMOUNT_INVALID" -> WalletCatalog.INVALID_AMOUNT
            "CASH_WITHDRAWAL_BELOW_MIN" -> "Минимальная сумма вывода — ${WalletCatalog.minCashLabel()} TMTM"
            "INSUFFICIENT_AVAILABLE_BALANCE" -> WalletCatalog.INSUFFICIENT
            "CASH_PICKUP_REQUIRED", "PAYOUT_DESTINATION_REQUIRED" -> WalletCatalog.SELECT_CITY_POINT
            "PAYOUT_DESTINATION_NOT_FOUND", "PAYOUT_DESTINATION_NOT_ACTIVE" -> "Выбранная касса недоступна"
            "DESTINATION_REQUIRED" -> WalletCatalog.FILL_DETAILS
            "OPERATIONAL_ACCOUNT_NOT_ACTIVE" -> "Вывод через кассу временно недоступен."
            "IDEMPOTENCY_KEY_CONFLICT" -> "Повтор запроса с другими данными отклонён"
            "CARD_WITHDRAWAL_PROVIDER_REQUIRED" -> "Вывод на карту временно недоступен"
            "WALLET_NOT_OWNED", "WALLET_UNAVAILABLE" -> "Кошелёк недоступен"
            else -> if (code.isBlank()) CREATE_FAILED else CREATE_FAILED
        }
    }
}

internal fun withdrawalAmount(raw: String): Double? {
    val value = raw.replace(',', '.').toDoubleOrNull() ?: return null
    if (!value.isFinite() || value <= 0.0) return null
    val cents = value * 100
    if (kotlin.math.abs(cents - kotlin.math.round(cents)) > 1e-6) return null
    return String.format(Locale.US, "%.2f", value).toDouble()
}
