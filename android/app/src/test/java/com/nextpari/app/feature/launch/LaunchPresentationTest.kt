package com.nextpari.app.feature.launch

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LaunchPresentationTest {
    @Test
    fun coldBrandingStaysInsideTheShortWindow() {
        assertThat(LaunchPresentation.BRAND_MS).isAtLeast(700L)
        assertThat(LaunchPresentation.BRAND_MS).isAtMost(1000L)
    }

    @Test
    fun signedOutResumeShowsBrandingAndAuthenticatedResumeDoesNot() {
        assertThat(LaunchPresentation.holdSplashOnResume(authenticated = false)).isTrue()
        assertThat(LaunchPresentation.holdSplashOnResume(authenticated = true)).isFalse()
    }
}
