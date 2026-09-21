package com.nextpari.app.core.ui.icons

import com.nextpari.app.R
import com.nextpari.app.core.navigation.Destinations

data class NextpariReferenceIconSpec(
    val key: String,
    val group: String,
    val darkRes: Int,
    val lightRes: Int,
    val sizeDp: Int,
    val renderMode: String,
)

object NextpariReferenceIconAssets {
    val specs: Map<String, NextpariReferenceIconSpec> = mapOf(
        "bottom_popular" to NextpariReferenceIconSpec(
            key = "bottom_popular",
            group = "bottom_nav",
            darkRes = R.drawable.np_ref_dark_bottom_popular,
            lightRes = R.drawable.np_ref_light_bottom_popular,
            sizeDp = 22,
            renderMode = "accent",
        ),
        "bottom_favorites" to NextpariReferenceIconSpec(
            key = "bottom_favorites",
            group = "bottom_nav",
            darkRes = R.drawable.np_ref_dark_bottom_favorites,
            lightRes = R.drawable.np_ref_light_bottom_favorites,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "bottom_betslip" to NextpariReferenceIconSpec(
            key = "bottom_betslip",
            group = "bottom_nav",
            darkRes = R.drawable.np_ref_dark_bottom_betslip,
            lightRes = R.drawable.np_ref_light_bottom_betslip,
            sizeDp = 24,
            renderMode = "accent",
        ),
        "bottom_history" to NextpariReferenceIconSpec(
            key = "bottom_history",
            group = "bottom_nav",
            darkRes = R.drawable.np_ref_dark_bottom_history,
            lightRes = R.drawable.np_ref_light_bottom_history,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "bottom_menu" to NextpariReferenceIconSpec(
            key = "bottom_menu",
            group = "bottom_nav",
            darkRes = R.drawable.np_ref_dark_bottom_menu,
            lightRes = R.drawable.np_ref_light_bottom_menu,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "tab_top" to NextpariReferenceIconSpec(
            key = "tab_top",
            group = "main_tabs",
            darkRes = R.drawable.np_ref_dark_tab_top,
            lightRes = R.drawable.np_ref_light_tab_top,
            sizeDp = 22,
            renderMode = "accent",
        ),
        "tab_sport" to NextpariReferenceIconSpec(
            key = "tab_sport",
            group = "main_tabs",
            darkRes = R.drawable.np_ref_dark_tab_sport,
            lightRes = R.drawable.np_ref_light_tab_sport,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "tab_esports" to NextpariReferenceIconSpec(
            key = "tab_esports",
            group = "main_tabs",
            darkRes = R.drawable.np_ref_dark_tab_esports,
            lightRes = R.drawable.np_ref_light_tab_esports,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "tab_casino" to NextpariReferenceIconSpec(
            key = "tab_casino",
            group = "main_tabs",
            darkRes = R.drawable.np_ref_dark_tab_casino,
            lightRes = R.drawable.np_ref_light_tab_casino,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "tab_games" to NextpariReferenceIconSpec(
            key = "tab_games",
            group = "main_tabs",
            darkRes = R.drawable.np_ref_dark_tab_games,
            lightRes = R.drawable.np_ref_light_tab_games,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "sport_football" to NextpariReferenceIconSpec(
            key = "sport_football",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_football,
            lightRes = R.drawable.np_ref_light_sport_football,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_tennis" to NextpariReferenceIconSpec(
            key = "sport_tennis",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_tennis,
            lightRes = R.drawable.np_ref_light_sport_tennis,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_basketball" to NextpariReferenceIconSpec(
            key = "sport_basketball",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_basketball,
            lightRes = R.drawable.np_ref_light_sport_basketball,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_hockey" to NextpariReferenceIconSpec(
            key = "sport_hockey",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_hockey,
            lightRes = R.drawable.np_ref_light_sport_hockey,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_volleyball" to NextpariReferenceIconSpec(
            key = "sport_volleyball",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_volleyball,
            lightRes = R.drawable.np_ref_light_sport_volleyball,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_esports" to NextpariReferenceIconSpec(
            key = "sport_esports",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_esports,
            lightRes = R.drawable.np_ref_light_sport_esports,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_futsal" to NextpariReferenceIconSpec(
            key = "sport_futsal",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_futsal,
            lightRes = R.drawable.np_ref_light_sport_futsal,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_table_tennis" to NextpariReferenceIconSpec(
            key = "sport_table_tennis",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_table_tennis,
            lightRes = R.drawable.np_ref_light_sport_table_tennis,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_badminton" to NextpariReferenceIconSpec(
            key = "sport_badminton",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_badminton,
            lightRes = R.drawable.np_ref_light_sport_badminton,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_baseball" to NextpariReferenceIconSpec(
            key = "sport_baseball",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_baseball,
            lightRes = R.drawable.np_ref_light_sport_baseball,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_cricket" to NextpariReferenceIconSpec(
            key = "sport_cricket",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_cricket,
            lightRes = R.drawable.np_ref_light_sport_cricket,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_polo" to NextpariReferenceIconSpec(
            key = "sport_polo",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_polo,
            lightRes = R.drawable.np_ref_light_sport_polo,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_snooker" to NextpariReferenceIconSpec(
            key = "sport_snooker",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_snooker,
            lightRes = R.drawable.np_ref_light_sport_snooker,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_pickleball" to NextpariReferenceIconSpec(
            key = "sport_pickleball",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_pickleball,
            lightRes = R.drawable.np_ref_light_sport_pickleball,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_ufc_mma" to NextpariReferenceIconSpec(
            key = "sport_ufc_mma",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_ufc_mma,
            lightRes = R.drawable.np_ref_light_sport_ufc_mma,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_beach_volleyball" to NextpariReferenceIconSpec(
            key = "sport_beach_volleyball",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_beach_volleyball,
            lightRes = R.drawable.np_ref_light_sport_beach_volleyball,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_fifa" to NextpariReferenceIconSpec(
            key = "sport_fifa",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_fifa,
            lightRes = R.drawable.np_ref_light_sport_fifa,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_mk" to NextpariReferenceIconSpec(
            key = "sport_mk",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_mk,
            lightRes = R.drawable.np_ref_light_sport_mk,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_polybet" to NextpariReferenceIconSpec(
            key = "sport_polybet",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_polybet,
            lightRes = R.drawable.np_ref_light_sport_polybet,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_elections" to NextpariReferenceIconSpec(
            key = "sport_elections",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_elections,
            lightRes = R.drawable.np_ref_light_sport_elections,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_filter" to NextpariReferenceIconSpec(
            key = "sport_filter",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_filter,
            lightRes = R.drawable.np_ref_light_sport_filter,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "sport_all" to NextpariReferenceIconSpec(
            key = "sport_all",
            group = "sports",
            darkRes = R.drawable.np_ref_dark_sport_all,
            lightRes = R.drawable.np_ref_light_sport_all,
            sizeDp = 28,
            renderMode = "preserve",
        ),
        "menu_profile" to NextpariReferenceIconSpec(
            key = "menu_profile",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_profile,
            lightRes = R.drawable.np_ref_light_menu_profile,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_messages" to NextpariReferenceIconSpec(
            key = "menu_messages",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_messages,
            lightRes = R.drawable.np_ref_light_menu_messages,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_settings" to NextpariReferenceIconSpec(
            key = "menu_settings",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_settings,
            lightRes = R.drawable.np_ref_light_menu_settings,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_account" to NextpariReferenceIconSpec(
            key = "menu_account",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_account,
            lightRes = R.drawable.np_ref_light_menu_account,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_deposit" to NextpariReferenceIconSpec(
            key = "menu_deposit",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_deposit,
            lightRes = R.drawable.np_ref_light_menu_deposit,
            sizeDp = 22,
            renderMode = "accent",
        ),
        "menu_live" to NextpariReferenceIconSpec(
            key = "menu_live",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_live,
            lightRes = R.drawable.np_ref_light_menu_live,
            sizeDp = 22,
            renderMode = "accent",
        ),
        "menu_line" to NextpariReferenceIconSpec(
            key = "menu_line",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_line,
            lightRes = R.drawable.np_ref_light_menu_line,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_esports" to NextpariReferenceIconSpec(
            key = "menu_esports",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_esports,
            lightRes = R.drawable.np_ref_light_menu_esports,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_slots" to NextpariReferenceIconSpec(
            key = "menu_slots",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_slots,
            lightRes = R.drawable.np_ref_light_menu_slots,
            sizeDp = 22,
            renderMode = "accent",
        ),
        "menu_live_casino" to NextpariReferenceIconSpec(
            key = "menu_live_casino",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_live_casino,
            lightRes = R.drawable.np_ref_light_menu_live_casino,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_games" to NextpariReferenceIconSpec(
            key = "menu_games",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_games,
            lightRes = R.drawable.np_ref_light_menu_games,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_promo" to NextpariReferenceIconSpec(
            key = "menu_promo",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_promo,
            lightRes = R.drawable.np_ref_light_menu_promo,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "menu_vip" to NextpariReferenceIconSpec(
            key = "menu_vip",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_vip,
            lightRes = R.drawable.np_ref_light_menu_vip,
            sizeDp = 22,
            renderMode = "accent",
        ),
        "menu_cashback" to NextpariReferenceIconSpec(
            key = "menu_cashback",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_cashback,
            lightRes = R.drawable.np_ref_light_menu_cashback,
            sizeDp = 22,
            renderMode = "accent",
        ),
        "menu_support" to NextpariReferenceIconSpec(
            key = "menu_support",
            group = "menu",
            darkRes = R.drawable.np_ref_dark_menu_support,
            lightRes = R.drawable.np_ref_light_menu_support,
            sizeDp = 22,
            renderMode = "neutral",
        ),
        "service_search" to NextpariReferenceIconSpec(
            key = "service_search",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_search,
            lightRes = R.drawable.np_ref_light_service_search,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_notifications" to NextpariReferenceIconSpec(
            key = "service_notifications",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_notifications,
            lightRes = R.drawable.np_ref_light_service_notifications,
            sizeDp = 24,
            renderMode = "accent",
        ),
        "service_light_theme" to NextpariReferenceIconSpec(
            key = "service_light_theme",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_light_theme,
            lightRes = R.drawable.np_ref_light_service_light_theme,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_dark_theme" to NextpariReferenceIconSpec(
            key = "service_dark_theme",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_dark_theme,
            lightRes = R.drawable.np_ref_light_service_dark_theme,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_back" to NextpariReferenceIconSpec(
            key = "service_back",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_back,
            lightRes = R.drawable.np_ref_light_service_back,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_down" to NextpariReferenceIconSpec(
            key = "service_down",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_down,
            lightRes = R.drawable.np_ref_light_service_down,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_close" to NextpariReferenceIconSpec(
            key = "service_close",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_close,
            lightRes = R.drawable.np_ref_light_service_close,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_share" to NextpariReferenceIconSpec(
            key = "service_share",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_share,
            lightRes = R.drawable.np_ref_light_service_share,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_info" to NextpariReferenceIconSpec(
            key = "service_info",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_info,
            lightRes = R.drawable.np_ref_light_service_info,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_security" to NextpariReferenceIconSpec(
            key = "service_security",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_security,
            lightRes = R.drawable.np_ref_light_service_security,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_authenticator" to NextpariReferenceIconSpec(
            key = "service_authenticator",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_authenticator,
            lightRes = R.drawable.np_ref_light_service_authenticator,
            sizeDp = 24,
            renderMode = "neutral",
        ),
        "service_logout" to NextpariReferenceIconSpec(
            key = "service_logout",
            group = "service",
            darkRes = R.drawable.np_ref_dark_service_logout,
            lightRes = R.drawable.np_ref_light_service_logout,
            sizeDp = 24,
            renderMode = "neutral",
        ),
    )

    val keys: List<String> = specs.keys.toList()

    fun spec(key: String): NextpariReferenceIconSpec = specs.getValue(key)
    fun contains(key: String): Boolean = specs.containsKey(key)
    fun res(key: String, dark: Boolean): Int = if (dark) spec(key).darkRes else spec(key).lightRes
    fun appliesTint(key: String): Boolean = false

    fun sportKey(sportId: String): String = when (sportId) {
        "all" -> "sport_all"
        "football" -> "sport_football"
        "futsal" -> "sport_futsal"
        "tennis" -> "sport_tennis"
        "basketball" -> "sport_basketball"
        "hockey" -> "sport_hockey"
        "volleyball" -> "sport_volleyball"
        "beach-volleyball" -> "sport_beach_volleyball"
        "esports" -> "sport_esports"
        "table-tennis" -> "sport_table_tennis"
        "badminton" -> "sport_badminton"
        "baseball" -> "sport_baseball"
        "cricket" -> "sport_cricket"
        "polo" -> "sport_polo"
        "snooker" -> "sport_snooker"
        "pickleball" -> "sport_pickleball"
        "ufc", "mma" -> "sport_ufc_mma"
        "fifa" -> "sport_fifa"
        "mk" -> "sport_mk"
        "polybet" -> "sport_polybet"
        "elections" -> "sport_elections"
        "filter" -> "sport_filter"
        else -> "sport_all"
    }

    fun bottomNavKey(route: String): String = when (route) {
        Destinations.HOME -> "bottom_popular"
        Destinations.FAVORITES -> "bottom_favorites"
        Destinations.BETSLIP -> "bottom_betslip"
        Destinations.HISTORY -> "bottom_history"
        else -> "bottom_menu"
    }

    fun mainTabKey(id: String): String = when (id) {
        "top" -> "tab_top"
        "sport" -> "tab_sport"
        "esports" -> "tab_esports"
        "casino" -> "tab_casino"
        else -> "tab_games"
    }

    fun menuTabKey(label: String): String? = when (label) {
        "Топ" -> "tab_top"
        "Спорт" -> "tab_sport"
        "Казино" -> "tab_casino"
        "Games" -> "tab_games"
        "Разное" -> "bottom_menu"
        else -> null
    }

    fun menuRowKey(label: String): String? = when (label) {
        "LIVE", "Aviator" -> "menu_live"
        "Линия" -> "menu_line"
        "Киберспорт" -> "menu_esports"
        "Слоты" -> "menu_slots"
        "Лайв казино", "My casino", "Категории", "Провайдеры" -> "menu_live_casino"
        "Games" -> "menu_games"
        "Промокоды", "Промо", "Promo", "Акции" -> "menu_promo"
        "Непобедимый", "Турниры" -> "menu_vip"
        "Кешбэк" -> "menu_cashback"
        "Поддержка" -> "menu_support"
        "Инфо" -> "service_info"
        "Управление счетом" -> "menu_account"
        "Аутентификатор" -> "service_authenticator"
        "Повысьте безопасность!" -> "service_security"
        "Уведомления" -> "service_notifications"
        else -> null
    }

    fun iconKey(key: NextpariIconKey): String? = when (key) {
        NextpariIconKey.Popular, NextpariIconKey.Home, NextpariIconKey.Fire -> "bottom_popular"
        NextpariIconKey.Favorites -> "bottom_favorites"
        NextpariIconKey.Betslip, NextpariIconKey.Ticket -> "bottom_betslip"
        NextpariIconKey.History -> "bottom_history"
        NextpariIconKey.Menu, NextpariIconKey.Grid -> "bottom_menu"
        NextpariIconKey.Top -> "tab_top"
        NextpariIconKey.Sport -> "tab_sport"
        NextpariIconKey.Esports -> "tab_esports"
        NextpariIconKey.Casino -> "tab_casino"
        NextpariIconKey.Games -> "tab_games"
        NextpariIconKey.Profile, NextpariIconKey.Person -> "menu_profile"
        NextpariIconKey.Mail, NextpariIconKey.Email -> "menu_messages"
        NextpariIconKey.Settings -> "menu_settings"
        NextpariIconKey.Wallet, NextpariIconKey.Currencies -> "menu_account"
        NextpariIconKey.Add, NextpariIconKey.Deposit, NextpariIconKey.Download -> "menu_deposit"
        NextpariIconKey.Live -> "menu_live"
        NextpariIconKey.Promo, NextpariIconKey.Bonus, NextpariIconKey.Gift -> "menu_promo"
        NextpariIconKey.Vip -> "menu_vip"
        NextpariIconKey.Cashback -> "menu_cashback"
        NextpariIconKey.Support, NextpariIconKey.Headset -> "menu_support"
        NextpariIconKey.Search -> "service_search"
        NextpariIconKey.Notifications -> "service_notifications"
        NextpariIconKey.ThemeLight -> "service_light_theme"
        NextpariIconKey.ThemeDark -> "service_dark_theme"
        NextpariIconKey.Back, NextpariIconKey.ChevronLeft -> "service_back"
        NextpariIconKey.ChevronDown -> "service_down"
        NextpariIconKey.Close -> "service_close"
        NextpariIconKey.Share -> "service_share"
        NextpariIconKey.Info -> "service_info"
        NextpariIconKey.Security, NextpariIconKey.Shield -> "service_security"
        NextpariIconKey.Authenticator, NextpariIconKey.Verified -> "service_authenticator"
        NextpariIconKey.Logout -> "service_logout"
        else -> null
    }

    fun keyForVector(vector: androidx.compose.ui.graphics.vector.ImageVector): String? {
        val name = vector.name
        return NextpariIconKey.entries.firstNotNullOfOrNull { key ->
            val mapped = iconKey(key) ?: return@firstNotNullOfOrNull null
            if (NextpariIcons.vector(key).name == name) mapped else null
        }
    }
}

