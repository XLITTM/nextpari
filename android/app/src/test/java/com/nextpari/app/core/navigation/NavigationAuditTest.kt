package com.nextpari.app.core.navigation

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.feature.home.GamesCatalog
import com.nextpari.app.feature.home.HomePromoCatalog
import com.nextpari.app.feature.menu.MenuCatalog
import com.nextpari.app.feature.promo.PromoCatalog
import org.junit.Test
import java.io.File

class NavigationAuditTest {
    @Test
    fun personalDataWalletsAndInfoAreNoLongerPlaceholders() {
        val root = moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText()
        assertThat(root).doesNotContain("placeholder(navController, Destinations.PERSONAL_DATA")
        assertThat(root).doesNotContain("placeholder(navController, Destinations.WALLETS")
        assertThat(root).doesNotContain("placeholder(navController, Destinations.INFO")
        assertThat(root).contains("PersonalDataScreen(")
        assertThat(root).contains("WalletsScreen(")
        assertThat(root).contains("InfoScreen(")
        assertThat(root).contains("onBack = { navController.popBackStack() }")
        assertThat(root).contains("launchSingleTop = true")
        assertThat(root).contains("if (currentDestination?.route == route) return")
    }

    @Test
    fun intentionalPlaceholdersRemainRegistered() {
        val root = moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText()
        listOf(
            Destinations.FAVORITES,
            Destinations.BETSLIP,
            Destinations.BET_DETAILS,
            Destinations.SLOTS,
            Destinations.LIVE_CASINO,
            Destinations.PROVIDER_SPORTSBOOK,
            Destinations.BLACKJACK,
            Destinations.AVIATOR,
            Destinations.APPLES,
            Destinations.CRYSTAL,
            Destinations.DICE,
            Destinations.PHARAOH,
            Destinations.INBOX_PLACEHOLDER,
        ).forEach { route ->
            assertThat(root).contains(routeConstant(route))
        }
        assertThat(root).contains("PlaceholderScreen(\"Избранное\"")
        assertThat(root).contains("PlaceholderScreen(\"Купон\"")
        assertThat(root).contains("placeholder(navController, Destinations.SLOTS")
        assertThat(root).contains("placeholder(navController, Destinations.LIVE_CASINO")
        assertThat(root).contains("placeholder(navController, Destinations.PROVIDER_SPORTSBOOK")
        assertThat(root).contains("composable(Destinations.INBOX_PLACEHOLDER)")
    }

    @Test
    fun clickableCatalogRoutesAreConcreteAndRegistered() {
        val clickable = buildList {
            addAll(MenuCatalog.top.mapNotNull { it.route })
            addAll(MenuCatalog.sport.mapNotNull { it.route })
            addAll(MenuCatalog.casino.mapNotNull { it.route })
            addAll(MenuCatalog.games.mapNotNull { it.route })
            addAll(MenuCatalog.misc.mapNotNull { it.route })
            addAll(GamesCatalog.games.map { it.route })
            addAll(HomePromoCatalog.items.map { it.route })
            addAll(PromoCatalog.menuItems.mapNotNull { it.route })
            add(Destinations.PERSONAL_DATA)
            add(Destinations.WALLETS)
            add(Destinations.SETTINGS)
            add(Destinations.WALLET)
            add(Destinations.INFO)
            add(Destinations.INBOX_PLACEHOLDER)
        }
        clickable.forEach { route ->
            assertThat(Destinations.isConcreteNavigationTarget(route)).isTrue()
            assertThat(isRegistered(route)).isTrue()
        }
        assertThat(clickable).contains(Destinations.PROMO_MARATHON)
        assertThat(clickable).contains(Destinations.PROMO_WELCOME)
        assertThat(clickable).contains(Destinations.PROMO_UNBEATABLE)
        assertThat(clickable).contains(Destinations.PROMO_DETAILS)
        assertThat(clickable).contains(Destinations.VIP_CASHBACK)
    }

    @Test
    fun screensDoNotNavigateToLiteralDynamicPatterns() {
        val files = listOf(
            "src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt",
            "src/main/java/com/nextpari/app/feature/home/HomeScreen.kt",
            "src/main/java/com/nextpari/app/feature/home/GamesHubScreen.kt",
            "src/main/java/com/nextpari/app/feature/menu/MenuScreen.kt",
            "src/main/java/com/nextpari/app/feature/promo/PromoScreen.kt",
            "src/main/java/com/nextpari/app/feature/settings/SettingsScreen.kt",
            "src/main/java/com/nextpari/app/feature/wallet/WalletScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/SportsListScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/ChampionshipsScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/LeagueScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/GameListScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/MatchDetailsScreen.kt",
        )
        val blob = files.joinToString("\n") { moduleFile(it).readText() }
        assertThat(blob).doesNotContain("navigateTo(Destinations.MATCH)")
        assertThat(blob).doesNotContain("navigateTo(Destinations.LEAGUE)")
        assertThat(blob).doesNotContain("navigateTo(Destinations.CHAMPIONSHIPS)")
        assertThat(blob).doesNotContain("navigateTo(Destinations.BET_DETAILS)")
        assertThat(blob).contains("Destinations.match(")
        assertThat(blob).contains("Destinations.championships(")
        assertThat(blob).contains("Destinations.league(")
        assertThat(blob).contains("Destinations.PERSONAL_DATA")
        assertThat(moduleFile("src/main/java/com/nextpari/app/feature/settings/SettingsScreen.kt").readText())
            .contains("BackHandler(enabled = view != \"root\") { view = \"root\" }")
        assertThat(moduleFile("src/main/java/com/nextpari/app/feature/wallet/WalletScreen.kt").readText())
            .contains("onNavigate(Destinations.PERSONAL_DATA)")
    }

    @Test
    fun everyWebPlayerRouteIsRegisteredInRoot() {
        val root = moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText()
        Destinations.webPlayerRoutes.forEach { route ->
            val token = when (route) {
                Destinations.MATCH -> "Destinations.MATCH"
                Destinations.LEAGUE -> "Destinations.LEAGUE"
                Destinations.CHAMPIONSHIPS -> "Destinations.CHAMPIONSHIPS"
                Destinations.BET_DETAILS -> "Destinations.BET_DETAILS"
                else -> "Destinations." + constantName(route)
            }
            assertThat(root).contains(token)
        }
        assertThat(root).contains("Destinations.INBOX_PLACEHOLDER")
    }

    private fun isRegistered(route: String): Boolean {
        val known = Destinations.webPlayerRoutes.toSet() + Destinations.INBOX_PLACEHOLDER
        if (route in known) return true
        if (route.startsWith("match/") || route.startsWith("league/") ||
            route.startsWith("championships/") || route.startsWith("bet-details/")
        ) {
            return true
        }
        return false
    }

    private fun routeConstant(route: String): String = when (route) {
        Destinations.FAVORITES -> "Destinations.FAVORITES"
        Destinations.BETSLIP -> "Destinations.BETSLIP"
        Destinations.BET_DETAILS -> "Destinations.BET_DETAILS"
        Destinations.SLOTS -> "Destinations.SLOTS"
        Destinations.LIVE_CASINO -> "Destinations.LIVE_CASINO"
        Destinations.PROVIDER_SPORTSBOOK -> "Destinations.PROVIDER_SPORTSBOOK"
        Destinations.BLACKJACK -> "Destinations.BLACKJACK"
        Destinations.AVIATOR -> "Destinations.AVIATOR"
        Destinations.APPLES -> "Destinations.APPLES"
        Destinations.CRYSTAL -> "Destinations.CRYSTAL"
        Destinations.DICE -> "Destinations.DICE"
        Destinations.PHARAOH -> "Destinations.PHARAOH"
        Destinations.INBOX_PLACEHOLDER -> "Destinations.INBOX_PLACEHOLDER"
        else -> route
    }

    private fun constantName(route: String): String = when (route) {
        "home" -> "HOME"
        "betslip" -> "BETSLIP"
        "favorites" -> "FAVORITES"
        "history" -> "HISTORY"
        "menu" -> "MENU"
        "wallet" -> "WALLET"
        "promo" -> "PROMO"
        "personal-data" -> "PERSONAL_DATA"
        "wallets" -> "WALLETS"
        "gamelist/live" -> "GAMELIST_LIVE"
        "gamelist/line" -> "GAMELIST_LINE"
        "sports/live" -> "SPORTS_LIVE"
        "sports/line" -> "SPORTS_LINE"
        "sports/cybers" -> "SPORTS_CYBERS"
        "slots" -> "SLOTS"
        "live-casino" -> "LIVE_CASINO"
        "provider-sportsbook" -> "PROVIDER_SPORTSBOOK"
        "games" -> "GAMES"
        "promo-details" -> "PROMO_DETAILS"
        "promo-marathon" -> "PROMO_MARATHON"
        "promo-welcome" -> "PROMO_WELCOME"
        "settings" -> "SETTINGS"
        "info" -> "INFO"
        "promo-unbeatable" -> "PROMO_UNBEATABLE"
        "blackjack" -> "BLACKJACK"
        "aviator" -> "AVIATOR"
        "apples" -> "APPLES"
        "crystal" -> "CRYSTAL"
        "dice" -> "DICE"
        "pharaoh" -> "PHARAOH"
        "vip-cashback" -> "VIP_CASHBACK"
        else -> route
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
