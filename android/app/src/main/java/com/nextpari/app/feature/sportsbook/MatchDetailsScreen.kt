package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay
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
    val state by viewModel.state.collectAsStateWithLifecycle()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(matchId, usePreview, lifecycle) {
        if (!usePreview && footballEventId.matches(matchId)) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                viewModel.loadEvent(matchId)
                delay(45_000)
            }
        }
    }
    val loading = !usePreview && footballEventId.matches(matchId) && (state.detailId != matchId || state.detailLoading)
    val match = if (usePreview) SportsbookPreviewData.match else viewModel.matchById(matchId)
    val markets = if (usePreview) SportsbookPreviewData.markets else viewModel.marketsFor(matchId)
    val initialPinned = if (usePreview) setOf(SportsbookPreviewData.pinnedKey) else emptySet()
    MatchDetailsBody(
        match = match,
        markets = markets,
        initialPinned = initialPinned,
        onBack = onBack,
        onNavigate = onNavigate,
        loading = loading,
        notice = state.detail.takeIf { !usePreview && state.detailId == matchId }?.notice,
        onRefresh = if (usePreview) null else ({ viewModel.loadEvent(matchId) }),
        selected = state.selectedKeys,
        onSelect = { it.selection?.let(viewModel::toggle) },
    )
}

@Composable
fun MatchDetailsBody(
    match: MatchCardModel?,
    markets: List<MarketGroup>,
    initialPinned: Set<String>,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    loading: Boolean = false,
    notice: String? = null,
    onRefresh: (() -> Unit)? = null,
    selected: Set<String> = emptySet(),
    onSelect: (MarketOutcome) -> Unit = {},
) {
    if (match == null) {
        Column(Modifier.fillMaxSize().background(NextpariTheme.colors.bg)) {
            SportsbookScreenHeader(title = "Матч", onBack = onBack, actions = emptyList())
            if (onRefresh != null) FootballFeedControl(loading, notice, onRefresh)
            if (!loading && notice == null) {
                Text("Матч недоступен", color = NextpariTheme.colors.text, modifier = Modifier.padding(16.dp))
            }
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
            if (onRefresh != null) FootballFeedControl(loading, notice, onRefresh)
            MarketsGrid(
                sport = match.sport,
                markets = markets,
                initialPinned = initialPinned,
                loading = loading,
                selected = selected,
                onSelect = onSelect,
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
