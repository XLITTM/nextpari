package com.nextpari.app.feature.home

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nextpari.app.R

object HomePromoLayout {
    val MinWidth = 105.dp
    val MaxWidth = 118.dp
    val Gap = 8.dp
    val Corner = 12.dp
    val Shadow = 2.dp
    val ImageHeight = 78.dp
    fun cardWidth(available: Dp): Dp = (available * 0.28f).coerceIn(MinWidth, MaxWidth)
    fun imageInset(drawableName: String): Dp = when (drawableName) {
        "promo_tiger" -> 12.dp
        else -> 4.dp
    }
}

object SportIconRes {
    val knownIds = listOf(
        "all", "football", "futsal", "basketball", "tennis", "table-tennis", "badminton",
        "baseball", "polo", "cricket", "beach-volleyball", "snooker", "elections",
        "pickleball", "fifa", "mk", "polybet", "ufc", "filter", "hockey", "volleyball", "esports",
    )

    fun drawable(sportId: String): Int = when {
        sportId.startsWith("esports") -> R.drawable.ic_sport_esports
        else -> when (sportId) {
            "all" -> R.drawable.ic_sport_all
            "football", "futsal" -> R.drawable.ic_sport_football
            "tennis" -> R.drawable.ic_sport_tennis
            "basketball" -> R.drawable.ic_sport_basketball
            "hockey" -> R.drawable.ic_sport_hockey
            "volleyball", "beach-volleyball" -> R.drawable.ic_sport_volleyball
            "table-tennis" -> R.drawable.ic_sport_table_tennis
            "badminton" -> R.drawable.ic_sport_badminton
            "baseball" -> R.drawable.ic_sport_baseball
            "polo" -> R.drawable.ic_sport_polo
            "cricket" -> R.drawable.ic_sport_cricket
            "snooker" -> R.drawable.ic_sport_snooker
            "elections" -> R.drawable.ic_sport_elections
            "pickleball" -> R.drawable.ic_sport_pickleball
            "fifa" -> R.drawable.ic_sport_fifa
            "mk" -> R.drawable.ic_sport_mk
            "polybet" -> R.drawable.ic_sport_polybet
            "ufc", "mma" -> R.drawable.ic_sport_ufc
            "filter" -> R.drawable.ic_sport_filter
            "handball" -> R.drawable.ic_sport_handball
            "darts" -> R.drawable.ic_sport_darts
            "american-football" -> R.drawable.ic_sport_american_football
            "rugby", "rugby-league" -> R.drawable.ic_sport_rugby
            "aussie-rules" -> R.drawable.ic_sport_aussie_rules
            "floorball" -> R.drawable.ic_sport_floorball
            "squash" -> R.drawable.ic_sport_squash
            "horse-racing" -> R.drawable.ic_sport_horse_racing
            "greyhounds" -> R.drawable.ic_sport_greyhounds
            "bowls" -> R.drawable.ic_sport_bowls
            "boxing" -> R.drawable.ic_sport_boxing
            "gaelic-sports" -> R.drawable.ic_sport_gaelic
            else -> R.drawable.ic_sport_default
        }
    }
}

data class HomePromo(
    val title: String,
    val route: String,
    val drawableName: String,
) {
    val imageRes: Int
        get() = when (drawableName) {
            "promo_marathon" -> R.drawable.promo_marathon
            "promo_tiger" -> R.drawable.promo_tiger
            "promo_welcome" -> R.drawable.promo_welcome
            "promo_unbeatable" -> R.drawable.promo_unbeatable
            else -> R.drawable.promo_marathon
        }
}

object HomePromoCatalog {
    val items: List<HomePromo> = listOf(
        HomePromo("Марафон Экспрессов", "promo-marathon", "promo_marathon"),
        HomePromo("100% Бонус на депозит", "promo-details", "promo_tiger"),
        HomePromo("Приветственный пакет", "promo-welcome", "promo_welcome"),
        HomePromo("Непобедимый", "promo-unbeatable", "promo_unbeatable"),
    )
}

data class HomeSport(val id: String, val name: String)

data class EsportsDiscipline(
    val id: String,
    val name: String,
    val startColor: Long,
    val endColor: Long,
    val discipline: String,
    val imageRes: Int,
    val bakedInTitle: Boolean = false,
) {
    val destination: String
        get() = com.nextpari.app.core.navigation.Destinations.championships("esports-$discipline", "live")
}

object EsportsCatalog {
    val disciplines: List<EsportsDiscipline> = listOf(
        EsportsDiscipline("cs2", "CS 2", 0xFF334155, 0xFF020617, "cs2", R.drawable.esports_cs2, bakedInTitle = true),
        EsportsDiscipline("dota2", "Dota 2", 0xFF9F1239, 0xFF450A0A, "dota2", R.drawable.esports_dota2, bakedInTitle = true),
        EsportsDiscipline("lol", "League of Legends", 0xFF1D4ED8, 0xFF0F172A, "lol", R.drawable.esports_lol),
        EsportsDiscipline("valorant", "Valorant", 0xFFBE123C, 0xFF1C1917, "valorant", R.drawable.esports_valorant),
    )
}
