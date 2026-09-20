package com.nextpari.app.feature.home

enum class OddsMovement { None, Up, Down }

data class MatchOutcome(
    val key: String,
    val odds: String? = null,
    val locked: Boolean = false,
    val movement: OddsMovement = OddsMovement.None,
)

data class MatchCardModel(
    val id: String,
    val eventId: String = id,
    val sport: String,
    val league: String,
    val country: String,
    val team1: String,
    val team2: String,
    val team1LogoRes: Int? = null,
    val team2LogoRes: Int? = null,
    val isLive: Boolean = false,
    val score: String? = null,
    val period: String? = null,
    val kickoffLabel: String? = null,
    val marketTitle: String? = null,
    val outcomes: List<MatchOutcome> = emptyList(),
    val extraMarkets: Int = 0,
    val isFavorite: Boolean = false,
)

data class ChampionshipRow(
    val id: String,
    val name: String,
    val country: String,
    val count: Int,
    val color: Long,
    val isFavorite: Boolean = false,
)

data class EsportsTournament(
    val tournamentId: String,
    val title: String,
    val game: String,
    val liveMatchCount: Int = 0,
    val iconSport: String = "esports",
    val isFavorite: Boolean = false,
)

object ChampionshipColors {
    val palette = listOf(0xFFEF4444, 0xFF3B82F6, 0xFF10B981, 0xFFF59E0B, 0xFF8B5CF6, 0xFFEC4899, 0xFF06B6D4)

    fun colorFromName(name: String): Long {
        var hash = 0
        for (ch in name) hash = 31 * hash + ch.code
        val index = (hash and Int.MAX_VALUE) % palette.size
        return palette[index]
    }
}

object ChampionshipsMapper {
    fun fromLive(matches: List<MatchCardModel>, excludeEsports: Boolean = false): List<ChampionshipRow> {
        val source = if (excludeEsports) matches.filter { it.sport != "esports" } else matches
        return source
            .groupBy { "${it.country}|${it.league}" }
            .map { (_, group) ->
                val first = group.first()
                ChampionshipRow(
                    id = "${first.country}|${first.league}",
                    name = first.league,
                    country = first.country,
                    count = group.size,
                    color = ChampionshipColors.colorFromName(first.league),
                )
            }
            .sortedByDescending { it.count }
            .take(8)
    }
}

object SportsbookFilters {
    fun matchesForSport(matches: List<MatchCardModel>, sportId: String, excludeEsportsWhenAll: Boolean): List<MatchCardModel> {
        val bySport = if (sportId == "all") matches else matches.filter { it.sport == sportId }
        return if (excludeEsportsWhenAll && sportId == "all") bySport.filter { it.sport != "esports" } else bySport
    }
}

object HomeSectionOrder {
    val top = listOf(
        "sports",
        "promos",
        "live",
        "line",
        "champs",
        "esports-disciplines",
        "esports-live",
        "esports-line",
        "esports-tournaments",
    )
    val sport = listOf("sports", "live", "line", "champs")
    val esports = listOf("esports-disciplines", "esports-live", "esports-line", "esports-tournaments")
    val casino = listOf("casino-entries", "casino-featured", "casino-tournaments", "casino-categories")

    val esportsLabels = listOf("Киберспорт LIVE", "Киберспорт Линия", "Турниры LIVE")
}

object SampleMatchCards {
    /** Preview/debug samples only. Runtime catalogs must stay empty. */
    val previewLive = MatchCardModel(
        id = "preview-live",
        sport = "football",
        league = "Preview League",
        country = "EU",
        team1 = "Alpha",
        team2 = "Beta",
        isLive = true,
        score = "1 : 0",
        period = "45'",
        marketTitle = "1X2",
        outcomes = listOf(
            MatchOutcome("1", "1.90", movement = OddsMovement.Up),
            MatchOutcome("X", "3.40"),
            MatchOutcome("2", "4.10", movement = OddsMovement.Down),
        ),
        extraMarkets = 12,
    )
}
