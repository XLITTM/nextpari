package com.nextpari.app.core.navigation

object Destinations {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val REGISTER_EMAIL = "register/email"
    const val REGISTER_PHONE = "register/phone"
    const val REGISTER_ONE_CLICK = "register/one-click"
    const val FORGOT_PASSWORD = "forgot-password"

    const val HOME = "home"
    const val MATCH = "match/{matchId}"
    const val BETSLIP = "betslip"
    const val FAVORITES = "favorites"
    const val HISTORY = "history"
    const val BET_DETAILS = "bet-details/{betId}"
    const val MENU = "menu"
    const val WALLET = "wallet"
    const val PROMO = "promo"
    const val PERSONAL_DATA = "personal-data"
    const val WALLETS = "wallets"
    const val GAMELIST_LIVE = "gamelist/live"
    const val GAMELIST_LINE = "gamelist/line"
    const val SPORTS_LIVE = "sports/live"
    const val SPORTS_LINE = "sports/line"
    const val SPORTS_CYBERS = "sports/cybers"
    const val CHAMPIONSHIPS = "championships/{sport}/{mode}"
    const val SLOTS = "slots"
    const val LIVE_CASINO = "live-casino"
    const val PROVIDER_SPORTSBOOK = "provider-sportsbook"
    const val GAMES = "games"
    const val PROMO_DETAILS = "promo-details"
    const val PROMO_MARATHON = "promo-marathon"
    const val PROMO_WELCOME = "promo-welcome"
    const val SETTINGS = "settings"
    const val INFO = "info"
    const val PROMO_UNBEATABLE = "promo-unbeatable"
    const val BLACKJACK = "blackjack"
    const val AVIATOR = "aviator"
    const val APPLES = "apples"
    const val CRYSTAL = "crystal"
    const val DICE = "dice"
    const val PHARAOH = "pharaoh"
    const val VIP_CASHBACK = "vip-cashback"
    const val LEAGUE = "league/{leagueId}"

    val unauthenticated = listOf(
        LOGIN,
        REGISTER,
        REGISTER_EMAIL,
        REGISTER_PHONE,
        REGISTER_ONE_CLICK,
        FORGOT_PASSWORD,
    )

    val bottomNavRoutes = listOf(HOME, FAVORITES, BETSLIP, HISTORY, MENU)

    val webPlayerRoutes = listOf(
        HOME, MATCH, BETSLIP, FAVORITES, HISTORY, BET_DETAILS, MENU, WALLET, PROMO,
        PERSONAL_DATA, WALLETS, GAMELIST_LIVE, GAMELIST_LINE, SPORTS_LIVE, SPORTS_LINE,
        SPORTS_CYBERS, CHAMPIONSHIPS, SLOTS, LIVE_CASINO, PROVIDER_SPORTSBOOK, GAMES,
        PROMO_DETAILS, PROMO_MARATHON, PROMO_WELCOME, SETTINGS, INFO, PROMO_UNBEATABLE,
        BLACKJACK, AVIATOR, APPLES, CRYSTAL, DICE, PHARAOH, VIP_CASHBACK, LEAGUE,
    )

    fun isUnauthenticated(route: String): Boolean = unauthenticated.contains(route)

    fun isBottomNavRoute(route: String?): Boolean {
        val value = route ?: HOME
        return bottomNavRoutes.contains(value)
    }

    /**
     * Mirrors web `navActive` in `src/App.tsx`.
     * Maps a player destination onto the five bottom-nav sections.
     */
    fun bottomNavActiveRoute(route: String?): String {
        val value = route ?: return HOME
        if (value in bottomNavRoutes) return value
        if (value == BET_DETAILS || value.startsWith("bet-details/")) return HISTORY
        if (isHomeParentRoute(value)) return HOME
        return MENU
    }

    private fun isHomeParentRoute(route: String): Boolean {
        if (route == MATCH || route.startsWith("match/")) return true
        if (route == GAMELIST_LIVE || route == GAMELIST_LINE || route.startsWith("gamelist/")) return true
        if (route == LEAGUE || route.startsWith("league/")) return true
        return route in homeParentExact
    }

    private val homeParentExact = setOf(
        GAMES, BLACKJACK, AVIATOR, APPLES, CRYSTAL, DICE, PHARAOH, VIP_CASHBACK,
        PROMO_DETAILS, PROMO_MARATHON, PROMO_WELCOME, PROMO_UNBEATABLE,
    )

    fun showsHeader(route: String?): Boolean =
        route == HOME || route == FAVORITES || route?.startsWith("home") == true

    fun showsMainTabs(route: String?): Boolean = route == HOME

    fun match(matchId: String) = "match/$matchId"
    fun betDetails(betId: String) = "bet-details/$betId"
    fun championships(sport: String, mode: String) = "championships/$sport/$mode"
    fun league(leagueId: String) = "league/$leagueId"
}

data class BottomNavItem(
    val route: String,
    val label: String,
    val center: Boolean = false,
)

object BottomNavSpec {
    val items: List<BottomNavItem> = listOf(
        BottomNavItem(Destinations.HOME, "Популярное"),
        BottomNavItem(Destinations.FAVORITES, "Избранное"),
        BottomNavItem(Destinations.BETSLIP, "Купон", center = true),
        BottomNavItem(Destinations.HISTORY, "История"),
        BottomNavItem(Destinations.MENU, "Меню"),
    )
    val labels: List<String> get() = items.map { it.label }
    val center: BottomNavItem get() = items.first { it.center }
}

data class MainTabSpec(
    val id: String,
    val label: String,
)

object MainTabsSpec {
    val tabs: List<MainTabSpec> = listOf(
        MainTabSpec("top", "Топ"),
        MainTabSpec("sport", "Спорт"),
        MainTabSpec("esports", "Esports"),
        MainTabSpec("casino", "Казино"),
        MainTabSpec("games", "Games"),
    )
    val labels: List<String> get() = tabs.map { it.label }
}
