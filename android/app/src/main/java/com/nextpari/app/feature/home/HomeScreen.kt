package com.nextpari.app.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.SportsEsports
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.NextpariCard
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.ui.theme.NpRadiusCard
import com.nextpari.app.core.ui.theme.TabActiveGold

@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onNavigate: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = NextpariTheme.colors
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.bg)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
    ) {
        when (state.mainTabId) {
            "casino" -> CasinoLanding(onNavigate)
            "esports" -> EsportsHome(state, onNavigate)
            "sport" -> SportHome(state, viewModel::selectSport, onNavigate)
            else -> TopHome(state, viewModel::selectSport, onNavigate)
        }
    }
}

@Composable
private fun TopHome(
    state: HomeUiState,
    onSport: (String) -> Unit,
    onNavigate: (String) -> Unit,
) {
    SportsSelector(state, onSport)
    PromoRow(state.promos, onNavigate)
    MatchSection("Популярное LIVE", state.liveTitles, Destinations.GAMELIST_LIVE, onNavigate)
    MatchSection("Популярное Линия", state.lineTitles, Destinations.GAMELIST_LINE, onNavigate)
    Championships(state.championships, onNavigate)
    EsportsDisciplines(state.esports)
}

@Composable
private fun SportHome(
    state: HomeUiState,
    onSport: (String) -> Unit,
    onNavigate: (String) -> Unit,
) {
    SportsSelector(state, onSport, excludeEsports = true)
    MatchSection("Популярное LIVE", state.liveTitles, Destinations.GAMELIST_LIVE, onNavigate)
    MatchSection("Популярное Линия", state.lineTitles, Destinations.GAMELIST_LINE, onNavigate)
    Championships(state.championships, onNavigate)
}

@Composable
private fun EsportsHome(state: HomeUiState, onNavigate: (String) -> Unit) {
    EsportsDisciplines(state.esports)
    MatchSection("Киберспорт LIVE", emptyList(), Destinations.SPORTS_CYBERS, onNavigate, badge = "Esports")
    MatchSection("Киберспорт Линия", emptyList(), Destinations.SPORTS_CYBERS, onNavigate, badge = "Esports")
}

@Composable
private fun CasinoLanding(onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    Column(Modifier.padding(top = 8.dp)) {
        SectionTitle("Казино")
        NextpariCard(onClick = { onNavigate(Destinations.SLOTS) }, modifier = Modifier.padding(horizontal = 16.dp)) {
            Text("Слоты", fontWeight = FontWeight.ExtraBold, color = colors.text)
            Text("Игры появятся после подключения провайдера", color = colors.textSecondary, fontSize = 12.sp)
        }
        Spacer(Modifier.height(8.dp))
        NextpariCard(onClick = { onNavigate(Destinations.LIVE_CASINO) }, modifier = Modifier.padding(horizontal = 16.dp)) {
            Text("Лайв казино", fontWeight = FontWeight.ExtraBold, color = colors.text)
            Text("Столы появятся после подключения провайдера", color = colors.textSecondary, fontSize = 12.sp)
        }
        Text(
            "Казино-провайдеры появятся после подключения",
            color = colors.textMuted,
            fontSize = 14.sp,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Composable
private fun SportsSelector(
    state: HomeUiState,
    onSport: (String) -> Unit,
    excludeEsports: Boolean = false,
) {
    val colors = NextpariTheme.colors
    val sports = if (excludeEsports) state.sports.filter { it.id != "esports" } else state.sports
    Row(
        Modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        sports.forEach { sport ->
            val active = sport.id == state.selectedSportId
            Column(
                modifier = Modifier
                    .width(70.dp)
                    .clip(RoundedCornerShape(NpRadiusCard))
                    .background(colors.surface)
                    .clickable { onSport(sport.id) }
                    .padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("●", color = colors.accent, fontSize = 16.sp)
                Text(
                    sport.name,
                    color = if (active) TabActiveGold else colors.textSecondary,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                )
            }
        }
    }
}

@Composable
private fun PromoRow(promos: List<HomePromo>, onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    Row(
        Modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        promos.forEach { promo ->
            Column(
                modifier = Modifier
                    .width(110.dp)
                    .clickable { onNavigate(promo.route) },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .width(110.dp)
                        .height(60.dp)
                        .clip(RoundedCornerShape(NpRadiusCard))
                        .background(colors.surfaceMuted),
                )
                Text(promo.title, color = colors.textMuted, fontSize = 10.sp, fontWeight = FontWeight.Medium, maxLines = 2)
            }
        }
    }
}

@Composable
private fun MatchSection(
    title: String,
    items: List<String>,
    seeAllRoute: String,
    onNavigate: (String) -> Unit,
    badge: String? = null,
) {
    val colors = NextpariTheme.colors
    Column(Modifier.padding(top = 8.dp)) {
        SectionTitle(title, badge) { onNavigate(seeAllRoute) }
        if (items.isEmpty()) {
            Text("Матчи появятся скоро", color = colors.textMuted, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
        }
    }
}

@Composable
private fun Championships(items: List<String>, onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    SectionTitle("Чемпионаты LIVE")
    if (items.isEmpty()) {
        Text(
            "Чемпионаты появятся после подключения ленты",
            color = colors.textMuted,
            fontSize = 14.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
        return
    }
    items.forEach { name ->
        NextpariCard(onClick = { onNavigate(Destinations.league(name)) }, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
            Text(name)
        }
    }
}

@Composable
private fun EsportsDisciplines(items: List<EsportsDiscipline>) {
    val colors = NextpariTheme.colors
    SectionTitle("Дисциплины", badge = "Esports")
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items.forEach { item ->
            Box(
                modifier = Modifier
                    .width(160.dp)
                    .height(224.dp)
                    .clip(RoundedCornerShape(NpRadiusCard))
                    .background(colors.surfaceElevated),
            ) {
                Icon(
                    Icons.Outlined.SportsEsports,
                    contentDescription = null,
                    tint = colors.accent.copy(alpha = 0.5f),
                    modifier = Modifier.align(Alignment.Center).size(48.dp),
                )
                Text(
                    item.name,
                    color = androidx.compose.ui.graphics.Color.White,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.align(Alignment.BottomStart).padding(12.dp),
                )
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, badge: String? = null, onSeeAll: (() -> Unit)? = null) {
    val colors = NextpariTheme.colors
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        if (badge != null) {
            Text(
                badge,
                color = colors.accent,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 8.dp).clip(RoundedCornerShape(8.dp)).background(colors.bg2).padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        if (onSeeAll != null) {
            Spacer(Modifier.weight(1f))
            Row(Modifier.clickable(onClick = onSeeAll), verticalAlignment = Alignment.CenterVertically) {
                Text("Все", color = colors.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = colors.accent, modifier = Modifier.size(14.dp))
            }
        }
    }
}
