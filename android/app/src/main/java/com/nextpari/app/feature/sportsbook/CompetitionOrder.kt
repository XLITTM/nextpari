package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.MatchCardModel

/** Only explicit canonical ids may activate these priorities. Labels are never identity. */
object CompetitionOrder {
    private val priorities = mapOf(
        "football" to listOf("football:int:uefa-champions-league","football:int:uefa-europa-league","football:int:uefa-conference-league",
            "football:eng:premier-league","football:esp:la-liga","football:ita:serie-a","football:ger:bundesliga","football:fra:ligue-1",
            "football:por:primeira-liga","football:ned:eredivisie","football:tur:super-lig","football:bra:serie-a","football:arg:primera-division","football:usa:mls"),
        "basketball" to listOf("basketball:usa:nba","basketball:int:euroleague","basketball:int:eurocup","basketball:usa:ncaa","basketball:int:fiba-world-cup","basketball:int:eurobasket"),
        "tennis" to listOf("tennis:aus:australian-open","tennis:fra:roland-garros","tennis:eng:wimbledon","tennis:usa:us-open","tennis:int:atp-masters","tennis:int:wta-1000","tennis:int:atp-500","tennis:int:wta-500","tennis:int:atp-250","tennis:int:wta-250","tennis:int:challenger","tennis:int:itf"),
        "hockey" to listOf("hockey:usa:nhl","hockey:int:khl","hockey:int:iihf-world-championship","hockey:int:champions-hockey-league"),
        "volleyball" to listOf("volleyball:int:nations-league","volleyball:int:world-championship","volleyball:int:cev-champions-league"),
        "table-tennis" to listOf("table-tennis:int:wtt","table-tennis:int:ittf-world-championship"),
        "esports" to listOf("esports:cs2:major","esports:dota2:the-international","esports:lol:worlds","esports:valorant:champions"),
    )
    fun rank(sport: String, canonicalId: String?): Int = canonicalId?.let { priorities[sport]?.indexOf(it)?.takeIf { rank -> rank >= 0 } } ?: Int.MAX_VALUE
    fun top(groups: List<CountryGroup>): List<LeagueRow> = groups.flatMap { it.leagues }.filter { it.rank != Int.MAX_VALUE }.sortedBy { it.rank }
    fun leagueKey(match: MatchCardModel): String = when {
        !match.competitionId.isNullOrBlank() -> "canonical:${match.sport}:${match.competitionId}"
        !match.providerCompetitionId.isNullOrBlank() -> "source:${match.provider}:${match.sport}:${match.providerCompetitionId}"
        else -> "display|${match.sport}|${match.country}|${match.league}"
    }
    fun matchesSport(match: MatchCardModel, sport: String): Boolean = if(sport.startsWith("esports-")) {
        match.sport=="esports" && match.discipline==sport.removePrefix("esports-")
    } else match.sport==sport
}
