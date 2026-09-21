package com.nextpari.app.core.ui.icons

import androidx.compose.ui.graphics.Color
import com.nextpari.app.core.navigation.Destinations

/**
 * Single Premium icon color source. Screens must not invent one-off hex tints.
 */
object NextpariIconPalette {
    val FallbackGreen = Color(0xFF16D982)
    val WhiteOnAccent = Color.White

    object Sport {
        val All = Color(0xFF16D982)
        val Football = Color(0xFF20B86A)
        val Futsal = Color(0xFF00BFA6)
        val Tennis = Color(0xFFB7D900)
        val Basketball = Color(0xFFFF7A1A)
        val Hockey = Color(0xFF2F9BFF)
        val Volleyball = Color(0xFF8B5CF6)
        val BeachVolleyball = Color(0xFF06B6D4)
        val Esports = Color(0xFF00CFA5)
        val TableTennis = Color(0xFF14B8A6)
        val Badminton = Color(0xFFF59E0B)
        val Baseball = Color(0xFFF43F5E)
        val Polo = Color(0xFFA855F7)
        val Cricket = Color(0xFF65A30D)
        val Snooker = Color(0xFF7C3AED)
        val Pickleball = Color(0xFFEAB308)
        val Ufc = Color(0xFFEF4444)
        val Mma = Color(0xFFEF4444)
        val Fifa = Color(0xFF22C55E)
        val Mk = Color(0xFFE11D48)
        val Polybet = Color(0xFF6366F1)
        val Elections = Color(0xFF3B82F6)
        val Filter = Color(0xFF64748B)

        val productionIds: List<String> = listOf(
            "all", "football", "tennis", "basketball", "hockey", "volleyball", "esports",
            "table-tennis", "badminton", "baseball", "polo", "cricket", "beach-volleyball",
            "snooker", "futsal", "elections", "pickleball", "fifa", "mk", "polybet", "ufc", "filter",
        )

        fun of(sportId: String): Color = when (sportId) {
            "all" -> All
            "football" -> Football
            "futsal" -> Futsal
            "tennis" -> Tennis
            "basketball" -> Basketball
            "hockey" -> Hockey
            "volleyball" -> Volleyball
            "beach-volleyball" -> BeachVolleyball
            "esports" -> Esports
            "table-tennis" -> TableTennis
            "badminton" -> Badminton
            "baseball" -> Baseball
            "polo" -> Polo
            "cricket" -> Cricket
            "snooker" -> Snooker
            "pickleball" -> Pickleball
            "ufc" -> Ufc
            "mma" -> Mma
            "fifa" -> Fifa
            "mk" -> Mk
            "polybet" -> Polybet
            "elections" -> Elections
            "filter" -> Filter
            else -> FallbackGreen
        }
    }

    object MainTab {
        val Top = Color(0xFFD59A36)
        val SportTab = Color(0xFF22B86A)
        val Esports = Color(0xFF7C5CFC)
        val Casino = Color(0xFFEC4899)
        val Games = Color(0xFF06A9D8)
        const val InactiveAlpha = 0.65f

        fun of(id: String): Color = when (id) {
            "top" -> Top
            "sport" -> SportTab
            "esports" -> Esports
            "casino" -> Casino
            "games" -> Games
            else -> FallbackGreen
        }
    }

    object BottomNav {
        val Popular = Color(0xFFF59E0B)
        val Favorites = Color(0xFFEC4899)
        val History = Color(0xFF3B82F6)
        val Menu = Color(0xFF8B5CF6)
        const val InactiveAlpha = 0.50f

        fun of(route: String): Color = when (route) {
            Destinations.HOME -> Popular
            Destinations.FAVORITES -> Favorites
            Destinations.HISTORY -> History
            Destinations.MENU -> Menu
            else -> FallbackGreen
        }
    }

    object Header {
        val Add = Color(0xFF16A34A)
        val Theme = Color(0xFF6366F1)
        val Settings = Color(0xFF14B8A6)
        val Search = Color(0xFF3B82F6)
        val WalletChevron = Color(0xFF64748B)
    }

    object Menu {
        val Live = Color(0xFFF97316)
        val Line = Color(0xFF3B82F6)
        val Esports = Color(0xFF8B5CF6)
        val Slots = Color(0xFFD946EF)
        val LiveCasino = Color(0xFFD59A36)
        val Games = Color(0xFF06B6D4)
        val Promo = Color(0xFFF97316)
        val Unbeatable = Color(0xFFD59A36)
        val Support = Color(0xFF3B82F6)
        val Authenticator = Color(0xFF6366F1)
        val Toto = Color(0xFF14B8A6)
        val Finance = Color(0xFF10B981)
        val BetBuilder = Color(0xFF8B5CF6)
        val Scanner = Color(0xFF06B6D4)
        val Notifications = Color(0xFFF59E0B)
        val Info = Color(0xFF3B82F6)
        val Wallet = Color(0xFF22C55E)
        val Security = Color(0xFFF97316)
        val Stream = Color(0xFF3B82F6)
        val Trophy = Color(0xFFD59A36)
        val Provider = Color(0xFF22B86A)
        val Aviator = Color(0xFFEF4444)
        val Profile = Color(0xFF0EA5E9)
        val Mail = Color(0xFF3B82F6)
        val Settings = Color(0xFF14B8A6)

        fun of(label: String): Color = when (label) {
            "LIVE" -> Live
            "Линия" -> Line
            "Киберспорт" -> Esports
            "Слоты" -> Slots
            "Лайв казино" -> LiveCasino
            "Games" -> Games
            "Промокоды", "Промо", "Promo", "Акции" -> Promo
            "Непобедимый" -> Unbeatable
            "Поддержка" -> Support
            "Аутентификатор" -> Authenticator
            "Повысьте безопасность!" -> Security
            "ТОТО" -> Toto
            "Финставки" -> Finance
            "Бетконструктор" -> BetBuilder
            "Сканер купонов" -> Scanner
            "Уведомления" -> Notifications
            "Инфо" -> Info
            "Управление счетом" -> Wallet
            "Стрим" -> Stream
            "Экспресс дня", "Результаты", "Ставь на своих", "Турниры" -> Trophy
            "Спортбук провайдера" -> Provider
            "Aviator" -> Aviator
            "My casino", "Категории", "Провайдеры" -> LiveCasino
            "Топ" -> MainTab.Top
            "Спорт" -> MainTab.SportTab
            "Казино" -> MainTab.Casino
            "Разное" -> Color(0xFF64748B)
            else -> FallbackGreen
        }
    }

    object Action {
        val Live = Color(0xFFEF4444)
        val Star = Color(0xFFD59A36)
        val Bell = Color(0xFFF59E0B)
        val Pin = Color(0xFF8B5CF6)
        val Lock = Color(0xFF94A3B8)
        val Stream = Color(0xFF3B82F6)
        val Search = Color(0xFF3B82F6)
        val Filter = Color(0xFF14B8A6)
        val Globe = Color(0xFF06B6D4)
        val Trophy = Color(0xFFD59A36)
        val Security = Color(0xFF6366F1)
        val Email = Color(0xFF3B82F6)
        val BetSettings = Color(0xFF22C55E)
        val AppSettings = Color(0xFF8B5CF6)
        val Share = Color(0xFF06B6D4)
        val Deposit = Color(0xFF22C55E)
        val Withdraw = Color(0xFFF97316)
        val Wallet = Color(0xFF3B82F6)
        val Currency = Color(0xFF14B8A6)
        val Profile = Color(0xFF0EA5E9)
        val Document = Color(0xFF8B5CF6)
        val Place = Color(0xFFF97316)
        val Check = Color(0xFF22C55E)
        val Info = Color(0xFF3B82F6)
        val Book = Color(0xFF8B5CF6)
        val Payments = Color(0xFF22C55E)
        val Support = Color(0xFF06B6D4)
        val Casino = Color(0xFFEC4899)
        val Games = Color(0xFF06B6D4)
        val Promo = Color(0xFFF97316)
        val Vip = Color(0xFFD59A36)
        val Cashback = Color(0xFF22C55E)
        val Chevron = Color(0xFF64748B)
        val Logout = Color(0xFFEF4444)
        val Key = Color(0xFF6366F1)
        val Language = Color(0xFF06B6D4)
        val Notifications = Color(0xFFF59E0B)
        val Password = Color(0xFF6366F1)
        val Odds = Color(0xFF22C55E)
        val Gift = Color(0xFFEC4899)
        val Heart = Color(0xFFEC4899)
        val Bolt = Color(0xFFF59E0B)
        val Bitcoin = Color(0xFFF59E0B)
        val Eye = Color(0xFF64748B)
        fun forChrome(description: String): Color = when (description) {
            "Поиск" -> Search
            "Страна" -> Globe
            "Трансляции" -> Stream
            "Назад" -> Chevron
            else -> Search
        }
    }

    fun containerAlpha(isDark: Boolean): Float = if (isDark) 0.17f else 0.11f

    fun container(color: Color, isDark: Boolean): Color = color.copy(alpha = containerAlpha(isDark))

    fun isRawBlack(color: Color): Boolean =
        color == Color.Black || color == Color(0xFF0F172A) || color == Color(0xFF000000)
}
