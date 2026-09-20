@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.WifiTethering
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.feature.home.MatchCardModel

private val TrackerSlides = listOf("Счёт", "Таймы", "H2H", "Статистика", "Хронология", "Стадион")

@Composable
fun MatchTracker(
    match: MatchCardModel,
    sportLabel: String,
    headerTab: String,
    onHeaderTabChange: (String) -> Unit,
    onBack: () -> Unit,
    onLiveClick: () -> Unit,
) {
    val pagerState = rememberPagerState(pageCount = { TrackerSlides.size })
    var menuOpen by remember { mutableStateOf(false) }
    var favorite by remember { mutableStateOf(match.isFavorite) }
    val venue = venueBrush(match.sport)

    Box(Modifier.fillMaxWidth().height(240.dp).background(venue)) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xB3000000), Color(0x80000000), Color(0xC0000000)))))
        Column(Modifier.fillMaxSize().padding(bottom = 8.dp)) {
            Row(
                Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "Назад",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp).clickable(onClick = onBack),
                )
                Text(
                    "$sportLabel. ${match.league}",
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                )
                Icon(
                    Icons.Outlined.Bolt,
                    contentDescription = "Live",
                    tint = Color(0xFF4ADE80),
                    modifier = Modifier.size(20.dp).clickable(onClick = onLiveClick),
                )
                Spacer(Modifier.width(12.dp))
                Icon(
                    Icons.Outlined.MoreVert,
                    contentDescription = "Меню",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp).clickable { menuOpen = !menuOpen },
                )
            }
            Row(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(top = 6.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color(0x66000000))
                    .padding(2.dp),
            ) {
                HeaderChip("Информация", headerTab == "info") { onHeaderTabChange("info") }
                HeaderChip("Трансляция", headerTab == "stream") { onHeaderTabChange("stream") }
            }
            HorizontalPager(state = pagerState, modifier = Modifier.weight(1f).fillMaxWidth()) { page ->
                when (page) {
                    0 -> ScoreSlide(match, favorite) { favorite = !favorite }
                    1 -> TrackerEmpty("Нет данных по таймам")
                    2 -> TrackerEmpty("История встреч недоступна")
                    3 -> TrackerEmpty("Статистика недоступна")
                    4 -> TrackerEmpty("Событий пока нет")
                    else -> TrackerEmpty("Данные о стадионе недоступны")
                }
            }
            Row(Modifier.fillMaxWidth().padding(bottom = 4.dp), horizontalArrangement = Arrangement.Center) {
                repeat(TrackerSlides.size) { index ->
                    Box(
                        Modifier
                            .padding(horizontal = 3.dp)
                            .size(if (pagerState.currentPage == index) 7.dp else 6.dp)
                            .clip(CircleShape)
                            .background(if (pagerState.currentPage == index) Color.White else Color.White.copy(alpha = 0.35f)),
                    )
                }
            }
        }
        if (menuOpen) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 40.dp, end = 12.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xF00B131D))
                    .padding(12.dp),
            ) {
                Text("Меню матча", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun HeaderChip(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (active) Color.White else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 2.dp),
    ) {
        Text(label, color = if (active) Color.Black else Color(0xFFD4D4D8), fontSize = 12.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Medium)
    }
}

@Composable
private fun ScoreSlide(match: MatchCardModel, favorite: Boolean, onToggleFavorite: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TeamBlock(match.team1, match.team1LogoRes, Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 8.dp)) {
                Text(
                    if (match.isLive && !match.score.isNullOrBlank()) match.score else "— : —",
                    color = Color.White,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(
                    if (match.isLive) (match.period ?: "LIVE") else (match.kickoffLabel ?: "Не начался"),
                    color = Color(0xFFE5E7EB),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            TeamBlock(match.team2, match.team2LogoRes, Modifier.weight(1f))
        }
        Icon(
            if (favorite) Icons.Outlined.Star else Icons.Outlined.StarBorder,
            contentDescription = null,
            tint = if (favorite) Color(0xFF4ADE80) else Color.White,
            modifier = Modifier.padding(top = 8.dp).size(18.dp).clickable(onClick = onToggleFavorite),
        )
    }
}

@Composable
private fun TeamBlock(name: String, logoRes: Int?, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(Color(0x33FFFFFF)), contentAlignment = Alignment.Center) {
            if (logoRes != null) {
                Image(painterResource(logoRes), contentDescription = null, modifier = Modifier.size(40.dp), contentScale = ContentScale.Crop)
            } else {
                Text(name.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
        Text(name, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun TrackerEmpty(message: String) {
    Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
        Text(message, color = Color(0xFFE5E7EB), fontSize = 13.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
    }
}

@Composable
fun StreamPanel() {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .background(Color.White)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Outlined.WifiTethering, contentDescription = null, tint = Color(0xFF22C55E), modifier = Modifier.size(40.dp))
        Text("Трансляция недоступна", color = Color(0xFF1A1A1A), fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
        Text("Стрим появится после подключения провайдера", color = Color(0xFF666666), fontSize = 14.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp, bottom = 80.dp))
    }
}

private fun venueBrush(sport: String): Brush {
    val end = when (sport) {
        "football" -> Color(0xFF14532D)
        "tennis" -> Color(0xFF365314)
        "basketball" -> Color(0xFF7C2D12)
        "hockey" -> Color(0xFF1E3A5F)
        "esports" -> Color(0xFF3B0764)
        else -> Color(0xFF111827)
    }
    return Brush.verticalGradient(listOf(Color(0xFF0B131D), end))
}
