package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.MatchCardModel
import java.util.Locale

/** Canonical ids win. A display rule applies only when the feed has no canonical id, and only for an exact country plus league. */
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
    private data class DisplayRule(val sport: String, val countries: Set<String>, val leagues: Set<String>, val canonicalId: String)
    private val displayRules = listOf(
        DisplayRule("football", setOf("international", "europe", "uefa"), setOf("uefa champions league"), "football:int:uefa-champions-league"),
        DisplayRule("football", setOf("international", "europe", "uefa"), setOf("uefa europa league"), "football:int:uefa-europa-league"),
        DisplayRule("football", setOf("international", "europe", "uefa"), setOf("uefa conference league", "uefa europa conference league"), "football:int:uefa-conference-league"),
        DisplayRule("football", setOf("eng", "england"), setOf("premier league"), "football:eng:premier-league"),
        DisplayRule("football", setOf("es", "spain"), setOf("laliga", "la liga"), "football:esp:la-liga"),
        DisplayRule("football", setOf("it", "italy"), setOf("serie a"), "football:ita:serie-a"),
        DisplayRule("football", setOf("de", "germany"), setOf("bundesliga"), "football:ger:bundesliga"),
        DisplayRule("football", setOf("fr", "france"), setOf("ligue 1"), "football:fra:ligue-1"),
        DisplayRule("football", setOf("pt", "portugal"), setOf("primeira liga", "liga portugal"), "football:por:primeira-liga"),
        DisplayRule("football", setOf("nl", "netherlands"), setOf("eredivisie"), "football:ned:eredivisie"),
        DisplayRule("football", setOf("tr", "turkey", "turkiye"), setOf("super lig", "süper lig", "turkish super lig"), "football:tur:super-lig"),
        DisplayRule("football", setOf("br", "brazil"), setOf("serie a", "brasileirao", "brasileirão", "brazilian serie a"), "football:bra:serie-a"),
        DisplayRule("football", setOf("ar", "argentina"), setOf("primera division", "liga profesional", "argentina primera division"), "football:arg:primera-division"),
        DisplayRule("football", setOf("us", "usa", "united states"), setOf("mls", "major league soccer"), "football:usa:mls"),
        DisplayRule("basketball", setOf("us", "usa", "united states"), setOf("nba"), "basketball:usa:nba"),
        DisplayRule("basketball", setOf("international", "europe"), setOf("euroleague", "turkish airlines euroleague"), "basketball:int:euroleague"),
        DisplayRule("basketball", setOf("international", "europe"), setOf("eurocup"), "basketball:int:eurocup"),
        DisplayRule("hockey", setOf("us", "usa", "united states", "international"), setOf("nhl"), "hockey:usa:nhl"),
        DisplayRule("hockey", setOf("russia", "international"), setOf("khl"), "hockey:int:khl"),
        DisplayRule("volleyball", setOf("international", "fivb"), setOf("nations league", "fivb nations league"), "volleyball:int:nations-league"),
        DisplayRule("table-tennis", setOf("international", "wtt", "ittf"), setOf("wtt"), "table-tennis:int:wtt"),
    )

    fun rank(sport: String, canonicalId: String?): Int = canonicalId?.let { priorities[sport]?.indexOf(it)?.takeIf { rank -> rank >= 0 } } ?: Int.MAX_VALUE

    fun rank(match: MatchCardModel): Int {
        if (!match.competitionId.isNullOrBlank()) return rank(match.sport, match.competitionId)
        val country = countryKey(match.country)
        val league = label(match.league)
        val canonical = displayRules.firstOrNull { it.sport == match.sport && league in it.leagues && country in it.countries }?.canonicalId
        return rank(match.sport, canonical)
    }

    fun top(groups: List<CountryGroup>): List<LeagueRow> = groups.flatMap { it.leagues }.filter { it.rank != Int.MAX_VALUE }.sortedBy { it.rank }
    fun leagueKey(match: MatchCardModel): String = when {
        !match.competitionId.isNullOrBlank() -> "canonical:${match.sport}:${match.competitionId}"
        !match.providerCompetitionId.isNullOrBlank() -> "source:${match.provider}:${match.sport}:${match.providerCompetitionId}"
        else -> "display|${match.sport}|${match.country}|${match.league}"
    }
    fun matchesSport(match: MatchCardModel, sport: String): Boolean = if(sport.startsWith("esports-")) {
        match.sport=="esports" && match.discipline==sport.removePrefix("esports-")
    } else match.sport==sport

    private fun label(value: String) = value.trim().replace(Regex("\\s+"), " ").lowercase(Locale.ROOT).replace('ё', 'е')
    private fun countryKey(raw: String): String = SportsRegions.code(raw) ?: label(raw)
}

internal fun canonicalEsportsDiscipline(raw: String?): String? = when (raw?.trim()?.lowercase(Locale.ROOT)) {
    "cs2", "cs 2", "counter-strike 2" -> "cs2"
    "dota2", "dota 2" -> "dota2"
    "lol", "league of legends" -> "lol"
    "valorant" -> "valorant"
    else -> null
}
