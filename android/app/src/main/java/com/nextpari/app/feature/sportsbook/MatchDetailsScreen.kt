package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.BuildConfig
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.MatchCardModel

@Composable
fun MatchDetailsScreen(
    matchId: String,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: SportsbookViewModel = viewModel(factory = SportsbookViewModel.Factory),
    preview: Boolean = false,
) {
    val usePreview = preview && BuildConfig.DEBUG
    val match = if (usePreview) SportsbookPreviewData.match else viewModel.matchById(matchId)
    val markets = if (usePreview) SportsbookPreviewData.markets else viewModel.marketsFor(matchId)
    val initialPinned = if (usePreview) setOf(SportsbookPreviewData.pinnedKey) else emptySet()
    MatchDetailsBody(
        match = match,
        markets = markets,
        initialPinned = initialPinned,
        onBack = onBack,
        onNavigate = onNavigate,
    )
}

@Composable
fun MatchDetailsBody(
    match: MatchCardModel?,
    markets: List<MarketGroup>,
    initialPinned: Set<String>,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    if (match == null) {
        Box(Modifier.fillMaxSize().background(Color(0xFFF5F5F5)), contentAlignment = Alignment.Center) {
            Text("Матч не найден", color = Color(0xFF1A1A1A))
        }
        return
    }
    var headerTab by rememberSaveable { mutableStateOf("info") }
    Column(Modifier.fillMaxSize().background(Color(0xFFF5F5F5)).verticalScroll(rememberScrollState())) {
        MatchTracker(
            match = match,
            sportLabel = SportsListCatalog.sportName(match.sport),
            headerTab = headerTab,
            onHeaderTabChange = { headerTab = it },
            onBack = onBack,
            onLiveClick = { onNavigate(Destinations.BETSLIP) },
        )
        if (headerTab == "info") {
            MarketsGrid(
                sport = match.sport,
                markets = markets,
                initialPinned = initialPinned,
            )
        } else {
            StreamPanel()
        }
    }
}

@Preview(showBackground = true, widthDp = 390, heightDp = 844)
@Composable
private fun MatchDetailsPreview() {
    NextpariTheme(darkTheme = false) {
        MatchDetailsBody(
            match = SportsbookPreviewData.match,
            markets = SportsbookPreviewData.markets,
            initialPinned = setOf(SportsbookPreviewData.pinnedKey),
            onBack = {},
            onNavigate = {},
        )
    }
}
