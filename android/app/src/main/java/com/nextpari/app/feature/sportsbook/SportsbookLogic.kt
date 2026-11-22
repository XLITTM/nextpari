package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.HomeSport
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.OddsMovement

data class LeagueRow(
    val name: String,
    val country: String,
    val count: Int,
    val favorite: Boolean = false,
    val badge: FootballCompetitionBadge? = null,
    val badgeRes: Int? = null,
    val id: String = LeagueIds.toLeagueId(country,name),
    val canonicalId: String? = null,
    val rank: Int = Int.MAX_VALUE,
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
    val selection: SportsBetSelection? = null,
    val observedUntil: Long? = null,
    val bookmakerId: String? = null,
    val periodId: String? = null,
    val sourceSelectionId: String? = null,
    val provider: String? = null,
    val updatedAt: String? = null,
    val sourceStatus: String? = null,
)

data class MarketGroup(
    val key: String,
    val name: String,
    val marketId: String,
    val category: String,
    val lineCount: Int,
    val outcomes: List<MarketOutcome>,
    val family: String? = null,
    val periodId: String? = null,
    val bookmakerId: String? = null,
    val rows: List<MarketLine> = emptyList(),
)

data class MarketLine(val line: String?, val outcomes: List<MarketOutcome>)

object LeagueIds {
    fun toLeagueId(country: String, name: String): String {
        val league = name.trim().ifEmpty { "tournament" }
        val region = country.trim()
        return if (region.isEmpty()) league else "$region|$league"
    }

    fun fromLeagueId(leagueId: String): Pair<String, String> {
        val raw = java.net.URLDecoder.decode(leagueId, Charsets.UTF_8.name())
        if (raw.startsWith("display|")) {
            val fields=raw.split('|',limit=4)
            return fields.getOrElse(2){""} to fields.getOrElse(3){"Турнир"}
        }
        if (raw.startsWith("canonical:") || raw.startsWith("source:")) return "" to "Турнир"
        val sep = raw.indexOf('|')
        if (sep == -1) return "" to (raw.ifEmpty { "Турнир" })
        return raw.substring(0, sep) to (raw.substring(sep + 1).ifEmpty { "Турнир" })
    }
}

object CountryGrouping {
    fun groupByCountry(matches: List<MatchCardModel>): List<CountryGroup> {
        val countries = linkedMapOf<String, MutableCountry>()
        val unique = matches.groupBy { it.eventId }.values.map { copies ->
            val first=copies.first()
            val consistent=copies.all { it.sport==first.sport && it.country==first.country && it.league==first.league && it.competitionId==first.competitionId && it.providerCompetitionId==first.providerCompetitionId }
            first.copy(competitionId=first.competitionId.takeIf { consistent },providerCompetitionId=first.providerCompetitionId.takeIf { consistent },
                competitionBadge=first.competitionBadge.takeIf { consistent && copies.all { copy -> copy.competitionBadge==it } })
        }
        for (match in FeaturedSports.ordered(unique)) {
            val country = match.country.trim()
            val name = match.league.trim()
            if (name.isEmpty()) continue
            val countryRow = countries.getOrPut(country) { MutableCountry() }
            countryRow.count += 1
            val id=CompetitionOrder.leagueKey(match)
            val league = countryRow.leagues.getOrPut(id) { LeagueRow(name=name,country=country,count=0,id=id,
                canonicalId=match.competitionId,rank=CompetitionOrder.rank(match)) }
            val badge = match.competitionBadge.takeIf { league.count == 0 || league.badge == it }
            val bundledBadge = BundledFootballBadges.competition(match).takeIf { league.count == 0 || league.badgeRes == it }
            countryRow.leagues[id] = league.copy(count = league.count + 1, badge = badge, badgeRes = bundledBadge)
        }
        return countries.map { (country, row) ->
            CountryGroup(
                country = country,
                count = row.count,
                leagues = row.leagues.values.sortedWith(compareBy<LeagueRow> { it.rank }.thenBy { it.name }),
            )
        }.sortedWith(compareBy<CountryGroup> { if(it.country.isBlank() || it.country.lowercase() in setOf("international","eu","world","международные","европа"))0 else 1 }.thenBy { SportsRegions.name(it.country) })
    }

    internal fun search(groups: List<CountryGroup>, query: String, countryOnly: Boolean): List<CountryGroup> {
        val term = query.trim()
        if (term.isEmpty()) return groups
        return groups.mapNotNull { group ->
            if (SportsRegions.name(group.country).contains(term, ignoreCase = true) ||
                group.country.contains(term, ignoreCase = true)) return@mapNotNull group
            if (countryOnly) return@mapNotNull null
            val leagues = group.leagues.filter { it.name.contains(term, ignoreCase = true) }
            group.copy(count = leagues.sumOf(LeagueRow::count), leagues = leagues).takeIf { leagues.isNotEmpty() }
        }
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
    const val EMPTY_MATCHES = "Сейчас матчей нет"

    val supported: List<HomeSport> = listOf(
        HomeSport("football", "Футбол"),
        HomeSport("tennis", "Теннис"),
        HomeSport("basketball", "Баскетбол"),
        HomeSport("hockey", "Хоккей"),
        HomeSport("volleyball", "Волейбол"),
        HomeSport("table-tennis", "Настольный теннис"),
        HomeSport("esports", "КиберСпорт"),
        HomeSport("badminton", "Бадминтон"),
        HomeSport("cricket", "Крикет"),
        HomeSport("beach-volleyball", "Пляжный волейбол"),
        HomeSport("snooker", "Снукер"),
        HomeSport("futsal", "Футзал"),
        HomeSport("handball", "Гандбол"), HomeSport("baseball", "Бейсбол"),
        HomeSport("darts", "Дартс"), HomeSport("american-football", "Американский футбол"),
        HomeSport("rugby", "Регби"), HomeSport("rugby-league", "Регбилиг"),
        HomeSport("aussie-rules", "Австралийский футбол"), HomeSport("floorball", "Флорбол"),
        HomeSport("polo", "Водное поло"), HomeSport("squash", "Сквош"),
        HomeSport("mma", "ММА"), HomeSport("horse-racing", "Скачки"),
        HomeSport("greyhounds", "Собачьи бега"), HomeSport("bowls", "Боулз"),
        HomeSport("boxing", "Бокс"), HomeSport("gaelic-sports", "Гэльский спорт"),
    )

    fun selector(live: List<MatchCardModel>,line: List<MatchCardModel>): List<HomeSport> {
        val available=(live+line).map { it.sport }.toSet()
        return listOf(HomeSport("all","Все"))+supported.filter { it.id in available }+
            available.filter { id -> supported.none { it.id==id } }.sorted().map { HomeSport(it,sportName(it)) }
    }

    fun rows(tab: String,live: List<MatchCardModel>,line: List<MatchCardModel>): List<SportListRow> {
        val pool=(if(tab=="line")line else if(tab=="cybers")live+line else live).distinctBy { it.eventId }
        val counts=pool.filter { FeaturedSports.isEsports(it)==(tab=="cybers") }.groupingBy { if(tab=="cybers")"esports" else it.sport }.eachCount()
        if(tab=="cybers") {
            val events=pool.filter { FeaturedSports.isEsports(it) }
            val disciplines=listOf("cs2","dota2","lol","valorant")
            val rows=disciplines.mapNotNull { game -> events.count { it.discipline==game }.takeIf { it>0 }?.let { SportListRow("esports-$game",sportName("esports-$game"),it) } }
            val unknown=events.count { it.discipline !in disciplines }
            return rows+if(unknown>0)listOf(SportListRow("esports","Другие турниры",unknown)) else emptyList()
        }
        return supported.mapNotNull { sport -> counts[sport.id]?.let { SportListRow(sport.id,sport.name,it) } }+
            counts.keys.filter { id -> supported.none { it.id==id } }.sorted().map { SportListRow(it,sportName(it),counts.getValue(it)) }
    }
    fun sportName(id: String): String = mapOf("esports-cs2" to "CS2","esports-dota2" to "Dota 2","esports-lol" to "League of Legends","esports-valorant" to "Valorant")[id]
        ?: supported.firstOrNull { it.id==id }?.name ?: id

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
        MarketTabSpec("double-chance", "Двойной шанс"),
        MarketTabSpec("btts", "Обе забьют"),
        MarketTabSpec("cards", "Карточки"),
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

    fun modes(sport: String): List<MarketTabSpec> = if (sport == "football") listOf(
        MarketTabSpec("all", "Все маркеты"),
        MarketTabSpec("players", "Игроки"),
        MarketTabSpec("popular", "Популярные"),
    ) else emptyList()

    fun forSport(sport: String): List<MarketTabSpec> {
        val tabs=when(sport) {
            "football" -> listOf("main" to "Основная игра","1st-half" to "1-й тайм","2nd-half" to "2-й тайм","corners" to "Угловые","cards" to "Жёлтые карточки","shots" to "Удары в створ","other" to "Другие")
            "basketball" -> listOf("all" to "Все","main" to "Победитель","totals" to "Тоталы очков","handicaps" to "Форы","quarters" to "Четверти","halves" to "Половины","players" to "Игроки","other" to "Другие")
            "tennis" -> listOf("all" to "Все","main" to "Победитель","totals" to "Тоталы геймов","handicaps" to "Форы","sets" to "Сеты","games" to "Геймы","tiebreaks" to "Тай-брейки","aces" to "Эйсы","other" to "Другие")
            "table-tennis" -> listOf("all" to "Все","main" to "Победитель","sets" to "Партии","totals" to "Тоталы очков","handicaps" to "Форы","other" to "Другие")
            "hockey" -> listOf("all" to "Все","main" to "Исходы","totals" to "Тоталы шайб","handicaps" to "Форы","periods" to "Периоды","goals" to "Голы","other" to "Другие")
            "volleyball" -> listOf("all" to "Все","main" to "Победитель","sets" to "Сеты","totals" to "Тоталы очков","handicaps" to "Форы","other" to "Другие")
            "esports" -> listOf("all" to "Все","main" to "Победитель","maps" to "Карты","handicaps" to "Форы","rounds" to "Раунды","kills" to "Убийства","other" to "Другие")
            else -> listOf("all" to "Все","main" to "Основные","totals" to "Тоталы","handicaps" to "Форы","other" to "Другие")
        }
        return tabs.map { MarketTabSpec(it.first,it.second) }
    }

    fun available(sport: String, markets: List<MarketGroup>): List<MarketTabSpec> {
        val configured = forSport(sport)
        val shared = if (sport == "football") emptyList() else football.filter { it.id in setOf("totals", "handicaps") }
        return (configured + shared).distinctBy(MarketTabSpec::id)
            .filter { tab -> tab.id == "all" || markets.any { matchesTab(it, tab.id, sport) } }
    }

    fun isPopular(market: MarketGroup): Boolean =
        market.family in setOf("result", "winner", "double-chance", "totals", "handicap", "team-totals", "btts")

    fun isPlayerMarket(market: MarketGroup): Boolean =
        market.category == "players" || market.family?.startsWith("players") == true

    fun matchesTab(market: MarketGroup, tab: String, sport: String = ""): Boolean {
        if(market.family!=null) return when(tab) {
            "all" -> true
            "main" -> if (sport == "football") {
                market.periodId in setOf(null, "fulltime", "result", "ft", "match") &&
                    market.category !in setOf("corners", "cards", "shots", "players") &&
                    !isPlayerMarket(market)
            } else {
                market.category=="main" && market.periodId in setOf("fulltime","result","ft","match")
            }
            "other" -> sport == "football" && listOf("main", "1st-half", "2nd-half", "corners", "cards", "shots").none { matchesTab(market, it, sport) }
            "sets" -> market.category=="sets" || market.periodId?.matches(Regex("p[0-9]+"))==true
            "games" -> market.category=="games" || market.periodId?.matches(Regex("p[0-9]+g[0-9]+"))==true
            "periods" -> market.periodId !in setOf(null,"fulltime","result","ft","match")
            "quarters" -> market.periodId?.matches(Regex("p[0-9]+"))==true
            "halves" -> market.periodId in setOf("p1+p2","p3+p4","p3+p4+overtime") || market.periodId?.matches(Regex("h[0-9]+"))==true
            "1st-half" -> market.periodId=="p1" && market.category !in setOf("corners","cards","shots","players")
            "2nd-half" -> market.periodId=="p2" && market.category !in setOf("corners","cards","shots","players")
            "maps" -> market.category=="maps" || market.periodId?.matches(Regex("p[0-9]+"))==true
            else -> market.category==tab || market.family==tab
        }
        val name = market.name.lowercase()
        return when (tab) {
            "all" -> true
            "double-chance" -> market.category == "double-chance" || name in setOf("двойной шанс", "double chance")
            "btts" -> market.category == "btts" || market.marketId == "btts" || name in setOf("обе забьют", "both teams to score")
            "cards" -> market.category == "cards"
            "totals" -> market.category == "totals" || (Regex("тотал|under/over|total|exactly").containsMatchIn(name) &&
                !Regex("corner|гол|забьют|точный|goal|btts").containsMatchIn(name))
            "handicaps" -> market.category == "handicaps" ||
                (Regex("фора|handicap").containsMatchIn(name) && !name.contains("corner"))
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
            "main" -> if (sport == "football") {
                market.category !in setOf("corners", "cards", "shots", "players") &&
                    !Regex("1-й тайм|2-й тайм|1st period|1st half|2nd period|2nd half").containsMatchIn(name)
            } else {
                (market.category == "main" || Regex("победитель|1x2|double chance|both teams|draw no bet").containsMatchIn(name)) &&
                    !Regex("тотал|фора|угл|under/over|handicap|corner|1st period|1st half|2nd period|2nd half").containsMatchIn(name)
            }
            "other" -> sport == "football" && listOf("main", "1st-half", "2nd-half", "corners", "cards", "shots").none { matchesTab(market, it, sport) }
            else -> market.category==tab
        }
    }

    fun filter(markets: List<MarketGroup>, tab: String, sport: String = ""): List<MarketGroup> =
        markets.filter { matchesTab(it, tab, sport) }
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
        markets.sortedBy { if (it.key in pinned) 0 else 1 }

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
        val raw=java.net.URLDecoder.decode(leagueId,Charsets.UTF_8.name())
        if(raw.startsWith("canonical:") || raw.startsWith("source:") || raw.startsWith("display|")) return pool.filter { CompetitionOrder.leagueKey(it)==raw }
        val (country,name)=LeagueIds.fromLeagueId(leagueId)
        val matches=pool.filter { it.league==name && (country.isEmpty() || it.country==country) }
        return matches.takeIf { it.map(CompetitionOrder::leagueKey).distinct().size<=1 }.orEmpty()
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

    internal fun search(matches: List<MatchCardModel>, query: String): List<MatchCardModel> {
        val term = query.trim()
        if (term.isEmpty()) return matches
        return matches.filter { match ->
            listOf(match.team1, match.team2, match.league, SportsRegions.name(match.country))
                .any { it.contains(term, ignoreCase = true) }
        }
    }

    fun pool(mode: String, live: List<MatchCardModel>, line: List<MatchCardModel>): List<MatchCardModel> =
        if (mode == "line") line else live
}

data class CompetitionDirectory(
    val favorites: List<LeagueRow>,
    val top: List<LeagueRow>,
    val international: List<LeagueRow>,
    val countries: List<CountryGroup>,
) {
    companion object {
        private val internationalCountries = setOf("international", "europe", "world", "uefa", "fifa", "atp", "wta", "eu")

        fun organize(groups: List<CountryGroup>, favoriteIds: Set<String>): CompetitionDirectory {
            val claimed = linkedSetOf<String>()
            fun take(rows: List<LeagueRow>) = rows.filter { claimed.add(it.id) }
            val leagues = groups.flatMap { it.leagues }
            val favorites = take(leagues.filter { it.id in favoriteIds })
            val top = take(CompetitionOrder.top(groups))
            val international = take(groups.filter { isInternational(it.country) }.flatMap { it.leagues })
            val countries = groups.mapNotNull { group ->
                if (isInternational(group.country)) return@mapNotNull null
                val remaining = group.leagues.filter { it.id !in claimed }
                if (remaining.isEmpty()) null else group.copy(count = remaining.sumOf(LeagueRow::count), leagues = remaining)
            }
            return CompetitionDirectory(favorites, top, international, countries)
        }

        private fun isInternational(country: String): Boolean {
            val key = country.trim().lowercase(java.util.Locale.ROOT)
            return key.isEmpty() || key in internationalCountries || SportsRegions.code(country) == "eu"
        }
    }
}

sealed interface GameListEntry {
    val key: String
    data class Heading(override val key: String, val title: String) : GameListEntry
    data class Fixture(val match: MatchCardModel) : GameListEntry {
        override val key: String get() = match.eventId
    }
}

object GameListLayout {
    fun entries(matches: List<MatchCardModel>): List<GameListEntry> {
        val sorted = matches.distinctBy(MatchCardModel::eventId).sortedWith(
            compareBy<MatchCardModel> { sportIndex(it.sport) }
                .thenBy { CompetitionOrder.rank(it) }
                .thenBy { it.kickoffEpochMs ?: Long.MAX_VALUE }
                .thenBy { it.eventId },
        )
        val rows = mutableListOf<GameListEntry>()
        var sport: String? = null
        var league: String? = null
        for (match in sorted) {
            if (match.sport != sport) {
                sport = match.sport
                league = null
                rows += GameListEntry.Heading("sport:$sport", SportsListCatalog.sportName(sport))
            }
            val leagueId = CompetitionOrder.leagueKey(match)
            if (leagueId != league) {
                league = leagueId
                rows += GameListEntry.Heading("league:$leagueId", match.league)
            }
            rows += GameListEntry.Fixture(match)
        }
        return rows
    }

    private fun sportIndex(sport: String): Int {
        val index = SportsListCatalog.supported.indexOfFirst { it.id == sport }
        return if (index < 0) SportsListCatalog.supported.size + 1 else index
    }
}

object HomeChampionships {
    const val TITLE = "Чемпионаты LIVE"
    const val PREVIEW_DEFAULT = 4
    const val PREVIEW_MAX = 5

    fun groups(
        live: List<MatchCardModel>,
        excludeEsports: Boolean = false,
    ): List<CountryGroup> {
        val source = if (excludeEsports) live.filterNot(FeaturedSports::isEsports) else live
        return CountryGrouping.groupByCountry(source)
    }

    fun preview(
        live: List<MatchCardModel>,
        excludeEsports: Boolean = false,
    ): List<CountryGroup> {
        val all = groups(live, excludeEsports)
        if (all.isEmpty()) return emptyList()
        val scored = all.map { group -> group to previewScore(group, live) }
            .sortedWith(compareBy({ it.second }, { SportsRegions.name(it.first.country) }))
        val prominent = scored.filter { it.second < 5_000 }
        val take = when {
            prominent.size >= PREVIEW_MAX -> PREVIEW_MAX
            prominent.size >= PREVIEW_DEFAULT -> PREVIEW_DEFAULT
            else -> minOf(PREVIEW_DEFAULT, scored.size)
        }
        return scored.take(take).map { it.first }
    }

    private fun previewScore(group: CountryGroup, live: List<MatchCardModel>): Int {
        val matches = live.filter { it.country == group.country && !FeaturedSports.isEsports(it) }
        val footballRank = matches.filter { it.sport == "football" }
            .minOfOrNull(CompetitionOrder::rank) ?: Int.MAX_VALUE
        if (footballRank != Int.MAX_VALUE) return footballRank
        val major = setOf("tennis", "basketball", "hockey", "volleyball")
        val other = matches.filter { it.sport in major }
        if (other.isNotEmpty()) {
            val sportIndex = other.minOf { FeaturedSports.sportPriority(it.sport) }
            val rank = other.minOf { CompetitionOrder.rank(it).coerceAtMost(80) }
            return 100 + sportIndex * 100 + rank
        }
        val leftover = matches.firstOrNull()?.sport
        return 5_000 + FeaturedSports.sportPriority(leftover.orEmpty())
    }

    fun seeAllRoute(sportId: String): String {
        return if (sportId.isBlank() || sportId == "all") {
            com.nextpari.app.core.navigation.Destinations.SPORTS_LIVE
        } else {
            com.nextpari.app.core.navigation.Destinations.championships(sportId, "live")
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
