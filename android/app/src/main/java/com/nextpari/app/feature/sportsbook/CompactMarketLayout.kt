package com.nextpari.app.feature.sportsbook

import java.math.BigDecimal

internal object CompactMarketLayout {
    enum class Kind { Handicap2, Handicap3, Total2, Other }

    fun kind(market: MarketGroup): Kind {
        val family = market.family.orEmpty()
        val name = market.name.lowercase()
        return when {
            family == "european-handicap" || name.contains("европейск") -> Kind.Handicap3
            isTwoWayHandicap(family) || (family.isEmpty() && name.contains("фора") && !name.contains("европейск")) -> Kind.Handicap2
            isTwoWayTotal(family) || (family.isEmpty() && name.contains("тотал")) -> Kind.Total2
            else -> Kind.Other
        }
    }

    fun hideLineColumn(market: MarketGroup): Boolean {
        val kind = kind(market)
        return kind == Kind.Handicap2 || kind == Kind.Total2
    }

    fun showEuropeanLine(market: MarketGroup): Boolean = kind(market) == Kind.Handicap3

    fun buttonLabel(market: MarketGroup, line: String?, outcome: MarketOutcome): String {
        val rawLine = line ?: outcome.line
        return when (kind(market)) {
            Kind.Handicap2 -> handicapLabel(rawLine, outcome) ?: outcome.label
            Kind.Total2 -> totalLabel(rawLine, outcome) ?: outcome.label
            Kind.Handicap3, Kind.Other -> outcome.label
        }
    }

    fun ordered(market: MarketGroup, outcomes: List<MarketOutcome>): List<MarketOutcome> {
        return when (kind(market)) {
            Kind.Handicap2 -> outcomes.sortedBy { side(it) ?: 9 }
            Kind.Total2 -> outcomes.sortedBy { if (isOver(it)) 0 else if (isUnder(it)) 1 else 9 }
            Kind.Handicap3 -> outcomes.sortedBy { europeanRank(it) }
            Kind.Other -> outcomes
        }
    }

    fun formatLine(raw: String, negate: Boolean = false): String? {
        val value = raw.replace(',', '.').replace("+", "").trim().toBigDecimalOrNull() ?: return null
        val signed = if (negate) value.negate() else value
        val normalized = signed.stripTrailingZeros()
        val plain = if (normalized.compareTo(BigDecimal.ZERO) == 0) "0" else normalized.toPlainString()
        return if (plain == "-0") "0" else plain
    }

    fun handicapLabel(line: String?, outcome: MarketOutcome): String? {
        val side = side(outcome) ?: return null
        val formatted = line?.let { formatLine(it, negate = side == 2) } ?: return null
        return "$side ($formatted)"
    }

    fun totalLabel(line: String?, outcome: MarketOutcome): String? {
        val mark = when {
            isOver(outcome) -> "Б"
            isUnder(outcome) -> "М"
            else -> return null
        }
        val formatted = (line ?: outcome.line)?.let { formatLine(it) } ?: return null
        return "($formatted) $mark"
    }

    fun side(outcome: MarketOutcome): Int? {
        val token = outcome.outcomeId?.lowercase()?.trim().orEmpty()
        val label = outcome.label.lowercase()
        if (token in homeIds || labelLooksHome(label)) return 1
        if (token in awayIds || labelLooksAway(label)) return 2
        return null
    }

    private fun isTwoWayHandicap(family: String): Boolean =
        family.isNotEmpty() &&
            family != "european-handicap" &&
            !family.contains("european") &&
            (family == "handicap" || family == "asian-handicap" || family.contains("handicap"))

    private fun isTwoWayTotal(family: String): Boolean =
        family == "totals" || family == "asian-totals" || family == "team-totals" ||
            family == "asian-team-totals" || family.contains("totals")

    private fun isOver(outcome: MarketOutcome): Boolean {
        val token = outcome.outcomeId?.lowercase().orEmpty()
        val label = outcome.label.lowercase()
        return token in overIds || label.contains("тб") || label.contains("больше") ||
            label.startsWith("over") || Regex("""\bб\b""").containsMatchIn(label)
    }

    private fun isUnder(outcome: MarketOutcome): Boolean {
        val token = outcome.outcomeId?.lowercase().orEmpty()
        val label = outcome.label.lowercase()
        return token in underIds || label.contains("тм") || label.contains("меньше") ||
            label.startsWith("under") || Regex("""\bм\b""").containsMatchIn(label)
    }

    private fun europeanRank(outcome: MarketOutcome): Int = when (side(outcome)) {
        1 -> 0
        2 -> 2
        else -> if (outcome.label.equals("X", ignoreCase = true) || outcome.outcomeId.equals("draw", true) ||
            outcome.outcomeId.equals("x", true)
        ) 1 else 9
    }

    private fun labelLooksHome(label: String): Boolean =
        Regex("""^(п1|ф1|к1|1)\b""").containsMatchIn(label) || label.contains("home")

    private fun labelLooksAway(label: String): Boolean =
        Regex("""^(п2|ф2|к2|2)\b""").containsMatchIn(label) || label.contains("away")

    private val homeIds = setOf("home", "1", "п1", "ф1")
    private val awayIds = setOf("away", "2", "п2", "ф2")
    private val overIds = setOf("over", "tb", "тб")
    private val underIds = setOf("under", "tm", "тм")
}
