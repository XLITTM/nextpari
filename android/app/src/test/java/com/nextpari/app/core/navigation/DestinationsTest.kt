package com.nextpari.app.core.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DestinationsTest {
    @Test
    fun unauthenticatedGraphContainsLoginRegisterAndRecovery() {
        assertThat(Destinations.unauthenticated).containsExactly(
            Destinations.LOGIN,
            Destinations.REGISTER,
            Destinations.REGISTER_EMAIL,
            Destinations.REGISTER_PHONE,
            Destinations.REGISTER_ONE_CLICK,
            Destinations.REGISTER_ONE_CLICK_RESULT,
            Destinations.FORGOT_PASSWORD,
        ).inOrder()
    }

    @Test
    fun A_bottomNavigationExactLabelsAndOrder() {
        assertThat(BottomNavSpec.labels).containsExactly(
            "Популярное",
            "Избранное",
            "Купон",
            "История",
            "Меню",
        ).inOrder()
        assertThat(BottomNavSpec.items.map { it.route }).containsExactly(
            Destinations.HOME,
            Destinations.FAVORITES,
            Destinations.BETSLIP,
            Destinations.HISTORY,
            Destinations.MENU,
        ).inOrder()
        assertThat(BottomNavSpec.items.none { it.label == "Кошелёк" || it.label == "Профиль" }).isTrue()
    }

    @Test
    fun B_centerCouponGoesToBetslip() {
        assertThat(BottomNavSpec.center.label).isEqualTo("Купон")
        assertThat(BottomNavSpec.center.route).isEqualTo(Destinations.BETSLIP)
        assertThat(BottomNavSpec.center.center).isTrue()
        assertThat(BottomNavSpec.items.count { it.center }).isEqualTo(1)
    }

    @Test
    fun C_mainTabsExactLabelsAndOrder() {
        assertThat(MainTabsSpec.labels).containsExactly(
            "Топ",
            "Спорт",
            "Esports",
            "Казино",
            "Games",
        ).inOrder()
    }

    @Test
    fun D_webParityRouteModel() {
        val expected = listOf(
            "home", "match/{matchId}", "betslip", "favorites", "history", "bet-details/{betId}",
            "menu", "wallet", "promo", "personal-data", "wallets", "gamelist/live", "gamelist/line",
            "sports/live", "sports/line", "sports/cybers", "championships/{sport}/{mode}", "slots",
            "live-casino", "provider-sportsbook", "games", "promo-details", "promo-marathon",
            "promo-welcome", "settings", "info", "promo-unbeatable", "blackjack", "aviator",
            "apples", "crystal", "dice", "pharaoh", "vip-cashback", "league/{leagueId}",
        )
        assertThat(Destinations.webPlayerRoutes).containsExactlyElementsIn(expected).inOrder()
    }

    @Test
    fun bottomNavFollowsTheOwningTab() {
        assertThat(Destinations.bottomNavActiveRoute(Destinations.HOME)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.FAVORITES)).isEqualTo(Destinations.FAVORITES)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.BETSLIP)).isEqualTo(Destinations.BETSLIP)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.HISTORY)).isEqualTo(Destinations.HISTORY)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.MENU)).isEqualTo(Destinations.MENU)

        listOf(
            Destinations.MATCH,
            Destinations.match("42"),
            Destinations.LEAGUE,
            Destinations.league("epl"),
            Destinations.CHAMPIONSHIPS,
            Destinations.championships("football", "live"),
            Destinations.SPORTS_LIVE,
            Destinations.SPORTS_LINE,
            Destinations.SPORTS_CYBERS,
            Destinations.GAMELIST_LIVE,
            Destinations.GAMELIST_LINE,
            Destinations.GAMES,
            Destinations.SLOTS,
            Destinations.LIVE_CASINO,
            Destinations.APPLES,
            Destinations.AVIATOR,
            Destinations.BLACKJACK,
            Destinations.VIP_CASHBACK,
            Destinations.PROMO_DETAILS,
            Destinations.PROMO_MARATHON,
            Destinations.PROMO_WELCOME,
            Destinations.PROMO_UNBEATABLE,
        ).forEach { route ->
            assertThat(Destinations.bottomNavActiveRoute(route)).isEqualTo(Destinations.HOME)
        }

        assertThat(Destinations.bottomNavActiveRoute(Destinations.BET_DETAILS)).isEqualTo(Destinations.HISTORY)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.betDetails("7"))).isEqualTo(Destinations.HISTORY)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.INFO)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.INBOX_PLACEHOLDER)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute("not-a-route")).isEqualTo(Destinations.HOME)
    }

    @Test
    fun sharedScreensFollowTheParentThatOpenedThem() {
        val fromMenu = listOf(Destinations.HOME, Destinations.MENU, Destinations.SETTINGS, Destinations.WALLETS)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.WALLETS, fromMenu)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SETTINGS, fromMenu)).isEqualTo(Destinations.MENU)

        val fromHome = listOf(Destinations.HOME, Destinations.SETTINGS)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SETTINGS, fromHome)).isEqualTo(Destinations.HOME)

        val fromGames = listOf(Destinations.HOME, Destinations.GAMES, Destinations.WALLET)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.WALLET, fromGames)).isEqualTo(Destinations.HOME)
        val gamesPromo = listOf(Destinations.HOME, Destinations.GAMES, Destinations.PROMO)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.PROMO, gamesPromo)).isEqualTo(Destinations.HOME)

        val sportPath = listOf(Destinations.HOME, Destinations.league("epl"), Destinations.match("42"))
        assertThat(Destinations.bottomNavActiveRoute(Destinations.match("42"), sportPath)).isEqualTo(Destinations.HOME)
        val casinoPath = listOf(Destinations.HOME, Destinations.SLOTS)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SLOTS, casinoPath)).isEqualTo(Destinations.HOME)
    }

    @Test
    fun routeBuildersProduceConcretePathsNotPatterns() {
        assertThat(Destinations.isPatternRoute(Destinations.MATCH)).isTrue()
        assertThat(Destinations.isPatternRoute(Destinations.LEAGUE)).isTrue()
        assertThat(Destinations.isPatternRoute(Destinations.CHAMPIONSHIPS)).isTrue()
        assertThat(Destinations.isPatternRoute(Destinations.BET_DETAILS)).isTrue()
        assertThat(Destinations.match("42")).isEqualTo("match/42")
        assertThat(Destinations.match("42")).doesNotContain("{")
        assertThat(Destinations.league("epl")).isEqualTo("league/epl")
        assertThat(Destinations.league("epl")).doesNotContain("{")
        assertThat(Destinations.championships("football", "live")).isEqualTo("championships/football/live")
        assertThat(Destinations.championships("football", "live")).doesNotContain("{")
        assertThat(Destinations.betDetails("7")).isEqualTo("bet-details/7")
        assertThat(Destinations.isConcreteNavigationTarget(Destinations.match("42"))).isTrue()
        assertThat(Destinations.isConcreteNavigationTarget(Destinations.MATCH)).isFalse()
        assertThat(Destinations.isConcreteNavigationTarget(Destinations.LEAGUE)).isFalse()
        assertThat(Destinations.isConcreteNavigationTarget(Destinations.CHAMPIONSHIPS)).isFalse()
        assertThat(Destinations.isConcreteNavigationTarget(Destinations.BET_DETAILS)).isFalse()
        assertThat(Destinations.isConcreteNavigationTarget(Destinations.PERSONAL_DATA)).isTrue()
        assertThat(Destinations.isConcreteNavigationTarget(Destinations.INBOX_PLACEHOLDER)).isTrue()
    }

    @Test
    fun authAndAppGraphsDoNotOverlap() {
        val overlap = Destinations.unauthenticated.intersect(Destinations.webPlayerRoutes.toSet())
        assertThat(overlap).isEmpty()
        assertThat(Destinations.isUnauthenticated(Destinations.LOGIN)).isTrue()
        assertThat(Destinations.isUnauthenticated(Destinations.HOME)).isFalse()
        assertThat(Destinations.showsHeader(Destinations.HOME)).isTrue()
        assertThat(Destinations.showsHeader(Destinations.MENU)).isFalse()
    }
}
