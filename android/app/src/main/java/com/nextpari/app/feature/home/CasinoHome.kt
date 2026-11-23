package com.nextpari.app.feature.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.icons.NextpariSectionIcons
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.components.ProductSectionHeader
import com.nextpari.app.core.ui.neon.VipNeonChrome
import com.nextpari.app.core.ui.neon.vipNeonFrame
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.casino.CasinoCatalogStore
import com.nextpari.app.feature.casino.CasinoRealCatalog
import kotlinx.coroutines.delay

@Composable
fun CasinoHomeContent(
    features: List<CasinoFeatureCard>,
    tournaments: List<CasinoTournament>,
    categories: List<CasinoCategoryCard>,
    onNavigate: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    var liveActive by remember {
        mutableStateOf(CasinoCatalogStore.peekFresh("", "live", 1) != null)
    }
    LaunchedEffect(Unit) {
        if (!liveActive) {
            delay(280)
            liveActive = true
        }
    }
    Column(Modifier.padding(top = 8.dp, bottom = 16.dp)) {
        ProductSectionHeader(title = "Казино")
        CasinoEntry("Слоты", "Каталог слотов", NextpariWebIcons.Dices, NextpariWebIcons.MenuGreen) {
            onNavigate(Destinations.SLOTS)
        }
        Spacer(Modifier.height(8.dp))
        CasinoEntry("Лайв казино", "Каталог Live Casino", NextpariSectionIcons.Casino, Color.Unspecified) {
            onNavigate(Destinations.LIVE_CASINO)
        }
        Spacer(Modifier.height(8.dp))
        CasinoEntry("Моё казино", "Избранное и недавние игры", NextpariWebIcons.Star, Color.Unspecified) {
            onNavigate(Destinations.CASINO_MY)
        }
        Spacer(Modifier.height(8.dp))
        CasinoEntry("Турниры", "Турниры казино", NextpariWebIcons.Trophy, Color.Unspecified) {
            onNavigate(Destinations.CASINO_TOURNAMENTS)
        }
        if (features.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            ProductSectionHeader(title = "Рекомендуем", badge = "Casino", onSeeAll = { onNavigate(Destinations.SLOTS) })
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(features, key = { it.id }) { card ->
                    CasinoFeatureHero(card) { onNavigate(card.destination) }
                }
            }
        }
        if (tournaments.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            ProductSectionHeader(title = "Турниры", badge = "Casino", onSeeAll = { onNavigate(Destinations.CASINO_TOURNAMENTS) })
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(tournaments, key = { it.id }) { card ->
                    CasinoTournamentCard(card) { onNavigate(card.destination) }
                }
            }
        }
        if (categories.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            ProductSectionHeader(title = "Категории", badge = "Casino", onSeeAll = { onNavigate(Destinations.SLOTS) })
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(categories, key = { it.id }) { card ->
                    CasinoCategoryTile(card) { onNavigate(card.destination) }
                }
            }
        }
        CasinoRealCatalog(
            category = "slots",
            title = "Популярные слоты",
            active = true,
            onOpenCatalog = { onNavigate(Destinations.SLOTS) },
            onOpenGame = { game -> onNavigate(Destinations.casinoDemoGame(game.id)) },
        )
        CasinoRealCatalog(
            category = "live",
            title = "Популярное Live Casino",
            active = liveActive,
            onOpenCatalog = { onNavigate(Destinations.LIVE_CASINO) },
            onOpenGame = { game -> onNavigate(Destinations.casinoDemoGame(game.id)) },
        )
    }
}

@Composable
private fun CasinoEntry(
    title: String,
    desc: String,
    icon: ImageVector,
    iconTint: Color = Color(0xFF4ADE80),
    onClick: () -> Unit,
) {
    val colors = NextpariTheme.colors
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .vipNeonFrame(shape = RoundedCornerShape(16.dp))
            .shadow(2.dp, RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .background(if (colors.bg == NextpariColors.Dark.bg) Color(0xFF1F2937) else Color.White)
            .clickable(onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(24.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(title, fontWeight = FontWeight.ExtraBold, color = colors.text, fontSize = 14.sp)
            Text(desc, color = colors.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
        Icon(NextpariWebIcons.ChevronRight, contentDescription = null, tint = colors.textMuted, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun CasinoFeatureHero(card: CasinoFeatureCard, onOpen: () -> Unit) {
    Box(
        Modifier
            .width(280.dp)
            .height(148.dp)
            .vipNeonFrame(shape = RoundedCornerShape(20.dp), chrome = VipNeonChrome.PressOnly)
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onOpen),
    ) {
        Image(
            painter = painterResource(card.imageRes),
            contentDescription = card.title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.78f)))),
        )
        Column(Modifier.align(Alignment.BottomStart).padding(14.dp)) {
            if (card.badge != null) {
                Text(
                    card.badge,
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFF16A34A))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
            Text(card.title, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(card.subtitle, color = Color.White.copy(alpha = 0.85f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun CasinoTournamentCard(model: CasinoTournament, onOpen: () -> Unit) {
    Box(
        Modifier
            .width(240.dp)
            .height(156.dp)
            .vipNeonFrame(
                selected = model.status == CasinoTournamentStatus.ACTIVE,
                gold = true,
                shape = RoundedCornerShape(20.dp),
                chrome = VipNeonChrome.Glow,
            )
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onOpen),
    ) {
        Image(painterResource(model.imageRes), contentDescription = model.title, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x66000000), Color(0xCC031522)))))
        Column(Modifier.fillMaxSize().padding(14.dp)) {
            Text(
                model.status.label,
                color = Color.White,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (model.status == CasinoTournamentStatus.ACTIVE) Color(0xFF16A34A) else Color(0xFF64748B))
                    .padding(horizontal = 8.dp, vertical = 3.dp),
            )
            Spacer(Modifier.weight(1f))
            Text(model.title, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (!model.prizePool.isNullOrBlank()) {
                Text(model.prizePool, color = Color(0xFFFACC15), fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
            }
            if (!model.countdown.isNullOrBlank()) {
                Text(model.countdown, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}

@Composable
private fun CasinoCategoryTile(card: CasinoCategoryCard, onOpen: () -> Unit) {
    Box(
        Modifier
            .width(148.dp)
            .height(108.dp)
            .vipNeonFrame(shape = RoundedCornerShape(18.dp), chrome = VipNeonChrome.PressOnly)
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onOpen),
    ) {
        Image(
            painter = painterResource(card.imageRes),
            contentDescription = card.name,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color(card.startColor).copy(alpha = 0.18f), Color.Black.copy(alpha = 0.78f)),
                    ),
                ),
        )
        Column(Modifier.align(Alignment.BottomStart).padding(12.dp)) {
            Text("Casino", color = Color.White.copy(alpha = 0.75f), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text(
                card.name,
                color = Color.White,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 14.sp,
                lineHeight = 18.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
