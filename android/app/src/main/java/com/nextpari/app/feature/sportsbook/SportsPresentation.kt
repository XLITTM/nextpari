package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.feature.home.MatchCardModel
import java.util.Locale

private val whitespace = Regex("\\s+")
private fun normalized(value: String) = value.trim().replace(whitespace, " ").lowercase(Locale.ROOT)

private val nationalCompetitions = setOf(
    "uefa nations league", "uefa european championship", "uefa euro", "fifa world cup",
    "copa america", "copa américa",
)
private val internationalClubCompetitions = setOf(
    "uefa champions league", "uefa europa league", "uefa conference league", "uefa europa conference league",
)
private val majorDomestic = mapOf(
    "england premier league" to "eng", "premier league" to "eng",
    "spain la liga" to "es", "la liga" to "es",
    "italy serie a" to "it", "serie a" to "it",
    "germany bundesliga" to "de", "bundesliga" to "de",
    "france ligue 1" to "fr", "ligue 1" to "fr",
)
private val qualifiedDomestic = setOf(
    "england premier league", "spain la liga", "italy serie a", "germany bundesliga", "france ligue 1",
)
private val lowerFootball = setOf(
    "efl championship", "england championship", "sky bet championship", "efl league one", "england league one",
    "efl league two", "england league two", "2. bundesliga", "germany 2. bundesliga", "3. liga", "germany 3. liga",
    "la liga 2", "spain segunda division", "segunda division", "serie b", "italy serie b", "ligue 2", "france ligue 2",
)
private val majorOtherSports = mapOf(
    "tennis" to setOf("australian open", "roland garros", "french open", "wimbledon", "us open", "atp finals", "wta finals"),
    "basketball" to setOf("nba", "euroleague", "fiba basketball world cup"),
    "hockey" to setOf("nhl", "iihf world championship", "iihf world championships", "ice hockey world championship"),
)

internal object FeaturedSports {
    fun isVirtualFootball(league: String): Boolean =
        normalized(league).substringBefore(' ') in setOf("esoccer", "e-soccer", "virtual", "simulated")

    fun isEsports(match: MatchCardModel) = match.sport == "esports" ||
        (match.sport == "football" && isVirtualFootball(match.league))

    fun tier(match: MatchCardModel): Int {
        if (isEsports(match)) return 3
        val league = normalized(match.league)
        if (match.sport != "football") return if (league in majorOtherSports[match.sport].orEmpty()) 0 else 1
        if (league in nationalCompetitions || league in internationalClubCompetitions || league in qualifiedDomestic) return 0
        if ((match.competitionId ?: match.competitionBadge?.canonicalId) == BundledFootballBadges.PREMIER_LEAGUE_ID) return 0
        val country = SportsRegions.code(match.country)
        if (country != null && majorDomestic[league] == country) return 0
        return if (league in lowerFootball) 2 else 1
    }

    fun ordered(matches: List<MatchCardModel>): List<MatchCardModel> {
        val ranks = matches.map(::tier)
        // PR #92 communicates its ranking via the order of the event array.
        if (ranks.zipWithNext().all { (first, second) -> first <= second }) return matches
        return matches.sortedWith(
            compareBy<MatchCardModel>(::tier).thenByDescending { it.isLive }
                .thenBy { if (it.isLive) Long.MIN_VALUE else it.kickoffEpochMs ?: Long.MAX_VALUE },
        )
    }
}

internal object SportsRegions {
    private val iso = Locale.getISOCountries().map { it.lowercase(Locale.ROOT) }.toSet()
    private val aliases = mapOf(
        "england" to "eng", "англия" to "eng", "gb-eng" to "eng",
        "scotland" to "sco", "шотландия" to "sco", "gb-sct" to "sco",
        "wales" to "wal", "уэльс" to "wal", "gb-wls" to "wal",
        "northern ireland" to "nir", "северная ирландия" to "nir", "gb-nir" to "nir",
        "uk" to "gb", "spain" to "es", "испания" to "es", "germany" to "de", "france" to "fr",
        "italy" to "it", "turkey" to "tr", "türkiye" to "tr", "czechia" to "cz",
    )
    private val localNames = mapOf(
        "eng" to "Англия", "sco" to "Шотландия", "wal" to "Уэльс", "nir" to "Северная Ирландия",
        "eu" to "Европа", "international" to "Международные", "world" to "Международные",
    )
    private val nationalTeams = mapOf(
        "turkey" to "tr", "türkiye" to "tr", "turkiye" to "tr", "турция" to "tr",
        "belgium" to "be", "бельгия" to "be", "italy" to "it", "италия" to "it",
        "france" to "fr", "франция" to "fr", "england" to "eng", "англия" to "eng",
        "spain" to "es", "испания" to "es", "armenia" to "am", "армения" to "am",
        "cyprus" to "cy", "кипр" to "cy", "croatia" to "hr", "хорватия" to "hr",
        "czech republic" to "cz", "czechia" to "cz", "чехия" to "cz",
    )

    fun code(raw: String): String? {
        val key = normalized(raw)
        return aliases[key] ?: key.takeIf { it in iso || it in setOf("eng", "sco", "wal", "nir") }
    }

    fun name(raw: String): String {
        val key = normalized(raw)
        val code = code(raw)
        return localNames[code ?: key]
            ?: code?.let { Locale.Builder().setRegion(it.uppercase(Locale.ROOT)).build().getDisplayCountry(Locale.forLanguageTag("ru")) }
            ?: raw.trim().ifEmpty { "Международные" }
    }

    fun nationalTeam(match: MatchCardModel, name: String): String? {
        if (match.sport != "football" || normalized(match.league) !in nationalCompetitions) return null
        return nationalTeams[normalized(name)]
    }

    fun emoji(code: String): String? = when (code) {
        "sco" -> "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F"
        "wal" -> "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73\uDB40\uDC7F"
        in iso -> code.uppercase(Locale.ROOT).map { String(Character.toChars(0x1F1E6 + it.code - 'A'.code)) }.joinToString("")
        else -> null
    }
}

@Composable
internal fun SportsFlag(code: String?, modifier: Modifier, placeholder: @Composable () -> Unit = {}) {
    val emoji = code?.let(SportsRegions::emoji)
    when {
        code == "eng" -> Canvas(modifier.semantics { contentDescription = "Англия" }) {
            val height = size.width * 0.6f
            val top = (size.height - height) / 2
            drawRect(Color.White, Offset(0f, top), Size(size.width, height))
            drawRect(Color(0xFFCE1126), Offset(0f, top + height * 0.4f), Size(size.width, height * 0.2f))
            drawRect(Color(0xFFCE1126), Offset(size.width * 0.44f, top), Size(size.width * 0.12f, height))
        }
        emoji != null -> Box(modifier, contentAlignment = Alignment.Center) {
            Text(emoji, fontSize = 18.sp, maxLines = 1)
        }
        else -> placeholder()
    }
}
