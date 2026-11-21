package com.nextpari.app.feature.sportsbook

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

data class MatchInsights(
    val statistics: List<Statistic>,
    val timeline: List<Incident>,
    val periodScores: List<PeriodScore>,
    internal val expiresAtElapsedMs: Long,
) {
    @Serializable
    data class Statistic(val key: String, val label: String, val home: Int, val away: Int)

    @Serializable
    data class Incident(val id: String, val text: String)

    @Serializable
    data class PeriodScore(val period: String, val home: Int, val away: Int)

    @Serializable
    private data class Wire(
        val source: String,
        val observedAt: String,
        val statistics: List<Statistic>,
        val timeline: List<Incident>,
        val periodScores: List<PeriodScore>,
        val availability: Availability,
    )

    @Serializable
    private data class Availability(val statistics: String, val timeline: String)

    companion object {
        private val json = Json { ignoreUnknownKeys = true }
        private const val MAX_AGE_MS = 90_000L

        internal fun fromWire(raw: JsonElement?, receivedAt: Long, elapsed: Long): MatchInsights? {
            val data = raw?.let { runCatching { json.decodeFromJsonElement(Wire.serializer(), it) }.getOrNull() } ?: return null
            if (data.source != "betsapi") return null
            val observed = runCatching { Instant.parse(data.observedAt).toEpochMilli() }.getOrNull() ?: return null
            val age = (receivedAt - observed).takeIf { it in -5_000 until MAX_AGE_MS } ?: return null
            return MatchInsights(
                statistics = if (data.availability.statistics == "available") data.statistics.filter {
                    it.key.isNotBlank() && it.label.isNotBlank() && it.home >= 0 && it.away >= 0
                }.distinctBy(Statistic::key) else emptyList(),
                timeline = if (data.availability.timeline == "available") data.timeline.filter {
                    it.id.isNotBlank() && it.text.isNotBlank() && it.text.length <= 180
                }.distinctBy(Incident::id).take(40) else emptyList(),
                periodScores = data.periodScores.filter {
                    it.period in setOf("1", "2", "3", "4") && it.home >= 0 && it.away >= 0
                }.distinctBy(PeriodScore::period).sortedBy(PeriodScore::period),
                expiresAtElapsedMs = elapsed + MAX_AGE_MS - age.coerceAtLeast(0),
            )
        }
    }
}
