package com.nextpari.app.core.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DestinationsTest {
    @Test
    fun unauthenticatedGraphContainsLoginAndRegisterOnly() {
        assertThat(Destinations.unauthenticated).containsExactly(
            Destinations.LOGIN,
            Destinations.REGISTER,
            Destinations.REGISTER_EMAIL,
            Destinations.REGISTER_PHONE,
            Destinations.REGISTER_ONE_CLICK,
        ).inOrder()
    }

    @Test
    fun authenticatedTabsMatchBottomNavigation() {
        assertThat(Destinations.authenticatedTabs).containsExactly(
            Destinations.HOME,
            Destinations.WALLET,
            Destinations.HISTORY,
            Destinations.PROFILE,
        ).inOrder()
        assertThat(Destinations.authenticated).contains(Destinations.SETTINGS)
        assertThat(Destinations.isAuthenticatedTab(Destinations.SETTINGS)).isFalse()
        assertThat(Destinations.isAuthenticatedTab(Destinations.HOME)).isTrue()
    }

    @Test
    fun authAndAppGraphsDoNotOverlap() {
        val overlap = Destinations.unauthenticated.intersect(Destinations.authenticated.toSet())
        assertThat(overlap).isEmpty()
        assertThat(Destinations.isUnauthenticated(Destinations.LOGIN)).isTrue()
        assertThat(Destinations.isUnauthenticated(Destinations.HOME)).isFalse()
    }
}
