package com.nextpari.app.feature.promo

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.R
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import com.nextpari.app.feature.home.HomePromoCatalog
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.menu.MenuCatalog
import com.nextpari.app.feature.settings.SettingsCopy
import com.nextpari.app.feature.sportsbook.CountryGrouping
import com.nextpari.app.feature.sportsbook.HomeAccordionExpansion
import com.nextpari.app.feature.sportsbook.HomeChampionships
import org.junit.Test
import java.io.File

class PromoVipHomeTest {
    @Test
    fun promoAndVipRoutesAreNativeScreensNotPlaceholders() {
        val root = moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText()
        PromoCatalog.nativeRoutes.forEach { routeConst ->
            assertThat(root).doesNotContain("placeholder(navController, Destinations.${routeName(routeConst)}")
        }
        assertThat(root).contains("PromoScreen(")
        assertThat(root).contains("VipCashbackScreen(")
        assertThat(root).contains("PromoDetailsScreen(")
        assertThat(root).contains("PromoMarathonScreen(")
        assertThat(root).contains("PromoWelcomeScreen(")
        assertThat(root).contains("PromoUnbeatableScreen(")
        assertThat(root).contains("MatchDetailsScreen(")
        assertThat(root).contains("ChampionshipsScreen(")
    }

    @Test
    fun vipLevelsMatchProductionOrderPercentagesAndPeriods() {
        assertThat(VipCatalog.levels.map { it.name }).containsExactly(
            "Медный", "Бронзовый", "Серебряный", "Золотой", "Рубиновый", "Сапфировый", "Бриллиантовый", "Статус VIP",
        ).inOrder()
        assertThat(VipCatalog.levels.map { it.cashbackLabel }).containsExactly(
            "5%", "6%", "7%", "8%", "9%", "10%", "11%", "0.05–0.25%",
        ).inOrder()
        assertThat(VipCatalog.levels.map { it.cashbackPeriod }).containsExactly(
            "Раз в 7 дней", "Раз в 6 дней", "Раз в 5 дней", "Раз в 4 дня", "Раз в 3 дня", "Раз в 2 дня", "Ежедневно", null,
        ).inOrder()
        assertThat(VipCatalog.levels.map { it.id }).containsExactly(1, 2, 3, 4, 5, 6, 7, 8).inOrder()
    }

    @Test
    fun vipAssetsWereCopiedFromRepository() {
        assertThat(moduleFile("src/main/res/drawable/vip_tiger_hero_reference.png").exists()).isTrue()
        assertThat(moduleFile("src/main/res/drawable/vip_cashback_coin_reference.png").exists()).isTrue()
        assertThat(moduleFile("src/main/res/drawable/vip_tiger_hero_reference.png").length()).isGreaterThan(1000)
        assertThat(moduleFile("src/main/res/drawable/vip_cashback_coin_reference.png").length()).isGreaterThan(1000)
        assertThat(R.drawable.vip_tiger_hero_reference).isEqualTo(VipCatalog.tigerRes)
        assertThat(R.drawable.vip_cashback_coin_reference).isEqualTo(VipCatalog.coinRes)
    }

    @Test
    fun promoCarouselMapsToExistingNativeRoutes() {
        assertThat(HomePromoCatalog.items.map { it.route }).containsExactly(
            Destinations.PROMO_MARATHON,
            Destinations.PROMO_DETAILS,
            Destinations.PROMO_WELCOME,
            Destinations.PROMO_UNBEATABLE,
        ).inOrder()
        assertThat(PromoCatalog.carousel.map { it.route }).isEqualTo(HomePromoCatalog.items.map { it.route })
        assertThat(PromoCatalog.menuItems.first { it.label == "Кешбэк" }.route).isEqualTo(Destinations.VIP_CASHBACK)
        assertThat(PromoCatalog.menuItems.first { it.label == "VIP кешбэк" }.route).isEqualTo(Destinations.VIP_CASHBACK)
        assertThat(PromoCatalog.menuItems.filter { it.soon }.map { it.label }).containsExactly(
            "Бонусные игры", "Проверка промокода", "Участие в акциях", "Бонусы",
        ).inOrder()
    }

    @Test
    fun homeChampionshipModeAndSeeAllRoutes() {
        assertThat(HomeChampionships.title("live")).isEqualTo("Чемпионаты LIVE")
        assertThat(HomeChampionships.title("line")).isEqualTo("Чемпионаты Линия")
        assertThat(HomeChampionships.seeAllRoute("all", "live")).isEqualTo(Destinations.SPORTS_LIVE)
        assertThat(HomeChampionships.seeAllRoute("all", "line")).isEqualTo(Destinations.SPORTS_LINE)
        assertThat(HomeChampionships.seeAllRoute("football", "live")).isEqualTo(Destinations.championships("football", "live"))
        assertThat(HomeChampionships.seeAllRoute("tennis", "line")).isEqualTo(Destinations.championships("tennis", "line"))
    }

    @Test
    fun homeCountryAccordionUsesRepositoryDataOnly() {
        val repo = FakeHomeCatalogRepository()
        val empty = HomeChampionships.groups("live", "all", repo.liveMatches(), repo.lineMatches())
        assertThat(empty).isEmpty()
        assertThat(CountryGrouping.groupByCountry(repo.liveMatches())).isEmpty()

        val live = listOf(
            MatchCardModel(id = "1", sport = "football", league = "Премьер-лига", country = "Англия", team1 = "A", team2 = "B"),
            MatchCardModel(id = "2", sport = "football", league = "Премьер-лига", country = "Англия", team1 = "C", team2 = "D"),
            MatchCardModel(id = "3", sport = "football", league = "Ла Лига", country = "Испания", team1 = "E", team2 = "F"),
        )
        val groups = HomeChampionships.groups("live", "football", live, emptyList())
        assertThat(groups.map { it.country }).containsExactly("Англия", "Испания").inOrder()
        assertThat(groups.first().count).isEqualTo(2)
        assertThat(groups.first().leagues.first().count).isEqualTo(2)
        assertThat(HomeChampionships.groups("line", "football", live, emptyList())).isEmpty()
        assertThat(HomeAccordionExpansion.resolve(groups, "", userInteracted = false)).isEqualTo("Англия")
        assertThat(HomeAccordionExpansion.resolve(groups, "", userInteracted = true)).isEmpty()
        assertThat(HomeAccordionExpansion.resolve(groups, "Испания", userInteracted = true)).isEqualTo("Испания")
    }

    @Test
    fun menuQuickAccessRoutesAndSettingsHideDebugPreview() {
        assertThat(MenuCatalog.quickAccess.map { it.label }).containsExactly("VIP CLUB", "Кешбэк", "Акции", "Бонусы").inOrder()
        assertThat(MenuCatalog.quickAccess.map { it.route }).containsExactly(
            Destinations.VIP_CASHBACK,
            Destinations.VIP_CASHBACK,
            Destinations.PROMO,
            Destinations.PROMO,
        ).inOrder()
        val settings = moduleFile("src/main/java/com/nextpari/app/feature/settings/SettingsScreen.kt").readText()
        assertThat(settings).doesNotContain("Предпросмотр спортбука")
        assertThat(settings).doesNotContain("Только отладка: аккордеоны рынков")
        assertThat(SettingsCopy.labels.joinToString()).doesNotContain("Предпросмотр спортбука")
        val menu = moduleFile("src/main/java/com/nextpari/app/feature/menu/MenuScreen.kt").readText()
        assertThat(menu).doesNotContain("Предпросмотр спортбука")
    }

    @Test
    fun matchMarketAccordionsRemainPresent() {
        val files = listOf(
            "src/main/java/com/nextpari/app/feature/sportsbook/MarketAccordion.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/MarketsGrid.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/MatchDetailsScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/ChampionshipsScreen.kt",
        )
        files.forEach { path ->
            assertThat(moduleFile(path).exists()).isTrue()
        }
        assertThat(moduleFile(files[0]).readText()).contains("fun MarketAccordion")
    }

    private fun routeName(route: String): String = when (route) {
        Destinations.PROMO -> "PROMO"
        Destinations.VIP_CASHBACK -> "VIP_CASHBACK"
        Destinations.PROMO_DETAILS -> "PROMO_DETAILS"
        Destinations.PROMO_MARATHON -> "PROMO_MARATHON"
        Destinations.PROMO_WELCOME -> "PROMO_WELCOME"
        Destinations.PROMO_UNBEATABLE -> "PROMO_UNBEATABLE"
        else -> route
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(
            File(relative),
            File("app/$relative"),
            File("android/app/$relative"),
        )
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
