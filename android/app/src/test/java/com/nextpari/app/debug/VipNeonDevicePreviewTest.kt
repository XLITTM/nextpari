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
        assertThat(preview).contains("BottomNavSpec")
        assertThat(preview).contains("MainTabsSpec")
        assertThat(preview).contains("NextpariBottomNav(")
        assertThat(preview).contains("NextpariMainTabs(")
        assertThat(preview).contains("onAddWallet = { false }")
        assertThat(preview).contains("onSelectWallet = { false }")
        assertThat(preview).doesNotContain("api/player/wallets")
        assertThat(preview).doesNotContain("addWallet")
        assertThat(preview).doesNotContain("setActiveWallet")
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
