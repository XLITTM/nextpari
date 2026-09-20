package com.nextpari.app.feature.promo

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariIcons

@Composable
fun VipCashbackScreen(onBack: () -> Unit) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var selectedId by rememberSaveable { mutableIntStateOf(4) }
    val selected = VipCatalog.levels.firstOrNull { it.id == selectedId } ?: VipCatalog.levels[3]
    Column(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(Color(0xFF070C10), Color(0xFF05090C), Color(0xFF05090C))),
            )
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clickable(onClick = onBack), contentAlignment = Alignment.Center) {
                Icon(NextpariIcons.Back, contentDescription = "Назад", tint = Color.White.copy(alpha = 0.85f))
            }
            Text("VIP CLUB", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Spacer(Modifier.width(40.dp))
        }
        VipHero()
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            VipTabButton("VIP уровни", NextpariIcons.Vip, tab == 0, Modifier.weight(1f)) { tab = 0 }
            VipTabButton("Кешбэк", NextpariIcons.Cashback, tab == 1, Modifier.weight(1f)) { tab = 1 }
        }
        if (tab == 0) LevelsPanel(selected) { selectedId = it } else CashbackPanel()
        PreviewNotice()
    }
}

@Composable
private fun VipHero() {
    Box(Modifier.fillMaxWidth().height(214.dp).padding(start = 16.dp)) {
        Image(
            painterResource(VipCatalog.tigerRes),
            contentDescription = null,
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .width(210.dp)
                .height(228.dp)
                .offset(x = 12.dp),
            contentScale = ContentScale.Fit,
        )
        Column(Modifier.fillMaxWidth(0.62f).padding(top = 8.dp)) {
            Box(
                Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .border(1.dp, Color(0xFFE9C66A).copy(alpha = 0.7f), CircleShape)
                    .background(Color.Black.copy(alpha = 0.3f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(NextpariIcons.Vip, contentDescription = null, tint = Color(0xFFF3D36F), modifier = Modifier.size(14.dp))
            }
            Row(Modifier.padding(top = 6.dp)) {
                Text("NEXT", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 4.sp)
                Text("PARI", color = Color(0xFFE9C66A), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 4.sp)
            }
            Text("VIP CLUB", color = Color(0xFFE9C66A), fontSize = 40.sp, fontWeight = FontWeight.Black, lineHeight = 36.sp, modifier = Modifier.padding(top = 4.dp))
            Text(VipCatalog.subtitle, color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
            Text(
                "ПРЕВЬЮ ПРОГРАММЫ",
                color = Color(0xFFE9C66A),
                fontSize = 10.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier
                    .padding(top = 12.dp)
                    .clip(RoundedCornerShape(50))
                    .border(1.dp, Color(0xFFE9C66A).copy(alpha = 0.85f), RoundedCornerShape(50))
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun VipTabButton(label: String, icon: ImageVector, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier
            .height(46.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(if (active) Brush.linearGradient(listOf(Color(0xFF16A967), Color(0xFF22E58A))) else Brush.linearGradient(listOf(Color(0xFF10171C), Color(0xFF10171C))))
            .then(if (!active) Modifier.border(1.dp, Color.White.copy(alpha = 0.18f), RoundedCornerShape(18.dp)) else Modifier)
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = null, tint = if (active) Color.White else Color(0xFFBEC8D2).copy(alpha = 0.72f), modifier = Modifier.size(16.dp))
        Text(label, color = if (active) Color.White else Color(0xFFBEC8D2).copy(alpha = 0.72f), fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 6.dp))
    }
}

@Composable
private fun LevelsPanel(selected: VipTier, onSelect: (Int) -> Unit) {
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) {
        listState.scrollToItem((selected.id - 1).coerceAtLeast(0))
    }
    LazyRow(
        state = listState,
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(VipCatalog.levels, key = { it.id }) { tier ->
            val active = tier.id == selected.id
            Column(
                Modifier
                    .width(110.dp)
                    .then(if (active) Modifier.shadow(12.dp, RoundedCornerShape(20.dp), ambientColor = Color(tier.glow), spotColor = Color(tier.glow)) else Modifier)
                    .clip(RoundedCornerShape(20.dp))
                    .background(Brush.verticalGradient(listOf(Color(tier.mid).copy(alpha = 0.55f), Color(tier.from), Color(0xFF07090C))))
                    .border(1.dp, Color(tier.glow).copy(alpha = if (active) 0.7f else 0.22f), RoundedCornerShape(20.dp))
                    .clickable { onSelect(tier.id) }
                    .padding(top = 12.dp, bottom = 10.dp, start = 6.dp, end = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(Brush.radialGradient(listOf(Color(tier.to), Color(tier.mid), Color(tier.from))))
                        .border(1.dp, Color(tier.to).copy(alpha = 0.7f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(tierIcon(tier.id), contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
                }
                Text("${tier.id}", color = Color.White.copy(alpha = 0.65f), fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                Text(tier.name, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold)
                Text("${tier.cashbackLabel} кешбэк", color = Color(0xFFE9C66A), fontSize = 10.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
            }
        }
    }
    Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.Center) {
        VipCatalog.levels.forEach { tier ->
            Box(
                Modifier
                    .padding(horizontal = 3.dp)
                    .height(6.dp)
                    .width(if (tier.id == selected.id) 14.dp else 6.dp)
                    .clip(RoundedCornerShape(50))
                    .background(if (tier.id == selected.id) Color(0xFF22E58A) else Color.White.copy(alpha = 0.22f)),
            )
        }
    }
    Column(
        Modifier
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(Color(0xF00F161C))
            .border(1.dp, Color(selected.glow).copy(alpha = 0.38f), RoundedCornerShape(24.dp))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Box(
                Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(Brush.radialGradient(listOf(Color(selected.to), Color(selected.mid), Color(selected.from)))),
                contentAlignment = Alignment.Center,
            ) {
                Icon(tierIcon(selected.id), contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
            }
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(selected.name, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
                Text("Привилегии уровня", color = Color.White.copy(alpha = 0.55f), fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
            }
            Text(
                "Уровень ${selected.id}",
                color = Color(selected.glow),
                fontSize = 10.sp,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .border(1.dp, Color(selected.glow).copy(alpha = 0.55f), RoundedCornerShape(50))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
        Column(
            Modifier
                .padding(top = 16.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(Brush.linearGradient(listOf(Color(0x14E9C66A), Color(0x1422E58A))))
                .border(1.dp, Color(0xFFE9C66A).copy(alpha = 0.28f), RoundedCornerShape(18.dp))
                .padding(12.dp),
        ) {
            Text("Кешбэк", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Text(selected.cashbackLabel, color = Color(0xFFF3D36F), fontSize = 22.sp, fontWeight = FontWeight.Black)
            if (selected.cashbackPeriod != null) {
                Text("Начисление", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
                Text(selected.cashbackPeriod, color = Color(0xFF22E58A), fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
        VipCatalog.privileges.forEachIndexed { index, (title, desc) ->
            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.Top) {
                Box(
                    Modifier.size(32.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.04f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(privilegeIcon(index), contentDescription = null, tint = Color(0xFFE9C66A), modifier = Modifier.size(16.dp))
                }
                Column(Modifier.padding(start = 12.dp)) {
                    Text(title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Text(desc, color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp)
                }
            }
        }
        Row(
            Modifier
                .padding(top = 12.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color.Black.copy(alpha = 0.35f))
                .padding(12.dp),
        ) {
            Icon(NextpariIcons.Info, contentDescription = null, tint = Color.White.copy(alpha = 0.45f), modifier = Modifier.size(16.dp))
            Text(VipCatalog.levelsNotice, color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
private fun CashbackPanel() {
    Column(Modifier.padding(horizontal = 16.dp)) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xF50E1A16))
                .border(1.dp, Color(0xFF22E58A).copy(alpha = 0.28f), RoundedCornerShape(24.dp))
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painterResource(VipCatalog.coinRes),
                contentDescription = null,
                modifier = Modifier.fillMaxWidth().height(180.dp),
                contentScale = ContentScale.Fit,
            )
            Text("Кешбэк", color = Color(0xFFE9C66A), fontSize = 40.sp, fontWeight = FontWeight.Black)
            Text(VipCatalog.cashbackLead, color = Color.White.copy(alpha = 0.65f), fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 12.dp))
            Text(
                "СКОРО",
                color = Color(0xFFE9C66A),
                fontSize = 11.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 2.sp,
                modifier = Modifier
                    .padding(top = 16.dp)
                    .clip(RoundedCornerShape(50))
                    .border(1.dp, Color(0xFFE9C66A).copy(alpha = 0.85f), RoundedCornerShape(50))
                    .padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        Column(
            Modifier
                .padding(top = 12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0xF00C1216))
                .border(1.dp, Color(0xFFE9C66A).copy(alpha = 0.22f), RoundedCornerShape(20.dp))
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            VipCatalog.levels.forEachIndexed { index, tier ->
                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.Top) {
                    Text(tier.name, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Column(horizontalAlignment = Alignment.End) {
                        Text(tier.cashbackLabel, color = Color(0xFFF3D36F), fontSize = 13.sp, fontWeight = FontWeight.ExtraBold)
                        if (tier.cashbackPeriod != null) {
                            Text(tier.cashbackPeriod, color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp)
                        }
                    }
                }
                if (index != VipCatalog.levels.lastIndex) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.06f)))
                }
            }
        }
        Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FeatureCard("Зависит от VIP-уровня", "Чем выше уровень, тем больше привилегий", NextpariIcons.Vip, Modifier.weight(1f))
            FeatureCard("Рассчитывается автоматически", "Всё происходит автоматически системой", NextpariIcons.Settings, Modifier.weight(1f))
            FeatureCard("Условия будут опубликованы", "Подробная информация перед запуском", NextpariIcons.Gift, Modifier.weight(1f))
        }
    }
}

@Composable
private fun FeatureCard(title: String, desc: String, icon: ImageVector, modifier: Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(Color(0xEB0C1216))
            .border(1.dp, Color(0xFFE9C66A).copy(alpha = 0.22f), RoundedCornerShape(18.dp))
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = null, tint = Color(0xFFE9C66A), modifier = Modifier.size(16.dp))
        Text(title, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
        Text(desc, color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun PreviewNotice() {
    Row(
        Modifier
            .padding(16.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xEB081210))
            .border(1.dp, Color(0xFF22E58A).copy(alpha = 0.32f), RoundedCornerShape(22.dp))
            .padding(14.dp),
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(Color(0xFF16A967), Color(0xFF22E58A)))),
            contentAlignment = Alignment.Center,
        ) {
            Icon(NextpariIcons.Vip, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
        }
        Text(VipCatalog.previewNotice, color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp, modifier = Modifier.padding(start = 12.dp))
    }
}

private fun tierIcon(id: Int): ImageVector = when (id) {
    1 -> NextpariIcons.Trophy
    2 -> NextpariIcons.FavoriteStar
    3 -> NextpariIcons.Shield
    5 -> NextpariIcons.Diamond
    6 -> NextpariIcons.Promo
    7 -> NextpariIcons.Trophy
    else -> NextpariIcons.Vip
}

private fun privilegeIcon(index: Int): ImageVector = when (index) {
    0 -> NextpariIcons.Gift
    1 -> NextpariIcons.FavoriteStar
    else -> NextpariIcons.Diamond
}
