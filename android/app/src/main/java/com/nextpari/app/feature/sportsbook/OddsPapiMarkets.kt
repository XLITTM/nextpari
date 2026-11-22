package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.MatchOutcome
import java.math.BigDecimal
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive

internal val oddsPapiEventId = Regex("oddspapi-v5:id[0-9]{8,32}")

@Serializable
data class OddsPapiOutcomeDto(
    val label: String = "", val odds: JsonPrimitive? = null,
    val sourceSelectionId: String? = null, val updatedAt: String? = null,
    val active: Boolean? = null, val suspended: Boolean = false, val playerName: String? = null,
)

@Serializable
data class OddsPapiGroupDto(
    val id: String = "", val name: String = "", val category: String = "",
    val marketFamily: String? = null, val bookmakerId: String? = null,
    val externalPeriodId: String? = null, val externalMarketId: String? = null,
    val line: JsonPrimitive? = null, val status: String? = null,
    val outcomes: List<OddsPapiOutcomeDto> = emptyList(),
) {
    @kotlinx.serialization.Transient internal var observation: MarketObservation? = null
        private set
    internal fun checkedAt(epoch: Long, elapsed: Long) = copy().also { it.observation = MarketObservation(epoch, elapsed) }
}

internal data class MarketPresentation(val family: String, val title: String, val category: String, val semantic: String)

/** Display classification only. Provider ids, periods and bookmaker ids remain the identity. */
internal object SportMarketStructure {
    private val terminalLine = Regex("(?:\\s*[·|]\\s*|\\s+)([+-]?\\d+(?:[.,]\\d+)?)$")
    private val periodPrefix = Regex("^(?:p\\d+(?:g\\d+)?|\\d+-[йя]\\s+(?:период|тайм|сет|четверть|половина)|(?:first|second|third|fourth|\\d+(?:st|nd|rd|th))\\s+(?:half|period|set|quarter))\\s*[·|:]\\s*", RegexOption.IGNORE_CASE)
    fun line(group: OddsPapiGroupDto): String? = group.line?.content?.takeIf { it.isNotBlank() }
        ?: terminalLine.find(group.name)?.groupValues?.get(1)?.replace(',', '.')
    fun baseName(group: OddsPapiGroupDto): String = group.name.replace(periodPrefix, "").replace(terminalLine, "").trim()

    private data class Definition(val family: String, val title: String, val category: String, val entity: String = "")

    /** Explicit wire-label dictionary. A family hint alone cannot distinguish aces, games or team totals. */
    private fun definitions(sport: String): Map<String, Definition> = buildMap {
        fun add(names: List<String>, family: String, title: String, category: String, entity: String = "") {
            names.forEach { put(it.lowercase(), Definition(family, title, category, entity)) }
        }
        fun one(name: String, family: String, title: String, category: String) = add(listOf(name), family, title, category)
        if (sport in setOf("football", "tennis", "basketball", "hockey", "volleyball", "table-tennis", "esports")) {
            add(listOf("Победитель", "Winner", "Moneyline"), "winner", "Победитель", "main")
            add(listOf("1X2", "Исход", "Full Time Result"), "result", "1X2", "main")
        }
        when (sport) {
            "football" -> {
                add(listOf("Победитель", "Winner", "1X2", "Исход", "Full Time Result"), "result", "1X2", "main")
                add(listOf("Тотал", "Over Under"), "totals", "Тотал", "totals")
                add(listOf("Asian Handicap", "Азиатская фора"), "asian-handicap", "Азиатская фора", "handicaps")
                add(listOf("European Handicap", "Европейская фора"), "european-handicap", "Европейская фора", "handicaps")
                add(listOf("Двойной шанс", "Double Chance"), "double-chance", "Двойной шанс", "double-chance")
                add(listOf("Draw No Bet", "Победа с возвратом при ничьей"), "draw-no-bet", "Победа с возвратом при ничьей", "main")
                add(listOf("Обе забьют", "Both Teams To Score"), "btts", "Обе забьют", "btts")
                add(listOf("Точный счёт", "Exact Score", "Correct Score"), "correct-score", "Точный счёт", "goals")
                one("Half Time / Full Time", "half-full", "Тайм / матч", "main")
                one("Highest Scoring Half", "highest-half", "Самый результативный тайм", "goals")
                one("First Goal", "first-goal", "Первый гол", "goals")
                one("Last Goal", "last-goal", "Последний гол", "goals")
                one("Next Goal", "next-goal", "Следующий гол", "goals")
                one("Odd Even", "odd-even", "Чёт / нечёт голов", "goals")
                one("Winning Margin", "winning-margin", "Разница голов", "goals")
                for (team in 1..2) {
                    add(listOf("Over Under Team $team"), "team-totals", "Индивидуальный тотал $team", "totals", "team:$team")
                    add(listOf("Team $team Exact Score"), "team-score", "Точный счёт команды $team", "goals", "team:$team")
                    add(listOf("Team $team Win To Nil"), "win-nil", "Команда $team победит всухую", "goals", "team:$team")
                    add(listOf("Team $team Clean Sheet"), "clean-sheet", "Команда $team не пропустит", "goals", "team:$team")
                    add(listOf("Team $team Highest Scoring Half"), "team-highest-half", "Результативный тайм команды $team", "goals", "team:$team")
                    add(listOf("Team $team To Score in Both Halves"), "score-both", "Команда $team забьёт в обоих таймах", "goals", "team:$team")
                    add(listOf("Team $team To Win Both Halves"), "win-both", "Команда $team выиграет оба тайма", "main", "team:$team")
                    add(listOf("Team $team To Win Either Halves"), "win-either", "Команда $team выиграет хотя бы один тайм", "main", "team:$team")
                }
                for ((wire, category, noun) in listOf(Triple("Corners", "corners", "угловых"), Triple("Bookings", "cards", "карточек"))) {
                    one("$wire - 1X2", "$category-result", "1X2 по $noun", category)
                    one("$wire - Handicap", "$category-handicap", "Фора по $noun", category)
                    one("$wire - Over Under", "$category-totals", "Тотал $noun", category)
                    one("$wire - Odd Even", "$category-odd-even", "Чёт / нечёт $noun", category)
                    for (team in 1..2) add(listOf("$wire - Over Under Team $team"), "$category-team-totals", "Тотал $noun команды $team", category, "team:$team")
                }
            }
            "basketball" -> {
                add(listOf("Тотал", "Total Points", "Over Under"), "totals", "Тотал очков", "totals")
                add(listOf("Handicap", "Asian Handicap", "Spread", "Point Handicap", "Фора"), "spread", "Фора по очкам", "handicaps")
                for (team in 1..2) add(listOf("Team $team Total", "Team $team Total Points"), "team-totals", "Индивидуальный тотал $team", "totals", "team:$team")
            }
            "tennis", "table-tennis", "volleyball" -> {
                val games = sport == "tennis"
                val unit = if(games) "геймов" else "очков"
                val sets = if(sport == "table-tennis") "партий" else "сетов"
                add(listOf("Точный счёт", "Correct Set Score", "Set Score", "Correct Score"), "set-score", "Точный счёт по $sets", "sets")
                add(listOf(if(sport == "table-tennis") "Тотал" else "Тотал очков", if(games) "Total Games Over Under" else "Total Points", if(games) "Total Games" else "Total Points Over Under"), "totals", "Тотал $unit", "totals")
                add(listOf("Game Handicap", "Point Handicap", "Фора"), "point-handicap", "Фора по ${if(games) "геймам" else "очкам"}", "handicaps")
                add(listOf("Set Handicap", "Фора по сетам"), "set-handicap", "Фора по $sets", "handicaps")
                add(listOf("Total Sets", "Тотал сетов"), "total-sets", "Тотал $sets", "sets")
                if (games) {
                    one("Total Aces", "aces-totals", "Тотал эйсов", "aces")
                    one("Odd Even Games", "odd-even", "Чёт / нечёт геймов", "games")
                    one("Tie Break", "tiebreak", "Тай-брейк", "tiebreaks")
                    // Race To Games needs a supplied target; leave it unmapped rather than dropping it.
                    for (team in 1..2) {
                        add(listOf("Participant $team Total Games"), "team-totals", "Индивидуальный тотал геймов $team", "totals", "participant:$team")
                        add(listOf("Participant $team Total Aces"), "aces-team-totals", "Тотал эйсов игрока $team", "aces", "participant:$team")
                    }
                }
            }
            "hockey" -> {
                add(listOf("Тотал", "Total Goals", "Over Under"), "totals", "Тотал шайб", "totals")
                add(listOf("Handicap", "Asian Handicap", "Фора"), "handicap", "Фора по шайбам", "handicaps")
                add(listOf("Точный счёт", "Correct Score"), "correct-score", "Точный счёт", "goals")
                add(listOf("Обе забьют", "Both Teams To Score"), "btts", "Обе забьют", "goals")
                one("First Goal", "first-goal", "Первая шайба", "goals")
                one("Last Goal", "last-goal", "Последняя шайба", "goals")
                one("Odd Even", "odd-even", "Чёт / нечёт шайб", "goals")
                one("Winning Margin", "winning-margin", "Разница шайб", "goals")
                for (team in 1..2) {
                    add(listOf("Team $team Total"), "team-totals", "Индивидуальный тотал $team", "totals", "team:$team")
                    add(listOf("Team $team Win To Nil"), "win-nil", "Команда $team победит всухую", "goals", "team:$team")
                }
            }
            "esports" -> {
                add(listOf("Map Winner", "Победитель карты"), "winner", "Победитель карты", "main")
                add(listOf("Map Handicap", "Фора по картам"), "map-handicap", "Фора по картам", "handicaps")
                add(listOf("Total Maps", "Тотал карт"), "total-maps", "Тотал карт", "maps")
                one("Total Rounds", "rounds-totals", "Тотал раундов", "rounds")
                one("Round Handicap", "rounds-handicap", "Фора по раундам", "rounds")
                one("Total Kills", "kills-totals", "Тотал убийств", "kills")
                one("Kill Handicap", "kills-handicap", "Фора по убийствам", "kills")
            }
        }
    }
    /** Exact V5 marketType keys documented in https://docs.oddspapi.io/coverage/markets. */
    private fun wireDefinition(sport: String,type: String): Definition? {
        fun spec(family: String,title: String,category: String,entity: String="")=Definition(family,title,category,entity)
        val unit=when(sport) { "football" -> "голов";"hockey" -> "шайб";"basketball" -> "очков";else -> "очков" }
        when(type) {
            "moneyline" -> return spec("winner","Победитель","main")
            "1x2" -> return spec("result","1X2","main")
            "doublechance" -> if(sport=="football")return spec("double-chance","Двойной шанс","double-chance")
            "drawnobet" -> return spec("draw-no-bet","Победа с возвратом при ничьей","main")
            "bothteamsscore" -> return spec("btts","Обе забьют",if(sport=="football")"btts" else "goals")
            "correctscore" -> return spec(if(sport in setOf("tennis","volleyball","table-tennis"))"set-score" else "correct-score",
                when(sport) { "tennis","volleyball" -> "Точный счёт по сетам";"table-tennis" -> "Точный счёт по партиям";"esports" -> "Точный счёт по картам";else -> "Точный счёт" },
                when(sport) { "tennis","volleyball","table-tennis" -> "sets";"esports" -> "maps";else -> "goals" })
            "totals" -> return when(sport) {
                "tennis","volleyball" -> spec("total-sets","Тотал сетов","sets")
                "esports" -> spec("total-maps","Тотал карт","maps")
                "football" -> spec("totals","Тотал","totals")
                "basketball","hockey" -> spec("totals","Тотал $unit","totals")
                else -> null
            }
            "spreads" -> return when(sport) {
                "tennis","volleyball" -> spec("set-handicap","Фора по сетам","handicaps")
                "esports" -> spec("map-handicap","Фора по картам","handicaps")
                "football" -> spec("handicap","Фора","handicaps")
                "basketball" -> spec("spread","Фора по очкам","handicaps")
                "hockey" -> spec("handicap","Фора по шайбам","handicaps")
                else -> null
            }
            "spreads-european" -> if(sport=="football")return spec("european-handicap","Европейская фора","handicaps")
            "halftime-fulltime" -> if(sport=="football")return spec("half-full","Тайм / матч","main")
            "firstgoal" -> return spec("first-goal",if(sport=="hockey")"Первая шайба" else "Первый гол","goals")
            "lastgoal" -> return spec("last-goal",if(sport=="hockey")"Последняя шайба" else "Последний гол","goals")
            "exactscore" -> return spec("exact-score","Точное число $unit","goals")
            "oddeven" -> return spec("odd-even","Чёт / нечёт","main")
            "highestscoringh" -> if(sport=="football")return spec("highest-half","Самый результативный тайм","goals")
            "winfrombehind" -> return spec("win-from-behind","Победа с отыгрышем","main")
            "winningmargin" -> return spec("winning-margin","Победа с разницей","main")
        }
        val stats=when(sport) {
            "football" -> mapOf("corners" to "угловых","bookings" to "карточек","red-cards" to "красных карточек","yellow-cards" to "жёлтых карточек","shots" to "ударов","shotsongoal" to "ударов в створ")
            "tennis" -> mapOf("games" to "геймов","points" to "очков","aces" to "эйсов","tiebreaks" to "тай-брейков","doublefaults" to "двойных ошибок","breaks" to "брейков")
            "table-tennis","volleyball" -> mapOf("points" to "очков")
            "esports" -> mapOf("kills" to "убийств","rounds" to "раундов","roshans" to "Рошанов","towers" to "башен","turrets" to "вышек","barons" to "Баронов","dragons" to "драконов","inhibitors" to "ингибиторов","headshots" to "попаданий в голову")
            else -> emptyMap()
        }
        for((stat,noun) in stats) {
            val category=when { sport=="football" && stat=="corners" -> "corners";sport=="football" && stat in setOf("bookings","red-cards","yellow-cards") -> "cards";sport=="football" && stat in setOf("shots","shotsongoal") -> "shots";sport=="esports" && stat=="rounds" -> "rounds";sport=="esports" -> "kills";stat=="aces" -> "aces";stat=="tiebreaks" -> "tiebreaks";else -> "totals" }
            if(type=="totals-$stat")return spec("totals-$stat","Тотал $noun",category)
            if(type=="spreads-$stat")return spec("handicap-$stat","Фора по ${mapOf("games" to "геймам","points" to "очкам","aces" to "эйсам","tiebreaks" to "тай-брейкам","doublefaults" to "двойным ошибкам","breaks" to "брейкам","corners" to "угловым","bookings" to "карточкам","kills" to "убийствам","rounds" to "раундам")[stat] ?: noun}",if(sport=="esports" || sport=="football")category else "handicaps")
            if(type=="oddeven-$stat")return spec("odd-even-$stat","Чёт / нечёт $noun",category)
            if(type=="1x2-$stat")return spec("result-$stat","1X2 по $noun",category)
            for(team in 1..2) if(type=="teamtotals-$stat-team$team")return spec("team-totals-$stat","Тотал $noun команды $team",category,"team:$team")
        }
        for(team in 1..2) {
            if(type=="teamtotals-team$team")return spec("team-totals","Индивидуальный тотал $team","totals","team:$team")
            if(sport=="football") when(type) {
                "exactscore-team$team" -> return spec("team-exact-score","Точное число голов команды $team","goals","team:$team")
                "wintonil-team$team" -> return spec("win-nil","Команда $team победит всухую","goals","team:$team")
                "cleansheet-team$team" -> return spec("clean-sheet","Команда $team не пропустит","goals","team:$team")
                "toscoreinbh-team$team" -> return spec("score-both","Команда $team забьёт в обоих таймах","goals","team:$team")
                "wineitherh-team$team" -> return spec("win-either","Команда $team выиграет хотя бы один тайм","main","team:$team")
                "winbothh-team$team" -> return spec("win-both","Команда $team выиграет оба тайма","main","team:$team")
                "highestscoringh-team$team" -> return spec("team-highest-half","Самый результативный тайм команды $team","goals","team:$team")
                "oddeven-team$team" -> return spec("team-odd-even","Чёт / нечёт команды $team","goals","team:$team")
            }
        }
        if(sport=="esports") when(type) {
            "firstblood" -> return spec(type,"Первая кровь","kills")
            "firsttower" -> return spec(type,"Первая башня","kills")
            "firstbarracks" -> return spec(type,"Первые казармы","kills")
            "firstroshan" -> return spec(type,"Первый Рошан","kills")
            "firstbaron" -> return spec(type,"Первый Барон","kills")
        }
        if (type.startsWith("players-")) {
            val title = when {
                "goalscorer" in type -> "Бомбардиры"
                else -> "Игроки"
            }
            return spec(type, title, "players")
        }
        // Race-to and player markets need an explicit target or participant identity.
        return null
    }
    private val dictionaries by lazy {
        listOf("football", "basketball", "tennis", "table-tennis", "volleyball", "hockey", "esports").associateWith(::definitions)
    }
    private fun withoutPeriod(label: String, period: String?): String {
        // These are structural aliases observed on the wire, not market inference.
        val descriptors = when (period) {
            "fulltime" -> listOf("Full Time"); "p1" -> listOf("First Half", "First Set", "First Period")
            "p2" -> listOf("Second Half", "Second Set", "Second Period"); "p3" -> listOf("Third Period")
            else -> emptyList()
        }
        var normalized = label
        descriptors.forEach { token ->
            normalized = normalized.removePrefix("$token ").removeSuffix(" $token")
        }
        return normalized
    }
    fun describe(sport: String, group: OddsPapiGroupDto): MarketPresentation {
        val base = baseName(group)
        val normalized = withoutPeriod(base, group.externalPeriodId).lowercase()
        // Exact catalogue IDs resolve labels shortened by the website adapter.
        // https://oddspapi.io/blog/volleyball-odds-api-live-odds/
        // https://oddspapi.io/blog/tennis-odds-api-live-atp-wta/
        val exactSets = (sport == "volleyball" && group.externalMarketId in setOf("2313", "2315", "2317")) ||
            (sport == "tennis" && group.externalMarketId == "12231")
        val named=dictionaries[sport]?.get(normalized)
        val typed=wireDefinition(sport,group.marketFamily.orEmpty())
        val generic=normalized in setOf("тотал","азиатская фора","победитель","точный счёт","исход","1x2")
        val definition=if(exactSets && group.externalPeriodId=="result") Definition("total-sets","Тотал сетов","sets")
            else (if(generic)typed?:named else named?:typed)
                ?: return MarketPresentation("other","Неизвестный рынок · ${base.ifBlank { group.externalMarketId.orEmpty() }}","other","${group.externalMarketId}:$base")

        val scoped = if(sport == "hockey" && definition.family in setOf("result", "winner")) {
            if(group.externalPeriodId == "result") Definition("winner-ot", "Победитель с учётом ОТ и буллитов", "main")
            else if(group.externalPeriodId == "fulltime") Definition("regulation-result", "1X2 в основное время", "main")
            else Definition("period-result", "Исход периода", "main")
        } else definition
        val scope = if (sport == "football") footballLadder(scoped, line(group)) else scoped
        return MarketPresentation(scope.family, scope.title, scope.category, "${scope.family}:${scope.entity}")
    }
    fun isQuarterLine(line: String?): Boolean {
        val value = line?.replace(',', '.')?.toDoubleOrNull() ?: return false
        val cents = kotlin.math.round(kotlin.math.abs(value) * 100.0).toInt() % 100
        return cents == 25 || cents == 75
    }
    private fun footballLadder(definition: Definition, line: String?): Definition {
        val quarter = isQuarterLine(line)
        return when (definition.family) {
            "totals" -> if (quarter) definition.copy(family = "asian-totals", title = "Азиатский тотал") else definition.copy(title = "Тотал")
            "team-totals" -> if (quarter) definition.copy(family = "asian-team-totals", title = "Азиатский ${definition.title}") else definition
            "handicap", "asian-handicap" -> if (quarter) {
                definition.copy(family = "asian-handicap", title = "Азиатская фора")
            } else {
                definition.copy(family = "handicap", title = "Фора")
            }
            else -> definition
        }
    }
    fun familyRank(family: String?): Int = listOf(
        "result", "regulation-result", "winner", "winner-ot", "draw-no-bet", "double-chance",
        "totals", "handicap", "team-totals", "correct-score",
        "asian-totals", "asian-handicap", "asian-team-totals", "odd-even", "european-handicap",
        "btts", "first-goal", "last-goal", "next-goal",
        "spread", "point-handicap", "set-handicap", "map-handicap", "total-sets", "total-maps", "set-score",
    ).indexOf(family).takeIf { it >= 0 } ?: 100
    fun footballFamilyOrder(family: String?, name: String = ""): Int = when (family) {
        "result", "winner" -> 1
        "double-chance" -> 2
        "totals" -> 3
        "handicap" -> 4
        "team-totals" -> if (name.contains("2") && !name.contains("1")) 6 else 5
        "correct-score" -> 7
        "asian-totals" -> 8
        "asian-handicap" -> 9
        "asian-team-totals" -> 10
        "odd-even" -> 11
        "european-handicap" -> 12
        "btts" -> 13
        "first-goal" -> 14
        "last-goal" -> 15
        "next-goal" -> 16
        else -> 50 + familyRank(family)
    }
    fun categoryRank(sport: String, category: String): Int {
        val order = when(sport) {
            "football" -> listOf("main", "double-chance", "totals", "handicaps", "btts", "goals", "corners", "cards", "shots", "players")
            "basketball" -> listOf("main", "handicaps", "totals", "players")
            "tennis" -> listOf("main", "sets", "handicaps", "totals", "games", "tiebreaks", "aces")
            "table-tennis", "volleyball" -> listOf("main", "sets", "handicaps", "totals")
            "hockey" -> listOf("main", "handicaps", "totals", "goals")
            "esports" -> listOf("main", "handicaps", "maps", "rounds", "kills")
            else -> listOf("main", "handicaps", "totals")
        }
        return order.indexOf(category).takeIf { it >= 0 } ?: 100
    }
    fun periodRank(period: String?): Int = when(period) {
        "fulltime", "ft", "match" -> 0; "result" -> 1
        else -> Regex("([ph])(\\d+)(?:g(\\d+))?").matchEntire(period.orEmpty())?.let {
            (if(it.groupValues[1] == "h") 100 else 200) + it.groupValues[2].toInt() * 100 + (it.groupValues[3].toIntOrNull() ?: 0)
        } ?: 100_000
    }

    fun periodLabel(sport: String, period: String?): String? {
        if(sport=="basketball") when(period) {
            "p1+p2" -> return "1-я половина";"p3+p4" -> return "2-я половина"
            "p3+p4+overtime" -> return "2-я половина с ОТ";"p4+overtime" -> return "4-я четверть с ОТ"
            "result" -> return "Матч с ОТ";"fulltime" -> return "Основное время"
        }
        if(period=="overtime") return "Дополнительное время"
        if(sport == "hockey" && period == "result") return "С ОТ и буллитами"
        if(sport == "hockey" && period == "fulltime") return "Основное время"
        if(period.isNullOrBlank() || period in setOf("fulltime","result","ft","match")) return null
        Regex("p(\\d+)g(\\d+)").matchEntire(period)?.let { return "${it.groupValues[1]}-й сет · ${it.groupValues[2]}-й гейм" }
        val number=Regex("p(\\d+)").matchEntire(period)?.groupValues?.get(1)
        if(number!=null) return when(sport) {
            "football" -> "$number-й тайм"; "basketball" -> "$number-я четверть"
            "tennis","volleyball" -> "$number-й сет"; "table-tennis" -> "$number-я партия"
            "esports" -> "$number-я карта"; else -> "$number-й период"
        }
        if(period == "fulltime+overtime") return "С овертаймом, без буллитов"
        Regex("h(\\d+)").matchEntire(period)?.let { return "${it.groupValues[1]}-я половина" }
        return "Период $period"
    }
}

internal fun FootballFixture.withOddsPapiMarkets(
    primary: List<FootballMarketDto>, display: List<OddsPapiGroupDto>, state: FootballPriceState,
    epoch: Long = 0, elapsed: Long = 0, checkAge: Boolean = true,
): FootballFixture {
    val main = primary.map { row ->
        OddsPapiGroupDto(id=row.externalMarketId.orEmpty(),name=if(row.key=="1x2")"1X2" else if(row.key=="moneyline")"Победитель" else row.name.ifBlank{row.key},
            marketFamily=row.key,bookmakerId=row.bookmakerId,externalPeriodId=row.externalPeriodId,externalMarketId=row.externalMarketId,
            line=JsonPrimitive(row.line),status=row.status,
            outcomes=row.outcomes.map { out -> OddsPapiOutcomeDto(label=mapOf("home" to "П1","draw" to "X","away" to "П2","over" to "ТБ","under" to "ТМ")[out.key]?:out.key,
                odds=out.price?.let(::JsonPrimitive),sourceSelectionId=out.sourceSelectionId,updatedAt=row.updatedAt) }
        ).let { dto -> row.observation?.let { dto.checkedAt(it.epoch,it.elapsed) } ?: dto }
    }
    data class SourceLine(val dto: OddsPapiGroupDto, val presentation: MarketPresentation, val line: String?, val outcomes: List<MarketOutcome>)
    val sourceFixture=match.eventId.removePrefix("oddspapi-v5:")
    val lines=(main+display).mapNotNull { dto ->
        val marketId=dto.externalMarketId?.takeIf(String::isNotBlank) ?: return@mapNotNull null
        val bookmaker=dto.bookmakerId?.takeIf { Regex("[A-Za-z0-9_-]+").matches(it) } ?: return@mapNotNull null
        val period=dto.externalPeriodId?.takeIf(String::isNotBlank) ?: return@mapNotNull null
        val spec=SportMarketStructure.describe(match.sport,dto)
        val line=SportMarketStructure.line(dto)
        val observation=dto.observation?:MarketObservation(epoch,elapsed)
        val limit=if(match.isLive)30_000L else 180_000L
        val outcomes=dto.outcomes.map { out ->
            val selection=out.sourceSelectionId?.takeIf { it.matches(Regex("${Regex.escape(sourceFixture)}:${Regex.escape(bookmaker)}:[0-9]+:[0-9]+")) }
            val at=out.updatedAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            val age=at?.let { observation.epoch-it }
            val until=if(!checkAge)observation.elapsed+limit else age?.takeIf { it in -1_000 until limit }?.let { observation.elapsed+limit-it.coerceAtLeast(0) }
            val player=selection?.substringAfterLast(':')?.takeIf { it!="0" }
            val playerIdentified=player==null || !out.playerName.isNullOrBlank()
            val valid=playerIdentified && state==FootballPriceState.Open && dto.status !in setOf("suspended","closed") && out.active!=false && !out.suspended && selection!=null && until!=null
            val value=out.odds?.content?.toBigDecimalOrNull()?.takeIf { it>BigDecimal.ONE && valid }
            MarketOutcome(eventId=match.eventId,marketId=marketId,marketKey=spec.family,line=line,
                outcomeId=selection?.split(':')?.getOrNull(2),label=if(player==null)out.label else out.playerName?.takeIf { it.isNotBlank() }?.let { "$it · ${out.label}" } ?: "Имя игрока недоступно",odds=value?.stripTrailingZeros()?.let { it.setScale(maxOf(2,it.scale())).toPlainString() },
                locked=true,observedUntil=until,bookmakerId=bookmaker,periodId=period,sourceSelectionId=selection,provider="oddspapi-v5",updatedAt=out.updatedAt,sourceStatus=dto.status)
        }.filter { it.label.isNotBlank() }
        if(outcomes.isEmpty())null else SourceLine(dto,spec,line,outcomes)
    }.groupBy { listOf(it.dto.bookmakerId,it.dto.externalPeriodId,it.dto.externalMarketId,it.line) }
        .values.mapNotNull { copies -> copies.firstOrNull()?.takeIf {
            // Primary and display views express an open parent as "open" or omitted.
            // Preserve the raw status, while comparing equivalent effective states.
            copies.map { line -> line.outcomes.map { out -> out.copy(sourceStatus=out.sourceStatus?.takeUnless { status -> status=="open" }) } to line.presentation }.distinct().size==1
        } }
    val grouped=lines.groupBy { listOf(it.dto.bookmakerId,it.dto.externalPeriodId,it.presentation.family,it.presentation.semantic) }
        .map { (identity, entries) ->
            val first=entries.first();val spec=first.presentation
            val rows=entries.sortedWith(compareBy<SourceLine> { it.line?.toBigDecimalOrNull() }.thenBy { it.line.orEmpty() }).map { MarketLine(it.line,it.outcomes) }
            val title=listOfNotNull(SportMarketStructure.periodLabel(match.sport,first.dto.externalPeriodId),spec.title).joinToString(" · ")
            MarketGroup(key=(listOf(match.eventId)+identity).joinToString("|") { "${it?.length?:-1}:$it" },name=title,
                marketId=first.dto.externalMarketId.orEmpty(),category=spec.category,lineCount=rows.size,outcomes=rows.flatMap(MarketLine::outcomes),
                family=spec.family,periodId=first.dto.externalPeriodId,bookmakerId=first.dto.bookmakerId,rows=rows)
        }.sortedWith(
            if (match.sport == "football") {
                compareBy<MarketGroup> { SportMarketStructure.periodRank(it.periodId) }
                    .thenBy { SportMarketStructure.footballFamilyOrder(it.family, it.name) }
                    .thenBy { it.name }
            } else {
                compareBy<MarketGroup> { SportMarketStructure.categoryRank(match.sport, it.category) }
                    .thenBy { SportMarketStructure.periodRank(it.periodId) }
                    .thenBy { SportMarketStructure.familyRank(it.family) }
                    .thenBy { it.name }
            },
        )
    val top=main.firstOrNull { it.marketFamily in setOf("1x2","moneyline") && it.externalPeriodId in setOf("fulltime","result") }
    val topOutcomes=grouped.flatMap(MarketGroup::outcomes).filter { it.marketId==top?.externalMarketId && it.periodId==top?.externalPeriodId && it.bookmakerId==top?.bookmakerId }
    val priceState=if(state==FootballPriceState.Open && grouped.none { g->g.outcomes.any { it.odds!=null } })FootballPriceState.Unpriced else state
    return copy(match=match.copy(outcomes=topOutcomes.map { MatchOutcome(it.label,it.odds,locked=true) },
        marketTitle=if(match.sport in setOf("football","hockey"))"1X2" else "Победитель",extraMarkets=grouped.size,
        priceNote=if(priceState==FootballPriceState.Open)"Приём ставок временно выключен" else priceState.notice,readOnly=true),
        markets=grouped,priceState=priceState,fullMarkets=display.isNotEmpty())
}
