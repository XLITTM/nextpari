package com.nextpari.app.feature.casino

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CasinoCatalogLogicTest {
    @Test
    fun listingAcceptsAuthorizedCatalogRowsWithoutSaHexFilter() {
        val slots = CasinoDemoGame("pragmatic-wolf", "Wolf Gold", "Pragmatic Play", "slots", mobile = true)
        val live = CasinoDemoGame("sa-0123456789abcdef0123456789abcdef", "Lightning Roulette", "Evolution", "live")
        val blank = CasinoDemoGame("", "Nameless", "Studio", "slots")
        val desktop = CasinoDemoGame("desktop-only", "Desktop", "Studio", "slots", mobile = false)
        assertThat(CasinoCatalogLogic.accept(slots)).isTrue()
        assertThat(CasinoCatalogLogic.accept(live)).isTrue()
        assertThat(CasinoCatalogLogic.accept(blank)).isFalse()
        assertThat(CasinoCatalogLogic.accept(desktop)).isFalse()
        assertThat(CasinoCatalogLogic.categoryLabel("slots")).isEqualTo("Слоты")
        assertThat(CasinoCatalogLogic.categoryLabel("live")).isEqualTo("Лайв казино")
        assertThat(CasinoCatalogLogic.categoryLabel("table")).isEqualTo("Настольные")
        assertThat(CasinoCatalogLogic.categoryLabel("crash")).isEqualTo("Crash")
        assertThat(CasinoCatalogLogic.sortCategories(listOf("keno", "slots", "live", "table")))
            .containsExactly("slots", "live", "table", "keno").inOrder()
        assertThat(CasinoCatalogLogic.providerInitials("Pragmatic Play")).isEqualTo("PP")
        assertThat(CasinoCatalogLogic.providerInitials("Evolution")).isEqualTo("EV")
        assertThat(CasinoCatalogLogic.emptyMessage(true)).contains("Войдите")
        assertThat(CasinoCatalogLogic.emptyMessage(false)).isEqualTo("Игры не найдены")
    }
}
