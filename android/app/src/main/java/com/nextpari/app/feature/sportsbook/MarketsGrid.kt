package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun MarketsGrid(
    sport: String,
    markets: List<MarketGroup>,
    initialPinned: Set<String> = emptySet(),
    loading: Boolean = false,
) {
    val tabs = MarketTabs.forSport(sport)
    var tab by rememberSaveable { mutableStateOf(tabs.first().id) }
    var openKeys by rememberSaveable { mutableStateOf(setOf<String>()) }
    var pinned by rememberSaveable { mutableStateOf(initialPinned) }
    var selected by rememberSaveable { mutableStateOf(setOf<String>()) }
    var bootstrappedTab by rememberSaveable { mutableStateOf("") }
    val filtered = MarketAccordionLogic.sortPinnedFirst(MarketTabs.filter(markets, tab), pinned)

    LaunchedEffect(tab, filtered.map { it.key }) {
        if (filtered.isEmpty()) return@LaunchedEffect
        if (bootstrappedTab == tab) return@LaunchedEffect
        bootstrappedTab = tab
        openKeys = MarketAccordionLogic.initialOpenKeys(filtered)
    }

    Column(
        Modifier
            .fillMaxWidth()
            .shadow(12.dp, RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .background(Color.White)
            .padding(top = 8.dp, bottom = 96.dp),
    ) {
        LazyRow(
            Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(tabs, key = { it.id }) { spec ->
                val active = spec.id == tab
                Box(
                    Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (active) Color(0xFF22C55E) else Color.White)
                        .clickable { tab = spec.id }
                        .padding(horizontal = if (active) 20.dp else 16.dp, vertical = 6.dp),
                ) {
                    Text(
                        spec.label,
                        color = if (active) Color.White else Color(0xFF52525B),
                        fontSize = 13.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    )
                }
            }
        }
        when {
            loading && markets.isEmpty() -> Text(
                "Загрузка росписи...",
                color = Color(0xFF666666),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
            )
            filtered.isEmpty() -> Text(
                "Нет рынков по этому фильтру",
                color = Color(0xFF666666),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 64.dp),
            )
            else -> filtered.forEach { market ->
                MarketAccordion(
                    market = market,
                    open = MarketAccordionLogic.isOpen(market.key, openKeys, pinned),
                    pinned = market.key in pinned,
                    selectedKeys = selected,
                    onToggle = { openKeys = MarketAccordionLogic.toggle(openKeys, market.key) },
                    onPin = { pinned = MarketAccordionLogic.togglePin(pinned, market.key) },
                    onSelect = { outcome ->
                        val id = outcomeIdentity(outcome)
                        selected = if (id in selected) selected - id else selected + id
                    },
                )
            }
        }
    }
}
