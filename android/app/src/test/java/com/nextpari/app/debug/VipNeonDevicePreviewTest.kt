package com.nextpari.app.debug

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class VipNeonDevicePreviewTest {
    @Test
    fun previewStaysOutOfReleaseAndDoesNotTouchWalletApis() {
        val mainManifest = moduleFile("src/main/AndroidManifest.xml").readText()
        val debugManifest = moduleFile("src/debug/AndroidManifest.xml").readText()
        val preview = moduleFile("src/debug/java/com/nextpari/app/debug/VipNeonDevicePreviewActivity.kt").readText()
        assertThat(moduleFile("src/release/AndroidManifest.xml").exists()).isFalse()
        assertThat(mainManifest).doesNotContain("VipNeonDevicePreviewActivity")
        assertThat(debugManifest).contains(".debug.VipNeonDevicePreviewActivity")
        assertThat(debugManifest).contains(".debug.MatchCardHeightCheckActivity")
        assertThat(debugManifest).contains(".debug.MarketLayoutCheckActivity")
        assertThat(mainManifest).doesNotContain("MatchCardHeightCheckActivity")
        assertThat(mainManifest).doesNotContain("MarketLayoutCheckActivity")
        assertThat(preview).contains("BottomNavSpec")
        assertThat(preview).contains("MainTabsSpec")
        assertThat(preview).contains("NextpariBottomNav(")
        assertThat(preview).contains("NextpariMainTabs(")
        assertThat(preview).contains("onAddWallet = { false }")
        assertThat(preview).contains("onSelectWallet = { false }")
        assertThat(preview).doesNotContain("api/player/wallets")
        assertThat(preview).doesNotContain("addWallet")
        assertThat(preview).doesNotContain("setActiveWallet")
        val heightCheck = moduleFile("src/debug/java/com/nextpari/app/debug/MatchCardHeightCheckActivity.kt").readText()
        assertThat(heightCheck).contains("NextpariMatchCard(")
        assertThat(heightCheck).contains("Borussia Mönchengladbach")
        assertThat(heightCheck).contains("FC Polissya Zhytomyr")
        assertThat(heightCheck).doesNotContain("heightIn(min")
        assertThat(heightCheck).doesNotContain("minHeight")
        val layoutCheck = moduleFile("src/debug/java/com/nextpari/app/debug/MarketLayoutCheckActivity.kt").readText()
        assertThat(layoutCheck).contains("MarketsGrid(")
        assertThat(layoutCheck).contains("Тотал")
        assertThat(layoutCheck).contains("Фора")
        assertThat(layoutCheck).doesNotContain("K1")
        assertThat(layoutCheck).doesNotContain("Ф1")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(
            File("app/$relative"),
            File("android/app/$relative"),
            File(relative),
        )
        return candidates.firstOrNull { it.exists() } ?: candidates.last()
    }
}
