package com.nextpari.app.debug

import com.nextpari.app.feature.games.GameSpecs
import com.nextpari.app.feature.games.GameUiState
import com.nextpari.app.feature.games.PlayerGameRound

/**
 * Debug-only mock rounds for layout checks. These objects are never sent to the server.
 */
internal fun previewState(code: String, fixture: String): GameUiState {
    val spec = GameSpecs.forCode(code)
    if (fixture == "funds") {
        return GameUiState(
            stakeText = spec.defaultStake,
            balanceLabel = "0 TMT",
            currency = "TMT",
            available = 0.0,
            balanceVerified = true,
            error = "Недостаточно средств",
        )
    }
    if (fixture == "maintenance") {
        return GameUiState(
            stakeText = spec.defaultStake,
            balanceLabel = "20 TMT",
            currency = "TMT",
            available = 20.0,
            balanceVerified = true,
            blocked = true,
            error = "Игра на обслуживании",
        )
    }
    if (fixture == "idle") {
        return GameUiState(
            stakeText = spec.defaultStake,
            balanceLabel = "40 TMT",
            currency = "TMT",
            available = 40.0,
            balanceVerified = true,
        )
    }
    val statefulOpen = fixture != "loss" && code in setOf("blackjack", "apples", "aviator")
    return GameUiState(
        stakeText = spec.defaultStake,
        balanceLabel = "40 TMT",
        currency = "TMT",
        available = 40.0,
        balanceVerified = true,
        round = previewRound(code, fixture, statefulOpen),
        sessionNote = if (code == "aviator" && fixture != "loss") "Сессия: flying\nМножитель: 2.40" else null,
    )
}

private fun previewRound(code: String, fixture: String, statefulOpen: Boolean): PlayerGameRound {
    val loss = fixture == "loss"
    val result = when (code) {
        "blackjack" -> mapOf(
            "playerHand" to """[{"rank":"A","suit":"♠"},{"rank":"K","suit":"♥"}]""",
            "dealerHand" to if (statefulOpen) """[{"rank":"10","suit":"♦"},{"rank":"7","suit":"♣","isHidden":true}]""" else """[{"rank":"10","suit":"♦"},{"rank":"9","suit":"♣"}]""",
            "result" to if (loss) "lose" else if (statefulOpen) "" else "blackjack",
        )
        "apples" -> mapOf(
            "phase" to if (loss) "lost" else "playing",
            "activeLevel" to "3",
            "cashoutValue" to if (loss) "0" else "1.93",
            "rows" to appleRows(loss),
        )
        "aviator" -> mapOf(
            "phase" to if (loss) "crashed" else "flying",
            "currentMultiplier" to if (loss) "1.84" else "2.40",
            "crashPoint" to if (loss) "1.84" else "",
            "outcome" to if (loss) "crash" else "",
        )
        "crystal" -> mapOf(
            "outcome" to if (loss) "lose" else "win",
            "startBoard" to crystalBoard(),
            "steps" to """[{"board":${crystalBoard()},"exploding":[${List(49) { index -> index < 5 }.joinToString()}]}]""",
        )
        "dice" -> mapOf(
            "playerDice" to if (loss) "[2,1]" else "[6,5]",
            "rivalDice" to if (loss) "[6,6]" else "[1,2]",
            "outcome" to if (loss) "lose" else "win",
        )
        else -> mapOf(
            "prize" to """{"id":"${if (loss) "sistrum" else "ankh"}"}""",
            "tiles" to """[{"id":"lotus"},{"id":"pyramid"},{"id":"ring"},{"id":"ankh"},{"id":"harp"},{"id":"scroll"}]""",
            "outcome" to if (loss) "lose" else "win",
        )
    }
    return PlayerGameRound(
        ok = true,
        isDuplicate = false,
        roundId = "preview",
        gameCode = code,
        state = if (statefulOpen) "open" else "settled",
        stake = 10.0,
        totalStake = 10.0,
        payout = if (loss || statefulOpen) 0.0 else 24.0,
        balanceAfter = 40.0,
        serverSeedHash = "",
        serverSeed = null,
        nonce = 0,
        sessionId = null,
        mathVersion = null,
        publicResult = result.filterValues { it.isNotBlank() },
        allowedActions = when {
            !statefulOpen -> emptyList()
            code == "blackjack" -> listOf("hit", "stand")
            code == "apples" && !loss -> listOf("pick", "cashout")
            code == "aviator" && !loss -> listOf("cashout")
            else -> emptyList()
        },
        createdAt = null,
        settledAt = null,
    )
}

private fun appleRows(loss: Boolean): String {
    val levels = listOf("1.23", "1.54", "1.93", "2.41", "4.02", "6.71", "11.18", "27.92", "69.80", "349")
    return levels.mapIndexed { index, multiplier ->
        val cells = (0 until 5).joinToString(",") { column ->
            val revealed = index < 2 || (loss && index == 2 && column == 0)
            val kind = if (loss && index == 2 && column == 0) "bad" else "good"
            """{"kind":"$kind","revealed":$revealed,"picked":$revealed}"""
        }
        """{"level":${index + 1},"multiplier":"$multiplier","cells":[$cells]}"""
    }.joinToString(prefix = "[", postfix = "]")
}

private fun crystalBoard(): String {
    val kinds = listOf("green", "cyan", "red", "blue", "purple", "orange", "coin")
    return (0 until 49).joinToString(prefix = "[", postfix = "]") { index ->
        """{"id":"c$index","kind":"${kinds[index % kinds.size]}"}"""
    }
}
