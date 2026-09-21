package com.nextpari.app.feature.home

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class HomeFeedVisibilityTest {
    @Test
    fun topLiveHidesWhenEmptyAndNotLoading() {
        assertThat(HomeFeedVisibility.topLive(loading = false, count = 0)).isEqualTo(HomeSectionBody.Hidden)
        assertThat(HomeFeedVisibility.topLive(loading = true, count = 0)).isEqualTo(HomeSectionBody.Skeleton)
        assertThat(HomeFeedVisibility.topLive(loading = false, count = 2)).isEqualTo(HomeSectionBody.Data)
        assertThat(HomeFeedVisibility.topLive(loading = true, count = 1)).isEqualTo(HomeSectionBody.Data)
    }

    @Test
    fun lineAndEsportsShowEmptyTextWhenIdleWithoutMatches() {
        assertThat(HomeFeedVisibility.alwaysVisibleSection(loading = false, count = 0))
            .isEqualTo(HomeSectionBody.EmptyText)
        assertThat(HomeFeedVisibility.alwaysVisibleSection(loading = true, count = 0))
            .isEqualTo(HomeSectionBody.Skeleton)
        assertThat(HomeFeedVisibility.alwaysVisibleSection(loading = false, count = 3))
            .isEqualTo(HomeSectionBody.Data)
    }

    @Test
    fun championshipsHiddenWhenEmpty() {
        assertThat(HomeFeedVisibility.optionalDataOnly(0)).isEqualTo(HomeSectionBody.Hidden)
        assertThat(HomeFeedVisibility.optionalDataOnly(4)).isEqualTo(HomeSectionBody.Data)
    }
}
