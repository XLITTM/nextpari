package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.HomeSport
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.OddsMovement

data class LeagueRow(
    val name: String,
    val country: String,
    val count: Int,
    val favorite: Boolean = false,
)

data class CountryGroup(
    val country: String,
    val count: Int,
    val leagues: List<LeagueRow>,
)

data class SportListRow(
    val id: String,
    val name: String,
    val count: Int,
)

data class MarketTabSpec(
    val id: String,
    val label: String,
)

data class MarketOutcome(
    val eventId: String,
    val marketId: String,
    val marketKey: String,
    val line: String? = null,
    val outcomeId: String? = null,
    val providerBetId: String? = null,
    val label: String,
    val odds: String? = null,
    val locked: Boolean = false,
    val movement: OddsMovement = OddsMovement.None,
)

data class MarketGroup(
    val key: String,
    val name: String,
    val marketId: String,
    val category: String,
    val lineCount: Int,
    val outcomes: List<MarketOutcome>,
)

object LeagueIds {
    fun toLeagueId(country: String, name: String): String {
        val league = name.trim().ifEmpty { "tournament" }
        val region = country.trim()
        return if (region.isEmpty()) league else "$region|$league"
    }

    fun fromLeagueId(leagueId: String): Pair<String, String> {
        val raw = java.net.URLDecoder.decode(leagueId, Charsets.UTF_8.name())
        val sep = raw.indexOf('|')
        if (sep == -1) return "" to (raw.ifEmpty { "Турнир" })
        return raw.substring(0, sep) to (raw.substring(sep + 1).ifEmpty { "Турнир" })
    }
}

object CountryGrouping {
    fun groupByCountry(matches: List<MatchCardModel>): List<CountryGroup> {
        val countries = linkedMapOf<String, MutableCountry>()
        for (match in matches) {
            val country = match.country.trim()
            val name = match.league.trim()
            if (name.isEmpty()) continue
            val countryRow = countries.getOrPut(country) { MutableCountry() }
            countryRow.count += 1
            val league = countryRow.leagues.getOrPut(name) { LeagueRow(name = name, country = country, count = 0) }
            countryRow.leagues[name] = league.copy(count = league.count + 1)
        }
        return countries.map { (country, row) ->
            CountryGroup(
                country = country,
                count = row.count,
                leagues = row.leagues.values.sortedWith(compareByDescending<LeagueRow> { it.count }.thenBy { it.name }),
            )
        }.sortedWith(compareByDescending<CountryGroup> { it.count }.thenBy { it.country })
    }

    fun initialExpanded(groups: List<CountryGroup>): String = groups.firstOrNull()?.country.orEmpty()

    fun nextExpanded(groups: List<CountryGroup>, current: String): String {
        if (groups.any { it.country == current }) return current
        return initialExpanded(groups)
    }

    private class MutableCountry {
        var count: Int = 0
        val leagues = linkedMapOf<String, LeagueRow>()
    }
}

object SportsListCatalog {
    val supported: List<HomeSport> = listOf(
        HomeSport("football", "Футбол"),
        HomeSport("tennis", "Теннис"),
        HomeSport("basketball", "Баскетбол"),
        HomeSport("hockey", "Хоккей"),
        HomeSport("volleyball", "Волейбол"),
        HomeSport("table-tennis", "Настольный теннис"),
        HomeSport("badminton", "Бадминтон"),
        HomeSport("esports", "КиберСпорт"),
        HomeSport("cricket", "Крикет"),
        HomeSport("beach-volleyball", "Пляжный волейбол"),
        HomeSport("snooker", "Снукер"),
        HomeSport("futsal", "Футзал"),
    )

    val featuredIds: List<String> = listOf("football", "tennis", "basketball", "hockey", "esports")

    fun rows(tab: String, live: List<MatchCardModel>, line: List<MatchCardModel>): List<SportListRow> {
        val pool = if (tab == "line") line else live
        return supported
            .filter { sport -> if (tab == "cybers") sport.id == "esports" else true }
            .map { sport -> SportListRow(sport.id, sport.name, pool.count { it.sport == sport.id }) }
            .sortedWith { a, b ->
                val ai = featuredIds.indexOf(a.id)
                val bi = featuredIds.indexOf(b.id)
                when {
                    ai != -1 || bi != -1 -> {
                        if (ai == -1) 1
                        else if (bi == -1) -1
                        else ai - bi
                    }
                    else -> b.count - a.count
                }
            }
            .filter { it.count > 0 || it.id in featuredIds }
    }

    fun sportName(id: String): String = supported.firstOrNull { it.id == id }?.name ?: "Спорт"
}

object MarketTabs {
    val football = listOf(
        MarketTabSpec("all", "Все"),
        MarketTabSpec("main", "Основная игра"),
        MarketTabSpec("totals", "Тоталы"),
        MarketTabSpec("handicaps", "Форы"),
        MarketTabSpec("1st-half", "1-й тайм"),
        MarketTabSpec("2nd-half", "2-й тайм"),
        MarketTabSpec("corners", "Угловые"),
        MarketTabSpec("goals", "Голы"),
    )
    val tennis = listOf(
        MarketTabSpec("all", "Все рынки"),
        MarketTabSpec("main", "Победитель"),
        MarketTabSpec("sets", "Сеты"),
        MarketTabSpec("games", "Геймы"),
    )
    val basketball = listOf(
        MarketTabSpec("all", "Все рынки"),
        MarketTabSpec("main", "Победитель"),
        MarketTabSpec("totals", "Тотал очков"),
        MarketTabSpec("quarters", "Четверти"),
        MarketTabSpec("halves", "Половины"),
    )
    val hockey = listOf(
        MarketTabSpec("all", "Все рынки"),
        MarketTabSpec("main", "Основная игра"),
        MarketTabSpec("totals", "Тоталы"),
        MarketTabSpec("handicaps", "Форы"),
    )
    val esports = listOf(
        MarketTabSpec("all", "Все рынки"),
        MarketTabSpec("main", "Победитель"),
        MarketTabSpec("totals", "Карты / раунды"),
    )

    fun forSport(sport: String): List<MarketTabSpec> = when (sport) {
        "tennis" -> tennis
        "basketball" -> basketball
        "hockey" -> hockey
        "esports" -> esports
        else -> football
    }

    fun matchesTab(market: MarketGroup, tab: String): Boolean {
        val name = market.name.lowercase()
        return when (tab) {
            "all" -> true
            "totals" -> Regex("тотал|under/over|total|exactly").containsMatchIn(name) &&
                !Regex("corner|гол|забьют|точный|goal|btts").containsMatchIn(name)
            "handicaps" -> Regex("фора|handicap").containsMatchIn(name) && !name.contains("corner")
            "goals" -> Regex("голы|забьют|точный счёт|btts|both teams|индивидуальный тотал|team total|next goal|correct score|last team to score").containsMatchIn(name) ||
                market.marketId == "btts"
            "corners" -> market.category == "corners" || Regex("угл|corner").containsMatchIn(name)
            "1st-half" -> (market.category == "half" || Regex("1-й тайм|1st period|1st half|first half").containsMatchIn(name)) &&
                !Regex("2-й|2nd").containsMatchIn(name)
            "2nd-half" -> Regex("2-й тайм|2nd period|2nd half").containsMatchIn(name)
            "sets" -> name.contains("сет")
            "games" -> name.contains("гейм")
            "quarters" -> market.category == "quarter" || name.contains("четверт")
            "halves" -> name.contains("половин") || (market.category == "half" && !Regex("1-й тайм|2-й тайм").containsMatchIn(name))
            else -> (market.category == "main" || Regex("победитель|1x2|double chance|both teams|draw no bet").containsMatchIn(name)) &&
                !Regex("тотал|фора|угл|under/over|handicap|corner|1st period|1st half|2nd period|2nd half").containsMatchIn(name)
        }
    }

    fun filter(markets: List<MarketGroup>, tab: String): List<MarketGroup> = markets.filter { matchesTab(it, tab) }
}

object MarketAccordionLogic {
    fun initialOpenKeys(markets: List<MarketGroup>): Set<String> =
        markets.take(2).map { it.key }.toSet()

    fun toggle(open: Set<String>, key: String): Set<String> =
        if (key in open) open - key else open + key

    fun togglePin(pinned: Set<String>, key: String): Set<String> =
        if (key in pinned) pinned - key else pinned + key

    fun isOpen(key: String, open: Set<String>, pinned: Set<String>): Boolean =
        key in open || key in pinned

    fun sortPinnedFirst(markets: List<MarketGroup>, pinned: Set<String>): List<MarketGroup> =
        markets.sortedWith(compareBy<MarketGroup> { if (it.key in pinned) 0 else 1 }.thenBy { it.name })

    fun columns(market: MarketGroup): Int {
        val name = market.name
        val isMoneyline = market.marketId == "1" || market.marketId == "8" ||
            name.contains("1X2", ignoreCase = true) || name.contains("победитель", ignoreCase = true)
        if (isMoneyline) return if (market.outcomes.size <= 2) 2 else 3
        if (
            name.contains("фора", ignoreCase = true) ||
            name.contains("тотал", ignoreCase = true) ||
            name.contains("угл", ignoreCase = true) ||
            name.contains("handicap", ignoreCase = true) ||
            name.contains("corner", ignoreCase = true) ||
            market.marketId == "2" ||
            market.marketId == "3"
        ) {
            return 2
        }
        return if (market.outcomes.size == 3) 3 else 2
    }
}

object LeagueMatches {
    fun filter(pool: List<MatchCardModel>, leagueId: String): List<MatchCardModel> {
        val (country, name) = LeagueIds.fromLeagueId(leagueId)
        return pool.filter { it.league == name && (country.isEmpty() || it.country == country) }
    }
}

object SportsbookCatalog {
    fun allMatches(
        live: List<MatchCardModel>,
        line: List<MatchCardModel>,
        esportsLive: List<MatchCardModel>,
        esportsLine: List<MatchCardModel>,
    ): List<MatchCardModel> = (live + line + esportsLive + esportsLine).distinctBy { it.id }

    fun matchById(matches: List<MatchCardModel>, id: String): MatchCardModel? =
        matches.firstOrNull { it.id == id || it.eventId == id }

    fun pool(mode: String, live: List<MatchCardModel>, line: List<MatchCardModel>): List<MatchCardModel> =
        if (mode == "line") line else live
}

object HomeChampionships {
    fun title(mode: String): String = if (mode == "line") "Чемпионаты Линия" else "Чемпионаты LIVE"

    fun groups(
        mode: String,
        sportId: String,
        live: List<MatchCardModel>,
        line: List<MatchCardModel>,
    ): List<CountryGroup> {
        val pool = SportsbookCatalog.pool(mode, live, line)
        val filtered = com.nextpari.app.feature.home.SportsbookFilters.matchesForSport(
            pool,
            sportId.ifBlank { "all" },
            excludeEsportsWhenAll = true,
        )
        return CountryGrouping.groupByCountry(filtered)
    }

    fun seeAllRoute(sportId: String, mode: String): String {
        val resolved = if (mode == "line") "line" else "live"
        return if (sportId.isBlank() || sportId == "all") {
            if (resolved == "line") com.nextpari.app.core.navigation.Destinations.SPORTS_LINE
            else com.nextpari.app.core.navigation.Destinations.SPORTS_LIVE
        } else {
            com.nextpari.app.core.navigation.Destinations.championships(sportId, resolved)
        }
    }
}

object HomeAccordionExpansion {
    fun resolve(groups: List<CountryGroup>, current: String, userInteracted: Boolean): String {
        if (userInteracted) {
            if (current.isEmpty()) return ""
            if (groups.any { it.country == current }) return current
        }
        return CountryGrouping.initialExpanded(groups)
    }
}
