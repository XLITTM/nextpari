package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun MarketsGrid(
    sport: String,
    markets: List<MarketGroup>,
    initialPinned: Set<String> = emptySet(),
    loading: Boolean = false,
    selected: Set<String> = emptySet(),
    onSelect: (MarketOutcome) -> Unit = {},
) {
    val colors = NextpariTheme.colors
    val modes = MarketTabs.modes(sport)
    val tabs = MarketTabs.available(sport, markets)
    var mode by rememberSaveable { mutableStateOf("all") }
    var tab by rememberSaveable { mutableStateOf(if (sport == "football") "main" else "all") }
    var openKeys by rememberSaveable { mutableStateOf(setOf<String>()) }
    var pinned by rememberSaveable { mutableStateOf(initialPinned) }
    var initializedTabs by rememberSaveable { mutableStateOf(setOf<String>()) }
    var searching by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    val activeMode = mode.takeIf { id -> modes.any { it.id == id } } ?: "all"
    val scoped = when (activeMode) {
        "players" -> markets.filter(MarketTabs::isPlayerMarket)
        "popular" -> markets.filter { MarketTabs.isPopular(it) && MarketTabs.matchesTab(it, "main", sport) }
        else -> markets.filterNot(MarketTabs::isPlayerMarket)
    }
    val sectionTabs = if (activeMode == "all" && modes.isNotEmpty()) tabs else emptyList()
    val activeTab = tab.takeIf { id -> sectionTabs.any { it.id == id } }
        ?: sectionTabs.firstOrNull()?.id
        ?: "all"
    val filtered = MarketAccordionLogic.sortPinnedFirst(
        if (sectionTabs.isEmpty()) scoped else MarketTabs.filter(scoped, activeTab, sport),
        pinned,
    )
    val visible = if (query.isBlank()) filtered else filtered.filter { it.name.contains(query.trim(), ignoreCase = true) }

    LaunchedEffect(activeMode, activeTab, filtered.map { it.key }) {
        val key = "$activeMode:$activeTab"
        if (filtered.isNotEmpty() && key !in initializedTabs) {
            initializedTabs = initializedTabs + key
            openKeys = openKeys + MarketAccordionLogic.initialOpenKeys(filtered)
        }
    }

    Column(Modifier.fillMaxWidth().background(colors.surface).padding(bottom = 24.dp)) {
        if (markets.isNotEmpty()) {
            Row(
                Modifier.fillMaxWidth().padding(start = 10.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (modes.isNotEmpty()) {
                    MarketModeControl(modes, activeMode) { mode = it }
                }
                val chips = if (modes.isEmpty()) tabs else sectionTabs
                LazyRow(
                    Modifier.weight(1f),
                    contentPadding = PaddingValues(start = if (modes.isEmpty()) 0.dp else 6.dp, end = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(chips, key = { it.id }) { spec ->
                        MarketTabChip(spec.label, spec.id == activeTab) { tab = spec.id }
                    }
                }
                IconButton(onClick = {
                    searching = !searching
                    if (!searching) query = ""
                }) {
                    Icon(if (searching) NextpariWebIcons.X else NextpariWebIcons.Search,
                        contentDescription = if (searching) "Закрыть поиск" else "Поиск рынков", tint = colors.textSecondary)
                }
            }
        }
        if (searching && markets.isNotEmpty()) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Поиск рынков") },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }
        if (visible.isEmpty()) {
            Text(
                when {
                    loading && markets.isEmpty() -> "Загрузка рынков…"
                    markets.isEmpty() -> "Рынки недоступны"
                    else -> "Рынки не найдены"
                },
                color = colors.textSecondary, fontSize = 13.sp, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(14.dp),
            )
        } else visible.forEach { market ->
            MarketAccordion(
                market = market,
                open = MarketAccordionLogic.isOpen(market.key, openKeys, pinned),
                pinned = market.key in pinned,
                selectedKeys = selected,
                onToggle = { openKeys = MarketAccordionLogic.toggle(openKeys, market.key) },
                onPin = { pinned = MarketAccordionLogic.togglePin(pinned, market.key) },
                onSelect = onSelect,
            )
        }
    }
}

@Composable
private fun MarketModeControl(
    modes: List<MarketTabSpec>,
    activeId: String,
    onSelect: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val shape = RoundedCornerShape(12.dp)
    var expanded by rememberSaveable { mutableStateOf(false) }
    val active = modes.firstOrNull { it.id == activeId } ?: modes.first()
    Box {
        Row(
            Modifier.height(34.dp).clip(shape)
                .background(colors.surfaceMint)
                .border(1.dp, colors.accent, shape)
                .clickable { expanded = true }
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(NextpariWebIcons.LayoutGrid, contentDescription = active.label, tint = colors.accentInk, modifier = Modifier.size(16.dp))
            Text(
                if (active.id == "all") "Все" else active.label,
                color = colors.accentInk,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
            Icon(NextpariWebIcons.ChevronDown, contentDescription = null, tint = colors.accentInk, modifier = Modifier.size(14.dp))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            modes.forEach { spec ->
                DropdownMenuItem(
                    text = { Text(spec.label, fontWeight = if (spec.id == activeId) FontWeight.Bold else FontWeight.Medium) },
                    onClick = {
                        onSelect(spec.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

@Composable
private fun MarketTabChip(label: String, active: Boolean, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    val shape = RoundedCornerShape(12.dp)
    Box(
        Modifier.height(34.dp).clip(shape)
            .background(if (active) colors.surfaceMint else colors.surface)
            .border(1.dp, if (active) colors.accent else colors.border, shape)
            .clickable(onClick = onClick).padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (active) colors.accentInk else colors.textSecondary,
            fontSize = 12.sp,
            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
        )
    }
}
