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
}
