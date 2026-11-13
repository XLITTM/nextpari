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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
        if (!usePreview && isSportsFeedEventId(matchId)) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            try {
                viewModel.loadEvent(matchId, refreshClock = true)
                while (true) {
                    delay(if (additionalSportEventId.matches(matchId)) 15_000 else 45_000)
                    viewModel.loadEvent(matchId, refreshClock = true)
                }
            } finally {
                viewModel.leaveEvent(matchId)
            }
        }
    }
    val loading = !usePreview && isSportsFeedEventId(matchId) && (state.detailId != matchId || state.detailLoading)
    val match = if (usePreview) SportsbookPreviewData.match else viewModel.matchById(matchId)
    val markets = if (usePreview) SportsbookPreviewData.markets else viewModel.marketsFor(matchId)
    val initialPinned = if (usePreview) setOf(SportsbookPreviewData.pinnedKey) else emptySet()
    MatchDetailsBody(
        match = match,
        markets = markets,
        initialPinned = initialPinned,
        onBack = onBack,
        onOpenCoupon = { onNavigate(Destinations.BETSLIP) },
        loading = loading,
        notice = state.detail.takeIf { !usePreview && state.detailId == matchId }?.notice,
        retryable = !usePreview && state.detailId == matchId && state.detail.retryable,
        onToggleFavorite = if (usePreview) null else ({ viewModel.toggleMatchFavorite(matchId) }),
        onRefresh = if (usePreview) null else ({ viewModel.loadEvent(matchId, refreshClock = true) }),
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
    loading: Boolean = false,
    notice: String? = null,
    retryable: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    selected: Set<String> = emptySet(),
    onSelect: (MarketOutcome) -> Unit = {},
    onToggleFavorite: (() -> Unit)? = null,
    onOpenCoupon: (() -> Unit)? = null,
) {
    if (match == null) {
        Column(Modifier.fillMaxSize().background(NextpariTheme.colors.bg)) {
            SportsbookScreenHeader(title = "Матч", onBack = onBack, actions = emptyList())
            if (onRefresh != null) FootballFeedControl(loading, notice, retryable, onRefresh)
            if (!loading && (!retryable || notice == null)) {
                Text(notice ?: "Матч недоступен", color = NextpariTheme.colors.text, modifier = Modifier.padding(16.dp))
            }
        }
        return
    }
    key(match.id) {
        var showBroadcast by rememberSaveable { mutableStateOf(false) }
        val marketsState = rememberSaveableStateHolder()
        Column(Modifier.fillMaxSize().background(NextpariTheme.colors.bg).verticalScroll(rememberScrollState())) {
            MatchTracker(
                match, SportsListCatalog.sportName(match.sport), showBroadcast, { showBroadcast = it },
                onBack, onToggleFavorite, onOpenCoupon,
            )
            if (!showBroadcast) {
                if (onRefresh != null) FootballFeedControl(loading, notice, retryable, onRefresh)
                marketsState.SaveableStateProvider("markets") {
                    MarketsGrid(
                        sport = match.sport,
                        markets = markets,
                        initialPinned = initialPinned,
                        loading = loading,
                        selected = selected,
                        onSelect = onSelect,
                    )
                }
            }
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
        )
    }
}

@Preview(showBackground = true, widthDp = 360, heightDp = 740)
@Composable
private fun MatchDetailsDarkPreview() {
    NextpariTheme(darkTheme = true) {
        MatchDetailsBody(
            match = SportsbookPreviewData.match,
            markets = SportsbookPreviewData.markets,
            initialPinned = setOf(SportsbookPreviewData.pinnedKey),
            onBack = {},
        )
    }
}
