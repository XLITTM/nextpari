package com.nextpari.app.core.ui

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class LauncherBrandingTest {
    @Test
    fun launcherUsesTheApprovedLogoInsideTheAdaptiveSafeZone() {
        val manifest = moduleFile("src/main/AndroidManifest.xml").readText()
        val foreground = moduleFile("src/main/res/drawable/ic_launcher_foreground.xml").readText()
        val adaptive = moduleFile("src/main/res/mipmap-anydpi-v26/ic_launcher.xml").readText()
        val round = moduleFile("src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml").readText()
        val name = moduleFile("src/main/res/values/strings.xml").readText()
        assertThat(manifest).contains("android:icon=\"@mipmap/ic_launcher\"")
        assertThat(manifest).contains("android:roundIcon=\"@mipmap/ic_launcher_round\"")
        assertThat(manifest).contains("android:label=\"@string/app_name\"")
        assertThat(name).contains(">Nextpari<")
        assertThat(foreground).contains("@drawable/logo")
        assertThat(foreground).contains("18%")
        assertThat(foreground).doesNotContain("#22F39A")
        assertThat(adaptive).contains("@drawable/ic_launcher_foreground")
        assertThat(round).contains("@drawable/ic_launcher_foreground")
        assertThat(moduleFile("src/main/res/drawable/logo.png").exists()).isTrue()
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
