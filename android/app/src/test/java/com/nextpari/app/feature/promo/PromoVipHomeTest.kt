package com.nextpari.app.feature.promo

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.R
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import com.nextpari.app.feature.home.HomePromoCatalog
import com.nextpari.app.feature.home.HomeSectionOrder
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.menu.MenuCatalog
import com.nextpari.app.feature.settings.SettingsCopy
import com.nextpari.app.feature.sportsbook.CountryGrouping
import com.nextpari.app.feature.sportsbook.HomeAccordionExpansion
import com.nextpari.app.feature.sportsbook.HomeChampionships
import com.nextpari.app.feature.sportsbook.LeagueIds
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
        assertThat(root).contains("LeagueScreen(")
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
    fun promoScreenHasNoDuplicateCarouselAndExactSixRows() {
        assertThat(PromoCatalog.menuItems.map { it.label }).containsExactly(
            "Бонусные игры",
            "Проверка промокода",
            "Кешбэк",
            "VIP кешбэк",
            "Участие в акциях",
            "Бонусы",
        ).inOrder()
        assertThat(PromoCatalog.menuItems.map { it.desc }).containsExactly(
            "Играйте и получайте призы",
            "Промокоды появятся после подключения бонусной системы",
            "Информация о будущей программе кешбэка",
            "Информация о VIP-программе",
            "Турниры и конкурсы прогнозов",
            "Подарки и поощрения для игроков",
        ).inOrder()
        assertThat(PromoCatalog.heroSummary).isEqualTo("Акции и бонусы появятся после подключения бонусной системы")
        assertThat(PromoCatalog.menuItems.first { it.label == "Кешбэк" }.route).isEqualTo(Destinations.VIP_CASHBACK)
        assertThat(PromoCatalog.menuItems.first { it.label == "VIP кешбэк" }.route).isEqualTo(Destinations.VIP_CASHBACK)
        assertThat(PromoCatalog.menuItems.filter { it.soon }.map { it.label }).containsExactly(
            "Бонусные игры", "Проверка промокода", "Участие в акциях", "Бонусы",
        ).inOrder()
        val promoScreen = moduleFile("src/main/java/com/nextpari/app/feature/promo/PromoScreen.kt").readText()
        assertThat(promoScreen).doesNotContain("LazyRow")
        assertThat(promoScreen).doesNotContain("carousel")
        assertThat(promoScreen).doesNotContain("PromoHeroCard")
        assertThat(promoScreen).doesNotContain("HomePromoCatalog")
        assertThat(promoScreen).contains("Promo")
        assertThat(promoScreen).contains("Промо")
        val catalog = moduleFile("src/main/java/com/nextpari/app/feature/promo/PromoCatalog.kt").readText()
        assertThat(catalog).doesNotContain("val carousel")
        assertThat(HomePromoCatalog.items.map { it.route }).containsExactly(
            Destinations.PROMO_MARATHON,
            Destinations.PROMO_DETAILS,
            Destinations.PROMO_WELCOME,
            Destinations.PROMO_UNBEATABLE,
        ).inOrder()
    }

    @Test
    fun homeChampionshipsAreLiveOnlyAndHideWhenEmpty() {
        assertThat(HomeChampionships.TITLE).isEqualTo("Чемпионаты LIVE")
        assertThat(HomeChampionships.seeAllRoute("all")).isEqualTo(Destinations.SPORTS_LIVE)
        assertThat(HomeChampionships.seeAllRoute("football")).isEqualTo(Destinations.championships("football", "live"))
        assertThat(HomeSectionOrder.top).containsExactly(
            "sports", "promos", "live", "line", "champs",
            "esports-disciplines", "esports-live", "esports-line",
        ).inOrder()
        assertThat(HomeSectionOrder.sport).containsExactly("sports", "live", "line", "champs").inOrder()

        val accordion = moduleFile("src/main/java/com/nextpari/app/feature/home/HomeChampionshipsAccordion.kt").readText()
        assertThat(accordion).doesNotContain("HomeModeTab")
        assertThat(accordion).doesNotContain("Чемпионаты Линия")
        assertThat(accordion).doesNotContain("Сейчас событий нет")
        assertThat(accordion).doesNotContain("mutableStateOf(\"live\")")
        assertThat(accordion).contains("if (groups.isEmpty()) return")
        assertThat(accordion).contains("AnimatedVisibility")
        assertThat(accordion).contains("Destinations.league")

        val home = moduleFile("src/main/java/com/nextpari/app/feature/home/HomeScreen.kt").readText()
        assertThat(home).contains("item(key = \"sports\")")
        assertThat(home).contains("item(key = \"promos\")")
        assertThat(home).contains("item(key = \"champs\")")
        assertThat(home).doesNotContain("line = state.filteredLine")
        val topBranch = home.substringAfter("else -> {").substringBefore("\"esports\" ->")
        assertThat(topBranch).doesNotContain("esports-tournaments")
        assertThat(topBranch).doesNotContain("Чемпионаты Линия")
        assertThat(home.indexOf("item(key = \"promos\")")).isGreaterThan(home.indexOf("item(key = \"sports\")"))
    }

    @Test
    fun homeCountryAccordionUsesLiveRepositoryDataOnly() {
        val repo = FakeHomeCatalogRepository()
        assertThat(HomeChampionships.groups(repo.liveMatches())).isEmpty()
        assertThat(CountryGrouping.groupByCountry(repo.liveMatches())).isEmpty()
        assertThat(HomeChampionships.groups(repo.lineMatches())).isEmpty()

        val live = listOf(
            MatchCardModel(id = "1", sport = "football", league = "Премьер-лига", country = "Англия", team1 = "A", team2 = "B"),
            MatchCardModel(id = "2", sport = "football", league = "Премьер-лига", country = "Англия", team1 = "C", team2 = "D"),
            MatchCardModel(id = "3", sport = "football", league = "Ла Лига", country = "Испания", team1 = "E", team2 = "F"),
            MatchCardModel(id = "4", sport = "esports", league = "CS2", country = "World", team1 = "X", team2 = "Y"),
        )
        val groups = HomeChampionships.groups(live)
        assertThat(groups.first().country).isEqualTo("Англия")
        assertThat(groups.map { it.country }).containsExactly("Англия", "Испания", "World")
        assertThat(groups.first().count).isEqualTo(2)
        assertThat(groups.first().leagues.first().count).isEqualTo(2)
        assertThat(HomeChampionships.groups(live, excludeEsports = true).map { it.country })
            .containsExactly("Англия", "Испания").inOrder()
        assertThat(HomeChampionships.groups(emptyList())).isEmpty()
        assertThat(HomeAccordionExpansion.resolve(groups, "", userInteracted = false)).isEqualTo("Англия")
        assertThat(HomeAccordionExpansion.resolve(groups, "", userInteracted = true)).isEmpty()
        assertThat(HomeAccordionExpansion.resolve(groups, "Испания", userInteracted = true)).isEqualTo("Испания")
        val leagueId = LeagueIds.toLeagueId(groups.first().country, groups.first().leagues.first().name)
        assertThat(leagueId).isEqualTo("Англия|Премьер-лига")
        assertThat(Destinations.league(leagueId)).startsWith("league/")
    }

    @Test
    fun menuHasNoQuickAccessAndSettingsHideDebugPreview() {
        assertThat(MenuCatalog.subTabs).containsExactly("Топ", "Спорт", "Казино", "Games", "Разное").inOrder()
        assertThat(MenuCatalog.top.map { it.label }).containsExactly(
            "LIVE", "Линия", "Киберспорт", "Слоты", "Лайв казино", "Games",
            "Промокоды", "Непобедимый", "Поддержка", "Аутентификатор",
        ).inOrder()
        val settings = moduleFile("src/main/java/com/nextpari/app/feature/settings/SettingsScreen.kt").readText()
        assertThat(settings).doesNotContain("Предпросмотр спортбука")
        assertThat(settings).doesNotContain("Только отладка: аккордеоны рынков")
        assertThat(SettingsCopy.labels.joinToString()).doesNotContain("Предпросмотр спортбука")
        val menu = moduleFile("src/main/java/com/nextpari/app/feature/menu/MenuScreen.kt").readText()
        assertThat(menu).doesNotContain("Предпросмотр спортбука")
        assertThat(menu).doesNotContain("MenuQuickAccess")
        assertThat(menu).doesNotContain("VIP CLUB")
    }

    @Test
    fun sportsbookLayersAndMarketAccordionsRemainPresent() {
        val files = listOf(
            "src/main/java/com/nextpari/app/feature/sportsbook/MarketAccordion.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/MarketsGrid.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/MatchDetailsScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/ChampionshipsScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/SportsListScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/LeagueScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/GameListScreen.kt",
            "src/main/java/com/nextpari/app/feature/sportsbook/MatchTracker.kt",
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
