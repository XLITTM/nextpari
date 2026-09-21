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
    fun bottomNavActiveRouteMatchesWebNavActive() {
        assertThat(Destinations.bottomNavActiveRoute(Destinations.HOME)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.FAVORITES)).isEqualTo(Destinations.FAVORITES)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.BETSLIP)).isEqualTo(Destinations.BETSLIP)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.HISTORY)).isEqualTo(Destinations.HISTORY)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.MENU)).isEqualTo(Destinations.MENU)

        assertThat(Destinations.bottomNavActiveRoute(Destinations.MATCH)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.match("42"))).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.AVIATOR)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.LEAGUE)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.league("epl"))).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.GAMES)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.GAMELIST_LIVE)).isEqualTo(Destinations.HOME)

        assertThat(Destinations.bottomNavActiveRoute(Destinations.BET_DETAILS)).isEqualTo(Destinations.HISTORY)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.betDetails("7"))).isEqualTo(Destinations.HISTORY)

        assertThat(Destinations.bottomNavActiveRoute(Destinations.WALLET)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SETTINGS)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.PERSONAL_DATA)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.WALLETS)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.INFO)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.PROMO)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SPORTS_LIVE)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.SLOTS)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.CHAMPIONSHIPS)).isEqualTo(Destinations.MENU)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.INBOX_PLACEHOLDER)).isEqualTo(Destinations.MENU)

        assertThat(Destinations.bottomNavActiveRoute(Destinations.PROMO_DETAILS)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.PROMO_MARATHON)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.PROMO_WELCOME)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.PROMO_UNBEATABLE)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.VIP_CASHBACK)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.BLACKJACK)).isEqualTo(Destinations.HOME)
        assertThat(Destinations.bottomNavActiveRoute(Destinations.GAMELIST_LINE)).isEqualTo(Destinations.HOME)
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
