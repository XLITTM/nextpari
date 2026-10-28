package com.nextpari.app.feature.games

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.network.ApiErrorMapper
import com.nextpari.app.core.network.userMessage
import com.nextpari.app.core.player.formatServerBalance
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

data class GameSpec(
    val code: String,
    val minStake: Double,
    val defaultStake: String,
    val maxStake: Double? = null,
    val actions: Set<String> = emptySet(),
)

object GameSpecs {
    val blackjack = GameSpec("blackjack", 6.0, "6", actions = setOf("hit", "stand"))
    val aviator = GameSpec("aviator", 1.0, "10", actions = setOf("cashout"))
    val apples = GameSpec("apples", 1.0, "10", actions = setOf("pick", "cashout"))
    val crystal = GameSpec("crystal", 6.0, "6")
    val dice = GameSpec("dice", 6.0, "12")
    val pharaoh = GameSpec("pharaoh", 6.0, "10", maxStake = 2293.67)

    fun forCode(code: String): GameSpec = when (code) {
        blackjack.code -> blackjack
        aviator.code -> aviator
        apples.code -> apples
        crystal.code -> crystal
        dice.code -> dice
        pharaoh.code -> pharaoh
        else -> GameSpec(code, 1.0, "10")
    }
}

data class ActiveWalletReading(
    val walletId: String = "",
    val amount: Double? = null,
    val currency: String = "",
) {
    val verified: Boolean get() = amount != null && amount.isFinite() && amount >= 0.0 && currency.isNotBlank()
}

data class GameUiState(
    val busy: Boolean = false,
    val blocked: Boolean = false,
    val error: String? = null,
    val stakeText: String,
    val balanceLabel: String = "—",
    val currency: String = "",
    val available: Double? = null,
    val balanceVerified: Boolean = false,
    val round: PlayerGameRound? = null,
    val sessionNote: String? = null,
)

class GamePlayViewModel(
    val spec: GameSpec,
    private val games: GameRepository,
    private val readWallet: () -> ActiveWalletReading,
    private val applyBalance: (Double, String) -> Boolean,
) : ViewModel() {
    private val ui = MutableStateFlow(GameUiState(stakeText = spec.defaultStake))
    val uiState = ui.asStateFlow()
    private var startKey: String? = null
    private var actionKey: String? = null
    private var generation = 0

    fun syncBalance() {
        val wallet = readWallet()
        ui.value = ui.value.copy(
            available = if (wallet.verified) wallet.amount else null,
            currency = wallet.currency,
            balanceVerified = wallet.verified,
            balanceLabel = if (wallet.verified) "${formatServerBalance(wallet.amount!!)} ${wallet.currency}" else "—",
        )
    }

    fun setStake(value: String) {
        if (ui.value.busy || ui.value.round?.state == "open") return
        ui.value = ui.value.copy(stakeText = value, error = null)
    }

    fun play(options: Map<String, String> = emptyMap()) {
        val current = ui.value
        if (current.busy || current.blocked || current.round?.state == "open") return
        val stake = parseStake(current.stakeText)
        val problem = stakeProblem(stake)
        if (problem != null) {
            ui.value = current.copy(error = problem)
            return
        }
        val wallet = readWallet()
        if (!wallet.verified) {
            ui.value = current.copy(error = "Баланс не подтверждён", balanceVerified = false, available = null, balanceLabel = "—")
            return
        }
        val key = startKey ?: newGameIdempotencyKey().also { startKey = it }
        val gen = ++generation
        viewModelScope.launch {
            ui.value = ui.value.copy(busy = true, error = null)
            try {
                val round = games.startGame(spec.code, stake, key, options)
                if (gen != generation) return@launch
                startKey = null
                accept(round, wallet, started = true)
            } catch (error: Exception) {
                if (gen == generation) fail(error)
            }
        }
    }

    fun act(action: String, options: Map<String, String> = emptyMap()) {
        val round = ui.value.round
        if (ui.value.busy || ui.value.blocked || round == null || round.state != "open") return
        if (action !in spec.actions || action !in round.allowedActions) return
        val wallet = readWallet()
        if (!wallet.verified) return
        val key = actionKey ?: newGameIdempotencyKey().also { actionKey = it }
        val gen = ++generation
        viewModelScope.launch {
            ui.value = ui.value.copy(busy = true, error = null)
            try {
                val next = games.gameAction(round.roundId, action, key, options)
                if (gen != generation) return@launch
                actionKey = null
                accept(next, wallet, started = false)
            } catch (error: Exception) {
                if (gen == generation) fail(error)
            }
        }
    }

    fun refreshAviator() {
        val round = ui.value.round ?: return
        if (spec.code != GameSpecs.aviator.code || round.state != "open" || ui.value.busy) return
        val wallet = readWallet()
        val gen = ++generation
        viewModelScope.launch {
            val session = runCatching { games.getAviatorSession() }.getOrNull()
            val fresh = runCatching { games.getGameRound(round.roundId) }.getOrNull()
            if (gen != generation) return@launch
            if (fresh != null && wallet.verified) accept(fresh, wallet, started = false)
            val note = aviatorSessionNote(session)
            if (note != null && ui.value.round?.state == "open") {
                ui.value = ui.value.copy(sessionNote = note)
            }
        }
    }

    private fun accept(round: PlayerGameRound, stamp: ActiveWalletReading, started: Boolean) {
        val now = readWallet()
        val staleWallet = stamp.walletId.isNotBlank() && now.walletId != stamp.walletId
        val foreignRound = round.walletId.isNotBlank() && stamp.walletId.isNotBlank() && round.walletId != stamp.walletId
        val foreignCurrency = round.currency.isNotBlank() && !sameCurrency(round.currency, stamp.currency)
        if (staleWallet || foreignRound || foreignCurrency || !stamp.verified) {
            ui.value = ui.value.copy(
                busy = false,
                blocked = true,
                balanceVerified = false,
                available = null,
                balanceLabel = "—",
                round = round,
                error = "Ответ относится к другому кошельку. Ставки отключены.",
            )
            return
        }
        val expected = if (round.isDuplicate) {
            round.balanceAfter
        } else if (started) {
            expectedBalanceAfterStart(stamp.amount!!, round)
        } else {
            expectedBalanceAfterAction(stamp.amount!!, round)
        }
        if (expected == null || !balancesMatch(round.balanceAfter, expected)) {
            ui.value = ui.value.copy(
                busy = false,
                blocked = true,
                balanceVerified = false,
                available = null,
                balanceLabel = "—",
                round = round,
                error = "Баланс ответа не сходится со ставкой. Ставки отключены.",
            )
            return
        }
        val applied = applyBalance(round.balanceAfter, stamp.walletId)
        val shown = readWallet()
        val trusted = applied && shown.verified && shown.walletId == stamp.walletId
        ui.value = ui.value.copy(
            busy = false,
            blocked = ui.value.blocked || !trusted,
            error = if (trusted) null else "Баланс не подтверждён. Ставки отключены.",
            round = round,
            available = if (trusted) shown.amount else null,
            currency = if (trusted) shown.currency else stamp.currency,
            balanceVerified = trusted,
            balanceLabel = if (trusted) "${formatServerBalance(shown.amount!!)} ${shown.currency}" else "—",
            sessionNote = if (round.state == "open") ui.value.sessionNote else null,
        )
    }

    private fun fail(error: Exception) {
        val code = (error as? PlayerGameException)?.code.orEmpty()
        val blocked = code == "GAME_DISABLED" || code == "GAME_MAINTENANCE"
        ui.value = ui.value.copy(
            busy = false,
            blocked = blocked || ui.value.blocked,
            error = gameErrorMessage(error),
        )
    }

    private fun stakeProblem(stake: Double): String? {
        if (stake <= 0.0) return "Введите ставку"
        if (stake < spec.minStake) return "Минимум ${formatServerBalance(spec.minStake)}"
        val max = spec.maxStake
        if (max != null && stake > max) return "Максимальная ставка — ${formatServerBalance(max)}"
        val wallet = readWallet()
        if (!wallet.verified) return "Баланс не подтверждён"
        if (stake > wallet.amount!!) return "Недостаточно средств"
        return null
    }

    companion object {
        fun factory(gameCode: String): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val games = checkNotNull(AppGraph.gameRepository)
                val store = AppGraph.playerStateStore
                return GamePlayViewModel(
                    spec = GameSpecs.forCode(gameCode),
                    games = games,
                    readWallet = { activeWalletReading(store) },
                    applyBalance = { amount, walletId -> AppGraph.applyServerBalance(amount, walletId) },
                ) as T
            }
        }
    }
}

internal fun activeWalletReading(store: com.nextpari.app.core.player.PlayerStateStore): ActiveWalletReading {
    val me = store.me()
    val active = store.wallets().firstOrNull { it.isActive }
    val currency = active?.currency?.takeIf { it.isNotBlank() } ?: me?.wallet?.currency.orEmpty()
    val amount = me?.wallet?.balance?.takeIf { it.isFinite() && it >= 0.0 }
    return ActiveWalletReading(
        walletId = active?.walletId.orEmpty(),
        amount = if (me == null || currency.isBlank()) null else amount,
        currency = currency,
    )
}

internal fun expectedBalanceAfterStart(before: Double, round: PlayerGameRound): Double? {
    val stake = if (round.totalStake > 0.0) round.totalStake else round.stake
    if (stake <= 0.0 || !stake.isFinite() || !round.payout.isFinite()) return null
    return when (round.state) {
        "open" -> before - stake
        "settled" -> before - stake + round.payout
        else -> null
    }
}

internal fun expectedBalanceAfterAction(before: Double, round: PlayerGameRound): Double? {
    if (!round.payout.isFinite()) return null
    return when (round.state) {
        "open" -> before
        "settled" -> before + round.payout
        else -> null
    }
}

internal fun balancesMatch(actual: Double, expected: Double): Boolean =
    actual.isFinite() && expected.isFinite() && kotlin.math.abs(actual - expected) < 0.02

internal fun sameCurrency(left: String, right: String): Boolean {
    fun norm(value: String) = value.trim().uppercase().removeSuffix("M").ifBlank { value.trim().uppercase() }
    return norm(left) == norm(right)
}

internal fun parseStake(raw: String): Double {
    val value = raw.trim().replace(',', '.').toDoubleOrNull() ?: return 0.0
    if (!value.isFinite()) return 0.0
    return kotlin.math.round(value * 100.0) / 100.0
}

internal fun gameErrorMessage(error: Exception): String {
    val code = (error as? PlayerGameException)?.code
    return when (code) {
        "INSUFFICIENT_AVAILABLE_BALANCE" -> "Недостаточно средств"
        "GAME_DISABLED" -> "Игра временно недоступна"
        "GAME_MAINTENANCE" -> "Игра на обслуживании"
        "BETTING_WINDOW_CLOSED" -> "Окно ставок закрыто"
        "GAME_ROUND_NOT_OPEN" -> "Раунд уже завершён"
        null -> ApiErrorMapper.fromThrowable(error).userMessage()
        else -> "Не удалось выполнить действие"
    }
}

private val resultJson = Json { ignoreUnknownKeys = true }

internal fun describeRound(gameCode: String, round: PlayerGameRound): String {
    val result = round.publicResult
    val lines = when (gameCode) {
        "blackjack" -> listOf(
            labeled("Ваши карты", cards(result["playerHand"])),
            labeled("Дилер", cards(result["dealerHand"])),
            labeled("Результат", result["result"]),
        )
        "apples" -> listOf(
            labeled("Уровень", result["activeLevel"]),
            labeled("К выплате", result["cashoutValue"]),
            labeled("Фаза", result["phase"]),
        )
        "aviator" -> listOf(
            labeled("Множитель", result["currentMultiplier"]),
            labeled("Фаза", result["phase"]),
            labeled("Кэш-аут", result["cashedAt"]),
            labeled("Крушение", result["crashPoint"]),
            labeled("Исход", result["outcome"]),
        )
        "dice" -> listOf(
            labeled("Ваши кости", numbers(result["playerDice"])),
            labeled("Соперник", numbers(result["rivalDice"])),
            labeled("Исход", result["outcome"]),
        )
        "crystal" -> listOf(
            labeled("Шаги", arraySize(result["steps"])),
            labeled("Исход", result["outcome"] ?: result["result"]),
        )
        "pharaoh" -> listOf(
            labeled("Приз", prize(result["prize"])),
            labeled("Плитки", arraySize(result["tiles"])),
            labeled("Исход", result["outcome"] ?: result["result"]),
        )
        else -> emptyList()
    }
    return (lines + listOf(
        "Выплата: ${formatServerBalance(round.payout)}",
        "Баланс: ${formatServerBalance(round.balanceAfter)}",
    )).filter { it.substringAfter(": ").isNotBlank() }.joinToString("\n")
}

internal fun appleColumns(round: PlayerGameRound): Int {
    val rows = jsonArray(round.publicResult["rows"]) ?: return 5
    val level = round.publicResult["activeLevel"]?.toIntOrNull() ?: 1
    val row = rows.mapNotNull { it as? JsonObject }.firstOrNull { element ->
        element.primitive("level")?.toIntOrNull() == level
    } ?: rows.firstOrNull() as? JsonObject
    val cells = row?.get("cells") as? JsonArray
    return (cells?.size ?: 5).coerceIn(1, 8)
}

private fun aviatorSessionNote(session: Map<String, String>?): String? {
    if (session.isNullOrEmpty()) return null
    val phase = session["phase"]?.trim('"').orEmpty()
    val multiplier = session["currentMultiplier"]?.trim('"').orEmpty()
    val crash = session["crashPoint"]?.trim('"').orEmpty()
    return listOf(
        labeled("Сессия", phase),
        labeled("Множитель", multiplier),
        labeled("Крушение", crash),
    ).filter { it.substringAfter(": ").isNotBlank() }.joinToString("\n").ifBlank { null }
}

private fun labeled(label: String, value: String?): String =
    if (value.isNullOrBlank() || value == "null") "" else "$label: $value"

private fun numbers(raw: String?): String {
    val array = jsonArray(raw) ?: return ""
    return array.mapNotNull { it.jsonPrimitive.contentOrNull }.joinToString(" + ")
}

private fun cards(raw: String?): String {
    val array = jsonArray(raw) ?: return ""
    return array.mapNotNull { element ->
        val card = element as? JsonObject ?: return@mapNotNull null
        if (card.primitive("isHidden") == "true") return@mapNotNull "??"
        val rank = card.primitive("rank").orEmpty()
        val suit = card.primitive("suit").orEmpty()
        if (rank.isBlank()) null else rank + suit
    }.joinToString(" ")
}

private fun prize(raw: String?): String {
    if (raw.isNullOrBlank()) return ""
    val obj = runCatching { resultJson.parseToJsonElement(raw) as? JsonObject }.getOrNull()
    return obj?.primitive("id") ?: raw
}

private fun arraySize(raw: String?): String {
    val size = jsonArray(raw)?.size ?: return ""
    return size.toString()
}

private fun jsonArray(raw: String?): JsonArray? {
    if (raw.isNullOrBlank() || !raw.trimStart().startsWith("[")) return null
    return runCatching { resultJson.parseToJsonElement(raw) as? JsonArray }.getOrNull()
}

private fun JsonObject.primitive(key: String): String? =
    (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull
