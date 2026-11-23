package com.nextpari.app.feature.home

import org.junit.Assert.assertEquals
import org.junit.Test

class HomeTabSportResetTest {
    @Test
    fun topTabClearsPersistedSportSoPopularLineIsNotStuckOnNba() {
        val viewModel = HomeViewModel(FakeHomeCatalogRepository())
        viewModel.selectSport("basketball")
        assertEquals("basketball", viewModel.uiState.value.selectedSportId)
        viewModel.selectTab("sport")
        assertEquals("basketball", viewModel.uiState.value.selectedSportId)
        viewModel.selectTab("top")
        assertEquals("top", viewModel.uiState.value.mainTabId)
        assertEquals("all", viewModel.uiState.value.selectedSportId)
    }
}
