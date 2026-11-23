package com.nextpari.app.feature.express

import com.nextpari.app.feature.sportsbook.SportsBetSelection
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class ExpressSelection(
    val id: String,
    val sortOrder: Int,
    val canonicalEventId: String,
    val provider: String,
    val feedType: String,
    val fixtureId: String,
    val marketId: String,
    val marketKey: String,
    val selectionId: String,
    val outcomeId: String,
    val line: String,
    val oddsSnapshot: Double,
    val oddsSnapshotAt: String,
    val matchLabel: String,
    val league: String,
    val outcomeName: String,
) {
    fun toSportsSelection(): SportsBetSelection = SportsBetSelection(
        fixtureId = fixtureId,
        feedType = feedType,
        marketId = marketId,
        marketKey = marketKey,
        line = line,
        outcomeId = outcomeId,
        price = oddsSnapshot,
        matchLabel = matchLabel,
        league = league,
        outcomeName = outcomeName,
        provider = provider,
        sourceSelectionId = selectionId,
        updatedAt = oddsSnapshotAt,
    )
}

@Serializable
data class ExpressOfDay(
    val id: String,
    val title: String,
    val description: String,
    val status: String,
    val publishedAt: String? = null,
    val expiresAt: String? = null,
    val combinedOdds: Double? = null,
    val oddsComputedAt: String? = null,
    val selections: List<ExpressSelection> = emptyList(),
)

data class ExpressCouponResult(
    val added: List<SportsBetSelection>,
    val message: String?,
)

fun parseExpressList(body: JsonObject): List<ExpressOfDay> {
  val data = body["data"] ?: return emptyList()
  return when (data) {
    is JsonArray -> data.mapNotNull { parseExpress(it) }
    is JsonObject -> listOfNotNull(parseExpress(data))
    else -> emptyList()
  }
}

fun parseExpress(element: JsonElement): ExpressOfDay? {
  val rec = element as? JsonObject ?: return null
  val id = rec.str("id") ?: return null
  return ExpressOfDay(
    id = id,
    title = rec.str("title").orEmpty(),
    description = rec.str("description").orEmpty(),
    status = rec.str("status").orEmpty(),
    publishedAt = rec.str("publishedAt"),
    expiresAt = rec.str("expiresAt"),
    combinedOdds = rec["combinedOdds"]?.jsonPrimitive?.doubleOrNull,
    oddsComputedAt = rec.str("oddsComputedAt"),
    selections = (rec["selections"] as? JsonArray)?.mapIndexedNotNull { index, item ->
      val row = item.jsonObject
      ExpressSelection(
        id = row.str("id") ?: "$id-$index",
        sortOrder = row["sortOrder"]?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: index,
        canonicalEventId = row.str("canonicalEventId").orEmpty(),
        provider = row.str("provider").orEmpty(),
        feedType = row.str("feedType").orEmpty(),
        fixtureId = row.str("fixtureId").orEmpty(),
        marketId = row.str("marketId").orEmpty(),
        marketKey = row.str("marketKey").orEmpty(),
        selectionId = row.str("selectionId").orEmpty(),
        outcomeId = row.str("outcomeId").orEmpty(),
        line = row.str("line").orEmpty(),
        oddsSnapshot = row["oddsSnapshot"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
        oddsSnapshotAt = row.str("oddsSnapshotAt").orEmpty(),
        matchLabel = row.str("matchLabel").orEmpty(),
        league = row.str("league").orEmpty(),
        outcomeName = row.str("outcomeName").orEmpty(),
      )
    }.orEmpty(),
  )
}

private fun JsonObject.str(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
