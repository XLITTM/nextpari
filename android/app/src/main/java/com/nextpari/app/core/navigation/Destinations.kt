package com.nextpari.app.core.navigation

object Destinations {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val REGISTER_EMAIL = "register/email"
    const val REGISTER_PHONE = "register/phone"
    const val REGISTER_ONE_CLICK = "register/one-click"
    const val REGISTER_ONE_CLICK_RESULT = "register/one-click-result"
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
    const val DEBUG_SPORTSBOOK_PREVIEW = "debug/sportsbook-preview"
    const val INBOX_PLACEHOLDER = "inbox-placeholder"

    val unauthenticated = listOf(
        LOGIN,
        REGISTER,
        REGISTER_EMAIL,
        REGISTER_PHONE,
        REGISTER_ONE_CLICK,
        REGISTER_ONE_CLICK_RESULT,
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
     * Bottom tab that should stay lit for [route].
     *
     * Sports, casino, and Games children belong to Популярное. Bet details belong
     * to История. Info and inbox belong to Меню. Wallet, settings, promo, and the
     * wallet list can be opened from more than one tab, so they follow [ancestors]
     * from the nearest parent to the root. An unknown route stays on Home.
     */
    fun bottomNavActiveRoute(route: String?, ancestors: List<String> = emptyList()): String {
        val chain = buildList {
            ancestors.forEach { add(it) }
            if (route != null && (isEmpty() || last() != route)) add(route)
        }
        for (candidate in chain.asReversed()) {
            fixedBottomTab(candidate)?.let { return it }
        }
        return HOME
    }

    private fun fixedBottomTab(route: String): String? {
        val value = route.substringBefore("?")
        if (value in bottomNavRoutes) return value
        if (value == BET_DETAILS || value.startsWith("bet-details")) return HISTORY
        if (isHomeOwned(value)) return HOME
        if (value == INFO || value == INBOX_PLACEHOLDER) return MENU
        return null
    }

    private fun isHomeOwned(route: String): Boolean {
        if (route == MATCH || route.startsWith("match/")) return true
        if (route == LEAGUE || route.startsWith("league/")) return true
        if (route == CHAMPIONSHIPS || route.startsWith("championships/")) return true
        if (route.startsWith("gamelist/")) return true
        if (route.startsWith("sports/")) return true
        return route in homeOwnedExact
    }

    private val homeOwnedExact = setOf(
        GAMES, BLACKJACK, AVIATOR, APPLES, CRYSTAL, DICE, PHARAOH, VIP_CASHBACK,
        PROMO_DETAILS, PROMO_MARATHON, PROMO_WELCOME, PROMO_UNBEATABLE,
        SLOTS, LIVE_CASINO, PROVIDER_SPORTSBOOK,
    )

    fun showsHeader(route: String?): Boolean =
        route == HOME || route == FAVORITES || route?.startsWith("home") == true

    fun showsMainTabs(route: String?): Boolean = route == HOME

    fun match(matchId: String) = "match/$matchId"
    fun betDetails(betId: String) = "bet-details/$betId"
    fun championships(sport: String, mode: String) = "championships/$sport/$mode"
    fun league(leagueId: String): String {
        val encoded = java.net.URLEncoder.encode(leagueId, Charsets.UTF_8.name()).replace("+", "%20")
        return "league/$encoded"
    }

    fun isConcreteNavigationTarget(route: String): Boolean =
        route.isNotBlank() && '{' !in route && '}' !in route

    fun isPatternRoute(route: String): Boolean = '{' in route || '}' in route
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
