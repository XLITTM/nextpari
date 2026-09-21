package com.nextpari.app.feature.menu

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MenuCatalogTest {
    @Test
    fun subTabsMatchWebOrder() {
        assertThat(MenuCatalog.subTabs).containsExactly(
            "Топ",
            "Спорт",
            "Казино",
            "Games",
            "Разное",
        ).inOrder()
    }

    @Test
    fun requiredLabelsExistAndSoonItemsStayUnavailable() {
        val labels = MenuCatalog.subTabs.flatMap { MenuCatalog.itemsFor(it).map { item -> item.label } }
        assertThat(labels).containsAtLeast(
            "LIVE",
            "Линия",
            "Киберспорт",
            "Слоты",
            "Лайв казино",
            "Games",
            "Промокоды",
            "Непобедимый",
            "Поддержка",
            "Управление счетом",
            "Акции",
        )
        val soon = MenuCatalog.itemsFor("Разное").filter { it.soon }.map { it.label }
        assertThat(soon).containsAtLeast(
            "Повысьте безопасность!",
            "Аутентификатор",
            "ТОТО",
            "Финставки",
            "Бетконструктор",
            "Сканер купонов",
            "Уведомления",
        )
        assertThat(MenuCatalog.itemsFor("Разное").first { it.label == "Управление счетом" }.route).isEqualTo("wallet")
        assertThat(MenuCatalog.itemsFor("Топ").first { it.label == "Аутентификатор" }.soon).isTrue()
    }

    @Test
    fun topItemsMatchProductionOrder() {
        assertThat(MenuCatalog.top.map { it.label }).containsExactly(
            "LIVE",
            "Линия",
            "Киберспорт",
            "Слоты",
            "Лайв казино",
            "Games",
            "Промокоды",
            "Непобедимый",
            "Поддержка",
            "Аутентификатор",
        ).inOrder()
    }

    @Test
    fun menuHasNoInventedQuickAccessBlock() {
        val catalog = moduleFile("src/main/java/com/nextpari/app/feature/menu/MenuCatalog.kt").readText()
        val screen = moduleFile("src/main/java/com/nextpari/app/feature/menu/MenuScreen.kt").readText()
        assertThat(catalog).doesNotContain("quickAccess")
        assertThat(catalog).doesNotContain("VIP CLUB")
        assertThat(screen).doesNotContain("MenuQuickAccess")
        assertThat(screen).doesNotContain("QuickAccessCard")
        assertThat(screen).doesNotContain("VIP CLUB")
        val afterBalance = screen.substringAfter("Пополнить")
        assertThat(afterBalance).contains("MenuCatalog.subTabs")
        assertThat(afterBalance.substringBefore("MenuCatalog.subTabs")).doesNotContain("QuickAccess")
        val balanceCard = screen.substringAfter("nextWalletDropdownOpen(walletsOpen, onRefreshWallets)")
            .substringBefore("Color(0xFF16A34A)")
        assertThat(balanceCard).doesNotContain("Destinations.WALLET")
        assertThat(balanceCard).contains("WalletDropdownMenu")
        assertThat(screen.split("onNavigate(Destinations.WALLET)").size - 1).isEqualTo(1)
        assertThat(screen).doesNotContain("WalletsViewModel")
    }

    private fun moduleFile(relative: String): java.io.File {
        val candidates = listOf(
            java.io.File(relative),
            java.io.File("app/$relative"),
            java.io.File("android/app/$relative"),
        )
        return candidates.firstOrNull { it.exists() } ?: java.io.File(relative)
    }
}
