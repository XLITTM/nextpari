package com.nextpari.app.feature.info

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class InfoCatalogTest {
    @Test
    fun rootItemsAndBettingStepsMatchProduction() {
        assertThat(InfoCatalog.rootItems).containsExactly(
            "О нас",
            "Контакты",
            "Правила",
            "Платежи",
            "Как сделать ставку?",
        ).inOrder()
        assertThat(InfoCatalog.bettingSteps).containsExactly(
            "Выберите событие в LIVE или Линии.",
            "Нажмите на коэффициент — исход попадёт в купон.",
            "Укажите сумму ставки.",
            "Проверьте тип пари (ординар / экспресс) и нажмите «Заключить».",
            "Статус купона смотрите в разделе «История».",
        ).inOrder()
        assertThat(InfoCatalog.ABOUT_P1).contains("Nextpari — платформа для ставок на спорт")
        assertThat(InfoCatalog.ABOUT_P1).contains("киберспорт и игровых разделов")
        assertThat(InfoCatalog.ABOUT_P2).isEqualTo("Часть сервисов становится доступна после подключения соответствующих провайдеров.")
        assertThat(InfoCatalog.ABOUT_P3).isEqualTo("Играйте ответственно. Сервис доступен только лицам старше 18 лет.")
        assertThat(InfoCatalog.CONTACTS_BODY).isEqualTo("Контакты поддержки будут опубликованы перед запуском сервиса.")
        assertThat(InfoCatalog.RULES_P2).contains("Полные юридические документы")
        assertThat(InfoCatalog.PAYMENTS_BODY).contains("платёжном интерфейсе")
    }

    @Test
    fun subpageBackReturnsToInfoRootInsteadOfPopping() {
        val screen = moduleFile("src/main/java/com/nextpari/app/feature/info/InfoScreen.kt").readText()
        assertThat(screen).contains("BackHandler(enabled = view != \"root\") { view = \"root\" }")
        assertThat(screen).contains("SubPage(InfoCatalog.ABOUT, onBack = { view = \"root\" })")
        assertThat(screen).contains("SubPage(InfoCatalog.CONTACTS, onBack = { view = \"root\" })")
        assertThat(screen).contains("SubPage(InfoCatalog.RULES, onBack = { view = \"root\" })")
        assertThat(screen).contains("SubPage(InfoCatalog.PAYMENTS, onBack = { view = \"root\" })")
        assertThat(screen).contains("SubPage(InfoCatalog.HOWTO, onBack = { view = \"root\" })")
        assertThat(screen).contains("InfoRoot(onBack = onBack")
        assertThat(screen).doesNotContain("onBack()")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
