package com.nextpari.app.feature.history

import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.PlayerCallResult
import com.nextpari.app.core.network.playerCall
import com.nextpari.app.core.player.str
import com.nextpari.app.feature.account.AccountMessages
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

data class HistoryBetRow(
    val id: String,
    val title: String,
    val status: String = "",
    val stake: String = "",
    val currency: String = "",
    val odds: String = "",
)

interface HistoryRepository {
    suspend fun loadBets(): Result<List<HistoryBetRow>>
}

class FakeHistoryRepository : HistoryRepository {
    override suspend fun loadBets(): Result<List<HistoryBetRow>> = Result.success(emptyList())
}

class RemoteHistoryRepository(
    private val api: PlayerApi,
    private val json: Json,
    private val hasSession: () -> Boolean,
) : HistoryRepository {
    override suspend fun loadBets(): Result<List<HistoryBetRow>> {
        if (!hasSession()) return Result.success(emptyList())
        return when (val result = playerCall(json) { api.sportsBets() }) {
            is PlayerCallResult.Ok -> Result.success(mapBets(result.body))
            is PlayerCallResult.Rejected -> Result.failure(IllegalStateException(AccountMessages.of(result.code, result.transport)))
        }
    }

    private fun mapBets(body: JsonObject): List<HistoryBetRow> {
        val rows = body["bets"] as? JsonArray ?: return emptyList()
        return rows.mapNotNull { element ->
            val raw = element as? JsonObject ?: return@mapNotNull null
            val id = raw.str("betId", "id")
            if (id.isBlank()) return@mapNotNull null
            val legs = raw["legs"] as? JsonArray
            val first = legs?.firstOrNull() as? JsonObject
            val title = first?.str("fixtureLabel", "outcomeName").orEmpty().ifBlank { "Ставка $id" }
            val settlement = raw.str("settlementState")
            val status = raw.str("status")
            HistoryBetRow(
                id = id,
                title = title,
                status = if (settlement.isBlank()) status else "$status · $settlement",
                stake = raw.str("stake"),
                currency = raw.str("currency"),
                odds = raw.str("acceptedOdds"),
            )
        }
    }
}
