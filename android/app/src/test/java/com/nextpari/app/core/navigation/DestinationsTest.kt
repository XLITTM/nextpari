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
    fun authAndAppGraphsDoNotOverlap() {
        val overlap = Destinations.unauthenticated.intersect(Destinations.webPlayerRoutes.toSet())
        assertThat(overlap).isEmpty()
        assertThat(Destinations.isUnauthenticated(Destinations.LOGIN)).isTrue()
        assertThat(Destinations.isUnauthenticated(Destinations.HOME)).isFalse()
        assertThat(Destinations.showsHeader(Destinations.HOME)).isTrue()
        assertThat(Destinations.showsHeader(Destinations.MENU)).isFalse()
    }
}
