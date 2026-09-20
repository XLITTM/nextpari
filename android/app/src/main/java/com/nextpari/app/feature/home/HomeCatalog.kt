package com.nextpari.app.feature.home

import com.nextpari.app.R

object SportIconRes {
    fun drawable(sportId: String): Int = when (sportId) {
        "all" -> R.drawable.ic_sport_all
        "football", "futsal" -> R.drawable.ic_sport_football
        "tennis" -> R.drawable.ic_sport_tennis
        "basketball" -> R.drawable.ic_sport_basketball
        "hockey" -> R.drawable.ic_sport_hockey
        "volleyball", "beach-volleyball" -> R.drawable.ic_sport_volleyball
        "esports" -> R.drawable.ic_sport_esports
        else -> R.drawable.ic_sport_default
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
)

object EsportsCatalog {
    val disciplines: List<EsportsDiscipline> = listOf(
        EsportsDiscipline("d1", "CS 2", 0xFF475569, 0xFF0F172A),
        EsportsDiscipline("d2", "Dota 2", 0xFFDC2626, 0xFF7F1D1D),
        EsportsDiscipline("d3", "League of Legends", 0xFF06B6D4, 0xFF1E40AF),
        EsportsDiscipline("d4", "Valorant", 0xFFEC4899, 0xFF9F1239),
    )
}
