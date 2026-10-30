package com.nextpari.app.feature.update

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class ReleaseUpdateTest {
    @Test
    fun trustedHostBuildsTheOfficialDownloadPage() {
        assertThat(ReleaseUpdatePolicy.officialDownloadUrl("https://nextpari.net/")).isEqualTo("https://nextpari.net/download")
        assertThat(ReleaseUpdatePolicy.officialDownloadUrl("https://evil.example/")).isNull()
    }

    @Test
    fun unpublishedOrUntrustedMetadataDoesNotOfferAnUpdate() {
        assertThat(
            ReleaseUpdatePolicy.noticeFrom(
                apiBase = "https://nextpari.net/",
                published = false,
                versionCode = 2,
                versionName = "0.3.0",
                notes = "Заметки",
                mode = "recommended",
                currentVersionCode = 1,
                dismissedVersionCode = null,
            ),
        ).isNull()
        val notice = ReleaseUpdatePolicy.noticeFrom(
            apiBase = "https://nextpari.net/",
            published = true,
            versionCode = 2,
            versionName = "0.3.0",
            notes = "Заметки",
            mode = "recommended",
            currentVersionCode = 1,
            dismissedVersionCode = null,
        )
        assertThat(notice?.downloadUrl).isEqualTo("https://nextpari.net/download")
        assertThat(
            ReleaseUpdatePolicy.noticeFrom(
                apiBase = "https://evil.example/",
                published = true,
                versionCode = 9,
                versionName = "9.0.0",
                notes = "https://evil.example/app.apk",
                mode = "recommended",
                currentVersionCode = 1,
                dismissedVersionCode = null,
            ),
        ).isNull()
    }

    @Test
    fun laterHidesTheSameVersionAndForcedModeIsIgnored() {
        assertThat(
            ReleaseUpdatePolicy.noticeFrom(
                "https://nextpari.net/", true, 2, "0.3.0", "", "recommended", 1, 2,
            ),
        ).isNull()
        assertThat(
            ReleaseUpdatePolicy.noticeFrom(
                "https://nextpari.net/", true, 2, "0.3.0", "", "forced", 1, null,
            ),
        ).isNull()
    }

    @Test
    fun releaseSigningReadsTheOwnerKeystoreFromTheEnvironment() {
        val gradle = File("build.gradle.kts").readText()
        assertThat(gradle).contains("NEXTPARI_RELEASE_STORE_FILE")
        assertThat(gradle).doesNotContain("storePassword = \"")
        assertThat(gradle).doesNotContain(".jks")
        assertThat(gradle).contains("versionCode = 2")
        assertThat(gradle).contains("versionName = \"0.2.0\"")
        assertThat(gradle).doesNotContain("0.2.0-a002")
        assertThat(gradle).doesNotContain("signingConfig = signingConfigs.getByName(\"debug\")")
        assertThat(gradle).doesNotContain("isDebuggable = true")
    }
}
