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
)

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
            subtitle = "Игры появятся после подключения провайдера",
            drawableName = "game_pharaoh",
            destination = Destinations.SLOTS,
        ),
        CasinoFeatureCard(
            id = "feat-live",
            title = "Лайв казино",
            subtitle = "Столы появятся после подключения провайдера",
            drawableName = "game_dice",
            destination = Destinations.LIVE_CASINO,
        ),
    )

    val tournaments: List<CasinoTournament> = listOf(
        CasinoTournament(
            id = "soon-slots",
            title = "Турниры слотов",
            prizePool = null,
            status = CasinoTournamentStatus.SOON,
            countdown = null,
            drawableName = "promo_tiger",
        ),
        CasinoTournament(
            id = "soon-live",
            title = "Турниры лайв казино",
            prizePool = null,
            status = CasinoTournamentStatus.SOON,
            countdown = null,
            drawableName = "game_crystal",
        ),
    )

    val categories: List<CasinoCategoryCard> = listOf(
        CasinoCategoryCard("slots", "Слоты", Destinations.SLOTS, 0xFF8B5CF6, 0xFF6D28D9),
        CasinoCategoryCard("live", "Лайв казино", Destinations.LIVE_CASINO, 0xFFEF4444, 0xFFBE123C),
        CasinoCategoryCard("tv", "TV игры", Destinations.GAMES, 0xFF3B82F6, 0xFF1E3A8A),
        CasinoCategoryCard("bingo", "Бинго", Destinations.SLOTS, 0xFF22C55E, 0xFF047857),
    )
}
