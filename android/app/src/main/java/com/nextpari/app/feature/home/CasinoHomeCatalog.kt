package com.nextpari.app.feature.home

import com.nextpari.app.R
import com.nextpari.app.core.navigation.Destinations

data class CasinoFeatureCard(
    val id: String,
    val title: String,
    val subtitle: String,
    val drawableName: String,
    val destination: String,
    val badge: String? = null,
) {
    val imageRes: Int
        get() = when (drawableName) {
            "promo_welcome" -> R.drawable.promo_welcome
            "promo_marathon" -> R.drawable.promo_marathon
            "promo_tiger" -> R.drawable.promo_tiger
            "promo_unbeatable" -> R.drawable.promo_unbeatable
            "game_pharaoh" -> R.drawable.game_pharaoh
            "game_apples" -> R.drawable.game_apples
            "game_dice" -> R.drawable.game_dice
            else -> R.drawable.promo_welcome
        }
}

enum class CasinoTournamentStatus {
    ACTIVE,
    SOON,
    FINISHED,
    ;

    val label: String
        get() = when (this) {
            ACTIVE -> "Активный"
            SOON -> "Скоро"
            FINISHED -> "Завершён"
        }
}

data class CasinoTournament(
    val id: String,
    val title: String,
    val prizePool: String? = null,
    val status: CasinoTournamentStatus = CasinoTournamentStatus.SOON,
    val countdown: String? = null,
    val drawableName: String,
    val destination: String = Destinations.PROMO,
    val progress: Float? = null,
) {
    val imageRes: Int
        get() = when (drawableName) {
            "promo_tiger" -> R.drawable.promo_tiger
            "promo_unbeatable" -> R.drawable.promo_unbeatable
            "game_crystal" -> R.drawable.game_crystal
            else -> R.drawable.promo_tiger
        }
}

data class CasinoCategoryCard(
    val id: String,
    val name: String,
    val destination: String,
    val startColor: Long,
    val endColor: Long,
    val drawableName: String,
) {
    val imageRes: Int
        get() = when (drawableName) {
            "game_pharaoh" -> R.drawable.game_pharaoh
            "game_blackjack" -> R.drawable.game_blackjack
            "game_crystal" -> R.drawable.game_crystal
            "game_apples" -> R.drawable.game_apples
            else -> R.drawable.game_pharaoh
        }
}

object CasinoHomeCatalog {
    val features: List<CasinoFeatureCard> = listOf(
        CasinoFeatureCard(
            id = "feat-welcome",
            title = "Приветственный пакет",
            subtitle = "Бонус на первый депозит",
            drawableName = "promo_welcome",
            destination = Destinations.PROMO_WELCOME,
            badge = "Promo",
        ),
        CasinoFeatureCard(
            id = "feat-slots",
            title = "Слоты",
            subtitle = "Каталог слотов NextPari",
            drawableName = "game_pharaoh",
            destination = Destinations.SLOTS,
        ),
        CasinoFeatureCard(
            id = "feat-live",
            title = "Лайв казино",
            subtitle = "Каталог Live Casino",
            drawableName = "game_dice",
            destination = Destinations.LIVE_CASINO,
        ),
    )

    val tournaments: List<CasinoTournament> = emptyList()

    val categories: List<CasinoCategoryCard> = listOf(
        CasinoCategoryCard("slots", "Слоты", Destinations.SLOTS, 0xFF8B5CF6, 0xFF6D28D9, "game_pharaoh"),
        CasinoCategoryCard("live", "Лайв казино", Destinations.LIVE_CASINO, 0xFFEF4444, 0xFFBE123C, "game_blackjack"),
        CasinoCategoryCard("categories", "Категории", Destinations.CASINO_CATEGORIES, 0xFF3B82F6, 0xFF1E3A8A, "game_crystal"),
        CasinoCategoryCard("providers", "Провайдеры", Destinations.CASINO_PROVIDERS, 0xFF22C55E, 0xFF047857, "game_apples"),
    )
}
