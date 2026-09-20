package com.nextpari.app.feature.home

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.R
import com.nextpari.app.feature.wallet.FakeWalletRepository
import org.junit.Test

class ProductionUiCatalogTest {
    @Test
    fun gamesMetadataAndRoutesMatchWeb() {
        assertThat(GamesCatalog.games.map { it.id }).containsExactly(
            "apples", "aviator", "blackjack", "crystal", "dice", "pharaoh",
        ).inOrder()
        assertThat(GamesCatalog.games.map { it.route }).containsExactly(
            "apples", "aviator", "blackjack", "crystal", "dice", "pharaoh",
        ).inOrder()
        assertThat(GamesCatalog.games.map { it.name }).containsExactly(
            "Apple of Fortune", "Aviator", "21 / Очко", "Crystal", "Dice", "Сокровища Фараона",
        ).inOrder()
        assertThat(GamesCatalog.games.map { it.badge }).containsExactly(
            "HOT", "BEST", "HOT", "BEST", "HOT", "HOT",
        ).inOrder()
        assertThat(GamesCatalog.games.map { it.winLabel }).containsExactly(
            "x349", "x100+", "x2", null, "x2", "x10000",
        ).inOrder()
        GamesCatalog.games.forEach { game ->
            assertThat(game.coverRes).isNotEqualTo(0)
        }
        assertThat(GamesCatalog.games.first { it.id == "apples" }.coverRes).isEqualTo(R.drawable.game_apples)
        assertThat(GamesCatalog.games.first { it.id == "pharaoh" }.coverRes).isEqualTo(R.drawable.game_pharaoh)
    }

    @Test
    fun homePromoOrderAndRealAssets() {
        assertThat(HomePromoCatalog.items.map { it.title }).containsExactly(
            "Марафон Экспрессов",
            "100% Бонус на депозит",
            "Приветственный пакет",
            "Непобедимый",
        ).inOrder()
        assertThat(HomePromoCatalog.items.map { it.drawableName }).containsExactly(
            "promo_marathon", "promo_tiger", "promo_welcome", "promo_unbeatable",
        ).inOrder()
        assertThat(HomePromoCatalog.items.map { it.route }).containsExactly(
            "promo-marathon", "promo-details", "promo-welcome", "promo-unbeatable",
        ).inOrder()
        HomePromoCatalog.items.forEach { promo ->
            assertThat(promo.imageRes).isNotEqualTo(0)
        }
        assertThat(SportIconRes.drawable("football")).isEqualTo(R.drawable.ic_sport_football)
        assertThat(SportIconRes.drawable("esports")).isEqualTo(R.drawable.ic_sport_esports)
        assertThat(SportIconRes.drawable("unknown-sport")).isEqualTo(R.drawable.ic_sport_default)
        assertThat(SportIconRes.knownIds).containsExactly(
            "all", "football", "futsal", "basketball", "tennis", "table-tennis", "badminton",
            "baseball", "polo", "cricket", "beach-volleyball", "snooker", "elections",
            "pickleball", "fifa", "mk", "polybet", "ufc", "filter", "hockey", "volleyball", "esports",
        ).inOrder()
        SportIconRes.knownIds.forEach { id ->
            assertThat(SportIconRes.drawable(id)).isNotEqualTo(R.drawable.ic_sport_default)
        }
        assertThat(SportIconRes.drawable("futsal")).isEqualTo(R.drawable.ic_sport_football)
        assertThat(SportIconRes.drawable("beach-volleyball")).isEqualTo(R.drawable.ic_sport_volleyball)
        assertThat(SportIconRes.drawable("table-tennis")).isEqualTo(R.drawable.ic_sport_table_tennis)
        assertThat(SportIconRes.drawable("ufc")).isEqualTo(R.drawable.ic_sport_ufc)
        assertThat(FakeHomeCatalogRepository().sports().map { it.id }).containsAtLeastElementsIn(SportIconRes.knownIds)
    }

    @Test
    fun gamesCategoryAndLobbyLabels() {
        assertThat(GamesCatalog.categories.map { it.label }).containsExactly(
            "Все", "Для Вас", "Лучшее", "Crash / Быстрые", "Карты", "Лотереи",
        ).inOrder()
        assertThat(GamesCatalog.lobbyTabs.map { it.label }).containsExactly(
            "Все игры", "Бонусы", "Кешбэк", "Избранное",
        ).inOrder()
    }

    @Test
    fun customerFacingCopyHasNoDeveloperTokens() {
        val blob = buildString {
            GamesCatalog.games.forEach {
                appendLine(it.name)
                appendLine(it.badge)
                appendLine(it.winLabel)
            }
            GamesCatalog.categories.forEach { appendLine(it.label) }
            GamesCatalog.lobbyTabs.forEach { appendLine(it.label) }
            HomePromoCatalog.items.forEach { appendLine(it.title) }
            EsportsCatalog.disciplines.forEach { appendLine(it.name) }
            appendLine(FakeWalletRepository().snapshot().note)
            appendLine("Этот раздел скоро откроется.")
            appendLine("Купон пуст")
            appendLine("В избранном пока нет событий")
            appendLine("Нет новых сообщений")
            appendLine("Выберите способ пополнения")
            appendLine("Оформите заявку на вывод")
            appendLine("Регистрация будет доступна в ближайшее время.")
            appendLine("Для восстановления пароля обратитесь в поддержку.")
            appendLine("Казино-провайдеры появятся после подключения")
            appendLine("Игры появятся после подключения провайдера")
            appendLine("Столы появятся после подключения провайдера")
            appendLine("Матчи появятся скоро")
        }
        listOf("DEV/mock", "A002", "A003", "Production API", "Движки в", "backend", "repository").forEach { token ->
            assertThat(blob).doesNotContain(token)
        }
    }
}
