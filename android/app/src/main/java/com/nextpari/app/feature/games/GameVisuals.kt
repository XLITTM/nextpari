package com.nextpari.app.feature.games

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

data class CardFace(val rank: String, val suit: String, val hidden: Boolean)

data class AppleCellFace(val revealed: Boolean, val kind: String)

data class AppleRowFace(val level: Int, val multiplier: String, val cells: List<AppleCellFace>)

data class CrystalGem(val kind: String, val exploding: Boolean = false)

private val json = Json { ignoreUnknownKeys = true }

private val appleLevels = listOf(
    1 to "1.23", 2 to "1.54", 3 to "1.93", 4 to "2.41", 5 to "4.02",
    6 to "6.71", 7 to "11.18", 8 to "27.92", 9 to "69.80", 10 to "349",
)

private val appleWidths = listOf(5, 5, 5, 5, 5, 5, 5, 5, 5, 5)

fun appleBoard(round: PlayerGameRound?): List<AppleRowFace> {
    val rows = round?.publicResult?.get("rows")?.let(::jsonArray)
    if (rows == null) {
        return appleLevels.mapIndexed { index, (level, multiplier) ->
            AppleRowFace(level, multiplier, List(appleWidths[index]) { AppleCellFace(false, "good") })
        }
    }
    return rows.mapIndexedNotNull { index, element ->
        val row = element as? JsonObject ?: return@mapIndexedNotNull null
        val cells = (row["cells"] as? JsonArray).orEmpty().map { cell ->
            val obj = cell as? JsonObject
            AppleCellFace(
                revealed = obj?.primitive("revealed") == "true",
                kind = obj?.primitive("kind") ?: "good",
            )
        }
        AppleRowFace(
            level = row.primitive("level")?.toIntOrNull() ?: index + 1,
            multiplier = row.primitive("multiplier") ?: appleLevels.getOrNull(index)?.second ?: "",
            cells = cells,
        )
    }
}

fun appleActiveLevel(round: PlayerGameRound?): Int =
    round?.publicResult?.get("activeLevel")?.toIntOrNull() ?: 1

fun applePhase(round: PlayerGameRound?): String = round?.publicResult?.get("phase").orEmpty()

fun appleCashout(round: PlayerGameRound?): String = round?.publicResult?.get("cashoutValue").orEmpty()

fun cardFaces(raw: String?): List<CardFace> {
    val array = raw?.let(::jsonArray) ?: return emptyList()
    return array.mapNotNull { element ->
        val card = element as? JsonObject ?: return@mapNotNull null
        CardFace(
            rank = card.primitive("rank").orEmpty(),
            suit = card.primitive("suit").orEmpty(),
            hidden = card.primitive("isHidden") == "true",
        )
    }
}

fun diceFaces(raw: String?): List<Int> {
    val array = raw?.let(::jsonArray) ?: return emptyList()
    return array.mapNotNull { it.jsonPrimitive.contentOrNull?.toIntOrNull() }.take(2)
}

fun crystalFrames(round: PlayerGameRound?): List<List<CrystalGem>> {
    val result = round?.publicResult ?: return emptyList()
    val frames = mutableListOf<List<CrystalGem>>()
    gemsOf(result["startBoard"]?.let(::jsonArray), emptyList()).takeIf { it.isNotEmpty() }?.let(frames::add)
    val steps = result["steps"]?.let(::jsonArray) ?: return frames
    steps.forEach { element ->
        val step = element as? JsonObject ?: return@forEach
        val board = step["board"]?.let { value ->
            if (value is JsonArray) value else value.toString().let(::jsonArray)
        }
        val exploding = (step["exploding"] as? JsonArray)?.map { flag ->
            flag.jsonPrimitive.contentOrNull == "true"
        }.orEmpty()
        gemsOf(board, exploding).takeIf { it.isNotEmpty() }?.let(frames::add)
    }
    return frames
}

fun crystalGems(round: PlayerGameRound?): List<CrystalGem> = crystalFrames(round).lastOrNull().orEmpty()

private fun gemsOf(source: JsonArray?, exploding: List<Boolean>): List<CrystalGem> {
    if (source == null) return emptyList()
    return source.mapIndexed { index, element ->
        CrystalGem(
            kind = (element as? JsonObject)?.primitive("kind") ?: "green",
            exploding = exploding.getOrNull(index) == true,
        )
    }
}

fun pharaohTiles(round: PlayerGameRound?): List<String> {
    val tiles = round?.publicResult?.get("tiles")?.let(::jsonArray) ?: return emptyList()
    return tiles.map { element ->
        val obj = element as? JsonObject
        obj?.primitive("id") ?: element.jsonPrimitive.contentOrNull.orEmpty()
    }
}

fun pharaohPrize(round: PlayerGameRound?): String {
    val raw = round?.publicResult?.get("prize").orEmpty()
    if (raw.isBlank()) return ""
    val obj = runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull()
    return obj?.primitive("id") ?: raw
}

fun aviatorPhase(round: PlayerGameRound?, session: String?): String {
    val fromSession = session?.lineValue("Сессия")
    return fromSession?.ifBlank { null } ?: round?.publicResult?.get("phase").orEmpty()
}

fun aviatorMultiplier(round: PlayerGameRound?, session: String?): String? {
    val fromSession = session?.lineValue("Множитель")
    val value = fromSession?.ifBlank { null } ?: round?.publicResult?.get("currentMultiplier")
    return value?.takeIf { it.isNotBlank() && it != "null" }
}

fun aviatorCrash(round: PlayerGameRound?, session: String?): String? {
    val fromSession = session?.lineValue("Крушение")
    val value = fromSession?.ifBlank { null } ?: round?.publicResult?.get("crashPoint")
    return value?.takeIf { it.isNotBlank() && it != "null" }
}

fun pharaohName(id: String): String = when (id) {
    "cat" -> "Анубис"
    "scroll" -> "Свиток"
    "nemes" -> "Немес"
    "pyramid" -> "Пирамида"
    "ring" -> "Скарабей"
    "ankh" -> "Анкх"
    "canopic" -> "Канопа"
    "lotus" -> "Лотос"
    "cylinder" -> "Цилиндр"
    "harp" -> "Арфа"
    "sistrum" -> "Систр"
    else -> id
}

private fun String.lineValue(label: String): String? =
    lineSequence().firstOrNull { it.startsWith("$label:") }?.substringAfter(":")?.trim()

private fun jsonArray(raw: String): JsonArray? {
    if (!raw.trimStart().startsWith("[")) return null
    return runCatching { json.parseToJsonElement(raw) as? JsonArray }.getOrNull()
}

private fun JsonObject.primitive(key: String): String? =
    (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull
