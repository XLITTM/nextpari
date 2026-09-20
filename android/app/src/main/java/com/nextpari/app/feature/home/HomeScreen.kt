package com.nextpari.app.feature.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Casino
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.SportsEsports
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextpari.app.core.navigation.Destinations
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
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(colors.bg),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        when (state.mainTabId) {
            "casino" -> {
                item(key = "casino") { CasinoLanding(onNavigate) }
            }
            "esports" -> {
                item(key = "esports-disciplines") { EsportsDisciplines(state.esports) }
                item(key = "esports-live") {
                    MatchSection("Киберспорт LIVE", state.liveTitles, Destinations.SPORTS_CYBERS, onNavigate, "Esports")
                }
                item(key = "esports-line") {
                    MatchSection("Киберспорт Линия", state.lineTitles, Destinations.SPORTS_CYBERS, onNavigate, "Esports")
                }
            }
            "sport" -> {
                item(key = "sports") { SportsSelector(state, viewModel::selectSport, excludeEsports = true) }
                item(key = "live") { MatchSection("Популярное LIVE", state.liveTitles, Destinations.GAMELIST_LIVE, onNavigate) }
                item(key = "line") { MatchSection("Популярное Линия", state.lineTitles, Destinations.GAMELIST_LINE, onNavigate) }
                if (state.championships.isNotEmpty()) {
                    item(key = "champs") { Championships(state.championships, onNavigate) }
                }
            }
            else -> {
                item(key = "sports") { SportsSelector(state, viewModel::selectSport) }
                item(key = "promos") { PromoRow(state.promos, onNavigate) }
                item(key = "live") { MatchSection("Популярное LIVE", state.liveTitles, Destinations.GAMELIST_LIVE, onNavigate) }
                item(key = "line") { MatchSection("Популярное Линия", state.lineTitles, Destinations.GAMELIST_LINE, onNavigate) }
                if (state.championships.isNotEmpty()) {
                    item(key = "champs") { Championships(state.championships, onNavigate) }
                }
                item(key = "esports-disciplines") { EsportsDisciplines(state.esports) }
            }
        }
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
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(sports, key = { it.id }) { sport ->
            val active = sport.id == state.selectedSportId
            val interaction = remember { MutableInteractionSource() }
            val pressed by interaction.collectIsPressedAsState()
            val scale by animateFloatAsState(if (pressed) 0.96f else 1f, label = "sport-press")
            Column(
                modifier = Modifier
                    .width(70.dp)
                    .graphicsLayer { scaleX = scale; scaleY = scale }
                    .shadow(if (active) 6.dp else 2.dp, RoundedCornerShape(NpRadiusCard))
                    .clip(RoundedCornerShape(NpRadiusCard))
                    .background(colors.surface)
                    .clickable(interactionSource = interaction, indication = null) { onSport(sport.id) }
                    .padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Image(
                    painter = painterResource(SportIconRes.drawable(sport.id)),
                    contentDescription = sport.name,
                    modifier = Modifier.size(24.dp),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    sport.name,
                    color = if (active) TabActiveGold else colors.textSecondary,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun PromoRow(promos: List<HomePromo>, onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(promos, key = { it.route }) { promo ->
            val interaction = remember { MutableInteractionSource() }
            val pressed by interaction.collectIsPressedAsState()
            val scale by animateFloatAsState(if (pressed) 0.97f else 1f, label = "promo-press")
            Column(
                modifier = Modifier
                    .width(110.dp)
                    .graphicsLayer { scaleX = scale; scaleY = scale }
                    .clickable(interactionSource = interaction, indication = null) { onNavigate(promo.route) },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Image(
                    painter = painterResource(promo.imageRes),
                    contentDescription = promo.title,
                    modifier = Modifier
                        .width(110.dp)
                        .height(60.dp)
                        .clip(RoundedCornerShape(NpRadiusCard)),
                    contentScale = ContentScale.Crop,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    promo.title,
                    color = colors.textMuted,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
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
    Column(Modifier.padding(top = 8.dp)) {
        SectionTitle(title, badge) { onNavigate(seeAllRoute) }
        if (items.isEmpty()) {
            MatchEmptyCarousel()
        } else {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(items, key = { it }) { label ->
                    MatchPreviewCard(label) { onNavigate(Destinations.match(label)) }
                }
            }
        }
    }
}

@Composable
private fun MatchEmptyCarousel() {
    val colors = NextpariTheme.colors
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(2, key = { it }) {
            Column(
                modifier = Modifier
                    .width(260.dp)
                    .clip(RoundedCornerShape(NpRadiusCard))
                    .background(colors.surface)
                    .padding(14.dp),
            ) {
                Box(Modifier.width(88.dp).height(10.dp).clip(RoundedCornerShape(6.dp)).background(colors.surfaceMuted))
                Spacer(Modifier.height(14.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(22.dp).clip(CircleShape).background(colors.surfaceMuted))
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.width(120.dp).height(10.dp).clip(RoundedCornerShape(6.dp)).background(colors.surfaceMuted))
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(22.dp).clip(CircleShape).background(colors.surfaceMuted))
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.width(100.dp).height(10.dp).clip(RoundedCornerShape(6.dp)).background(colors.surfaceMuted))
                }
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    repeat(3) {
                        Box(
                            Modifier
                                .weight(1f)
                                .height(36.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(colors.surfaceMuted),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MatchPreviewCard(label: String, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    Column(
        modifier = Modifier
            .width(260.dp)
            .clip(RoundedCornerShape(NpRadiusCard))
            .background(colors.surface)
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Text(label, color = colors.text, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun Championships(items: List<String>, onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    Column {
        SectionTitle("Чемпионаты LIVE")
        items.forEach { name ->
            Row(
                modifier = Modifier
                    .padding(horizontal = 16.dp, vertical = 4.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(NpRadiusCard))
                    .background(colors.surfaceMuted)
                    .clickable { onNavigate(Destinations.league(name)) }
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(36.dp).clip(CircleShape).background(colors.accent.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(18.dp).clip(CircleShape).background(colors.accent))
                }
                Spacer(Modifier.width(12.dp))
                Text(name, color = colors.text, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun EsportsDisciplines(items: List<EsportsDiscipline>) {
    Column(Modifier.padding(top = 8.dp)) {
        SectionTitle("Дисциплины", badge = "Esports")
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(items, key = { it.id }) { item ->
                Box(
                    modifier = Modifier
                        .width(160.dp)
                        .height(224.dp)
                        .clip(RoundedCornerShape(NpRadiusCard))
                        .background(Brush.linearGradient(listOf(Color(item.startColor), Color(item.endColor)))),
                ) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 32.dp, y = (-32).dp)
                            .size(112.dp)
                            .clip(CircleShape)
                            .background(Color(0xFF1E3A5F).copy(alpha = 0.55f)),
                    )
                    Icon(
                        Icons.Outlined.SportsEsports,
                        contentDescription = null,
                        tint = Color(0xFF4ADE80).copy(alpha = 0.5f),
                        modifier = Modifier.align(Alignment.Center).size(48.dp),
                    )
                    Box(
                        Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f))))
                            .padding(12.dp),
                    ) {
                        Text(item.name, color = Color.White, fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
private fun CasinoLanding(onNavigate: (String) -> Unit) {
    val colors = NextpariTheme.colors
    Column(Modifier.padding(top = 8.dp)) {
        SectionTitle("Казино")
        CasinoEntry("Слоты", "Тысячи слотов от ведущих студий", Icons.Outlined.Casino) { onNavigate(Destinations.SLOTS) }
        Spacer(Modifier.height(8.dp))
        CasinoEntry("Лайв казино", "Столы с живыми дилерами", Icons.Outlined.LiveTv) { onNavigate(Destinations.LIVE_CASINO) }
        Text(
            "Казино-провайдеры появятся после подключения",
            color = colors.textMuted,
            fontSize = 14.sp,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Composable
private fun CasinoEntry(
    title: String,
    desc: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
) {
    val colors = NextpariTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.98f else 1f, label = "casino-press")
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(2.dp, RoundedCornerShape(NpRadiusCard))
            .clip(RoundedCornerShape(NpRadiusCard))
            .background(colors.surface)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = Color(0xFF4ADE80), modifier = Modifier.size(24.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(title, fontWeight = FontWeight.ExtraBold, color = colors.text, fontSize = 14.sp)
            Text(desc, color = colors.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = colors.textMuted)
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
                modifier = Modifier
                    .padding(start = 8.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF0C1A2E))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
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
