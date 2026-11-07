package com.rixobet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SportsBasketball
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.SportsTennis
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rixobet.app.domain.Attempt
import com.rixobet.app.domain.Catalog
import com.rixobet.app.domain.FixtureMode
import com.rixobet.app.domain.Fixtures
import com.rixobet.app.domain.LocalPrefs
import com.rixobet.app.domain.ThemeMode
import com.rixobet.app.domain.UserActions
import com.rixobet.app.navigation.MainTab
import com.rixobet.app.navigation.Overlay
import com.rixobet.app.ui.components.BallArt
import com.rixobet.app.ui.components.CoinArt
import com.rixobet.app.ui.components.CrownMark
import com.rixobet.app.ui.components.CupArt
import com.rixobet.app.ui.components.DemoBanner
import com.rixobet.app.ui.components.GiftArt
import com.rixobet.app.ui.components.NeonButton
import com.rixobet.app.ui.components.NeonCard
import com.rixobet.app.ui.components.OddsRow
import com.rixobet.app.ui.components.RixoField
import com.rixobet.app.ui.components.RixoLogo
import com.rixobet.app.ui.components.ScreenTitle
import com.rixobet.app.ui.components.UnavailableBlock
import com.rixobet.app.ui.theme.Gold
import com.rixobet.app.ui.theme.LocalRixoTokens

@Composable
fun MainShell(
    tab: MainTab,
    stack: List<Overlay>,
    prefs: LocalPrefs,
    mode: FixtureMode,
    onTab: (MainTab) -> Unit,
    onPush: (Overlay) -> Unit,
    onPrefs: (LocalPrefs) -> Unit,
    onLeave: () -> Unit,
    onPop: () -> Unit,
    onNotice: (String, String) -> Unit,
) {
    val overlay = stack.lastOrNull()
    Scaffold(
        containerColor = Color.Transparent,
        bottomBar = {
            RixoBottomBar(selected = tab, onSelect = onTab)
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (overlay) {
                Overlay.Live -> LiveScreen(mode, onNotice)
                Overlay.MiniGames -> MiniGamesScreen(onNotice)
                Overlay.Vip -> VipScreen(mode) { onPush(Overlay.VipLevels) }
                Overlay.VipLevels -> VipLevelsScreen()
                Overlay.Settings -> SettingsScreen(prefs, onPrefs, onNotice) { onPush(Overlay.Password) }
                Overlay.Password -> PasswordScreen(onNotice)
                is Overlay.Detail -> DetailScreen(overlay.title, onPop)
                null -> when (tab) {
                    MainTab.Home -> HomeScreen(prefs, mode, onTab, onPush, onNotice)
                    MainTab.Sport -> SportsScreen { onPush(Overlay.Detail(it)) }
                    MainTab.Casino -> CasinoScreen(onNotice)
                    MainTab.Promotions -> PromotionsScreen(onNotice)
                    MainTab.Profile -> ProfileScreen(mode, onPush, onLeave)
                }
            }
        }
    }
}

@Composable
fun RixoBottomBar(selected: MainTab, onSelect: (MainTab) -> Unit) {
    val tokens = LocalRixoTokens.current
    val icons = mapOf(
        MainTab.Home to Icons.Filled.Home,
        MainTab.Sport to Icons.Filled.SportsSoccer,
        MainTab.Casino to Icons.Filled.Casino,
        MainTab.Promotions to Icons.Filled.CardGiftcard,
        MainTab.Profile to Icons.Filled.Person,
    )
    NavigationBar(containerColor = tokens.elevated.copy(alpha = 0.98f)) {
        MainTab.entries.forEach { tab ->
            NavigationBarItem(
                selected = tab == selected,
                onClick = { onSelect(tab) },
                icon = { Icon(icons.getValue(tab), contentDescription = tab.label) },
                label = { Text(tab.label, fontSize = 11.sp, maxLines = 1) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = tokens.glow,
                    selectedTextColor = tokens.glow,
                    indicatorColor = tokens.glow.copy(alpha = 0.18f),
                    unselectedIconColor = tokens.muted,
                    unselectedTextColor = tokens.muted,
                ),
            )
        }
    }
}

@Composable
private fun HomeScreen(
    prefs: LocalPrefs,
    mode: FixtureMode,
    onTab: (MainTab) -> Unit,
    onPush: (Overlay) -> Unit,
    onNotice: (String, String) -> Unit,
) {
    val tokens = LocalRixoTokens.current
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        DemoBanner(mode)
        Row(verticalAlignment = Alignment.CenterVertically) {
            RixoLogo(compact = true, showTagline = false, modifier = Modifier.weight(1f))
            Icon(
                Icons.Filled.Notifications,
                contentDescription = "Уведомления",
                tint = tokens.glow,
                modifier = Modifier
                    .size(28.dp)
                    .clickable { onPush(Overlay.Detail("Уведомления")) },
            )
        }
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(tokens.field)
                .border(1.dp, tokens.stroke, RoundedCornerShape(16.dp))
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                if (mode == FixtureMode.Demo) {
                    Text("${Fixtures.balanceDemo} ${prefs.currency}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
                    Text("ДЕМО", color = tokens.gold, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                } else {
                    Text("Баланс недоступен", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
                }
            }
            Box(
                Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(tokens.button)
                    .clickable {
                        val attempt = UserActions.deposit() as Attempt.Unavailable
                        onNotice("Сервис недоступен", attempt.message)
                    },
                contentAlignment = Alignment.Center,
            ) { Text("+", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp) }
        }
        Spacer(Modifier.height(12.dp))
        NeonCard(Modifier.fillMaxWidth(), onClick = { onTab(MainTab.Promotions) }) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Бонус до", color = MaterialTheme.colorScheme.onBackground, fontWeight = FontWeight.SemiBold)
                    Text("100%", color = tokens.gold, fontWeight = FontWeight.Black, fontSize = 32.sp)
                    Text("на первый депозит", color = MaterialTheme.colorScheme.onBackground)
                    Text("Начисление недоступно", color = tokens.muted, fontSize = 11.sp)
                }
                GiftArt(Modifier.size(92.dp))
            }
        }
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            QuickAction(Icons.Filled.Sensors, "Live") { onPush(Overlay.Live) }
            QuickAction(Icons.Filled.SportsSoccer, "Спорт") { onTab(MainTab.Sport) }
            QuickAction(Icons.Filled.Casino, "Казино") { onTab(MainTab.Casino) }
            QuickAction(Icons.Filled.CardGiftcard, "Мини-игры") { onPush(Overlay.MiniGames) }
        }
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Популярные события", fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f))
            Text("Все >", color = tokens.glow, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { onTab(MainTab.Sport) })
        }
        Spacer(Modifier.height(8.dp))
        if (mode == FixtureMode.Demo) {
            val event = Fixtures.popularEvent
            NeonCard(Modifier.fillMaxWidth()) {
                Column {
                    Text(event.league, color = tokens.muted, fontSize = 12.sp)
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TeamMark(event.homeMark, event.home, Gold)
                        Text("—", modifier = Modifier.padding(horizontal = 8.dp), color = tokens.muted)
                        TeamMark(event.awayMark, event.away, Color(0xFF7A2BFF))
                    }
                    Spacer(Modifier.height(10.dp))
                    OddsRow(event.odds) {
                        val attempt = UserActions.placeBet() as Attempt.Unavailable
                        onNotice("Сервис недоступен", attempt.message)
                    }
                }
            }
        } else {
            UnavailableBlock("Линия недоступна", "Популярные события появятся после подключения спортивной линии.")
        }
        Spacer(Modifier.height(12.dp))
    }
}

@Composable
private fun RowScope.TeamMark(mark: String, name: String, color: Color) {
    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
            Text(mark, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(6.dp))
        Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun QuickAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    val tokens = LocalRixoTokens.current
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(onClick = onClick)) {
        Box(
            Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(tokens.elevated)
                .border(1.dp, tokens.stroke, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = if (tokens.isDark) Color.White else tokens.glow)
        }
        Spacer(Modifier.height(6.dp))
        Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onBackground)
    }
}

@Composable
private fun SportsScreen(onLeague: (String) -> Unit) {
    var filter by rememberSaveable { mutableIntStateOf(0) }
    val leagues = Catalog.leagues.filter { (_, kind) ->
        when (filter) {
            1 -> kind == "football" || kind == "top"
            2, 3 -> false
            else -> true
        }
    }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        ScreenTitle("Спорт")
        Spacer(Modifier.height(12.dp))
        SportFilters(filter) { filter = it }
        Spacer(Modifier.height(12.dp))
        if (leagues.isEmpty()) {
            UnavailableBlock(
                "Турниры недоступны",
                "Для выбранного вида спорта линия не подключена.",
            )
        } else {
            leagues.forEach { (name, _) ->
                LeagueRow(name) { onLeague("$name") }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun SportFilters(selected: Int, onSelect: (Int) -> Unit) {
    val icons = listOf(null, Icons.Filled.SportsSoccer, Icons.Filled.SportsTennis, Icons.Filled.SportsBasketball)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Catalog.sportFilters.forEachIndexed { index, label ->
            val active = index == selected
            val tokens = LocalRixoTokens.current
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable { onSelect(index) }) {
                Box(
                    Modifier
                        .size(if (index == 0) 64.dp else 52.dp, 40.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (active) tokens.button else androidx.compose.ui.graphics.SolidColor(tokens.elevated))
                        .border(1.dp, tokens.stroke, RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (index == 0) {
                        Text(label, color = Color.White, fontWeight = FontWeight.Bold)
                    } else {
                        Icon(icons[index]!!, contentDescription = label, tint = MaterialTheme.colorScheme.onBackground)
                    }
                }
                if (index != 0) {
                    Spacer(Modifier.height(4.dp))
                    Text(label, fontSize = 11.sp, color = LocalRixoTokens.current.muted)
                }
            }
        }
    }
}

@Composable
private fun LeagueRow(name: String, onClick: () -> Unit) {
    val tokens = LocalRixoTokens.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(tokens.card)
            .border(1.dp, tokens.stroke, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (name == "Топ лиги") Icons.Filled.Star else Icons.Filled.SportsSoccer,
            contentDescription = null,
            tint = if (name == "Топ лиги") tokens.glow else MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.width(12.dp))
        Text(name, modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
        Text(">", color = tokens.muted)
    }
}

@Composable
private fun LiveScreen(mode: FixtureMode, onNotice: (String, String) -> Unit) {
    var filter by rememberSaveable { mutableIntStateOf(0) }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Text(
            "Live",
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
            fontWeight = FontWeight.Black,
            fontSize = 22.sp,
            color = Color(0xFFFF4D6A),
        )
        Spacer(Modifier.height(8.dp))
        DemoBanner(mode)
        Spacer(Modifier.height(8.dp))
        SportFilters(filter) { filter = it }
        Spacer(Modifier.height(12.dp))
        val events = if (mode == FixtureMode.Demo && filter <= 1) Fixtures.liveEvents else emptyList()
        if (events.isEmpty()) {
            UnavailableBlock("Лайв недоступен", "Живая линия не подключена. Счёт и коэффициенты не отображаются.")
        } else {
            events.forEach { event ->
                NeonCard(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "LIVE",
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color(0xFFE11D48))
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(event.minute, color = LocalRixoTokens.current.muted)
                            Spacer(Modifier.weight(1f))
                            Text("ДЕМО", color = LocalRixoTokens.current.gold, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.height(8.dp))
                        ScoreLine(event.home, event.homeScore)
                        ScoreLine(event.away, event.awayScore)
                        Spacer(Modifier.height(8.dp))
                        OddsRow(event.odds) {
                            val attempt = UserActions.placeBet() as Attempt.Unavailable
                            onNotice("Сервис недоступен", attempt.message)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScoreLine(name: String, score: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(name, modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
        Text(score, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CasinoScreen(onNotice: (String, String) -> Unit) {
    var filter by rememberSaveable { mutableIntStateOf(0) }
    var query by rememberSaveable { mutableStateOf("") }
    var searching by rememberSaveable { mutableStateOf(false) }
    val filters = listOf("Все слоты", "Live Casino", "Новые")
    val group = when (filter) {
        1 -> "live"
        2 -> "new"
        else -> "all"
    }
    val games = Fixtures.casinoGames.filter { game ->
        (group == "all" || game.group == group || (group == "all")) &&
            (query.isBlank() || game.title.contains(query.trim(), ignoreCase = true))
    }.let { list -> if (group == "all") list else list.filter { it.group == group || (group == "new" && it.group == "new") } }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "Казино",
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold,
                fontSize = 22.sp,
            )
            Icon(
                Icons.Filled.Search,
                contentDescription = "Поиск",
                modifier = Modifier.clickable { searching = !searching },
            )
        }
        if (searching) {
            Spacer(Modifier.height(8.dp))
            RixoField(query, { query = it }, "Поиск по названию", Icons.Filled.Search)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            filters.forEachIndexed { index, label ->
                val active = index == filter
                val tokens = LocalRixoTokens.current
                Text(
                    label,
                    modifier = Modifier
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (active) tokens.button else androidx.compose.ui.graphics.SolidColor(tokens.elevated))
                        .clickable { filter = index }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    color = if (active) Color.White else MaterialTheme.colorScheme.onBackground,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        if (games.isEmpty()) {
            UnavailableBlock("Ничего не найдено", "Нет локальных заглушек по этому запросу. Каталог провайдера не подключён.")
        } else {
            LazyVerticalGrid(
                modifier = Modifier.weight(1f),
                columns = GridCells.Fixed(2),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(bottom = 12.dp),
            ) {
                items(games, key = { it.title }) { game ->
                    GameTile(game.title, Color(game.accent)) {
                        val attempt = UserActions.launchGame(game.title) as Attempt.Unavailable
                        onNotice("Сервис недоступен", attempt.message)
                    }
                }
            }
        }
    }
}

@Composable
private fun GameTile(title: String, accent: Color, onClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .height(150.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(accent, Color(0xFF120818))))
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Text("Недоступно", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        Text(title, color = Color.White, fontWeight = FontWeight.Black, fontSize = 20.sp)
    }
}

@Composable
private fun MiniGamesScreen(onNotice: (String, String) -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
        ScreenTitle("Мини-игры")
        Spacer(Modifier.height(12.dp))
        LazyVerticalGrid(
            modifier = Modifier.weight(1f),
            columns = GridCells.Fixed(2),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(Fixtures.miniGames) { name ->
                NeonCard(Modifier.fillMaxWidth().height(132.dp), onClick = {
                    val attempt = UserActions.launchGame(name) as Attempt.Unavailable
                    onNotice("Сервис недоступен", attempt.message)
                }) {
                    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(name, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, fontSize = 16.sp)
                        Spacer(Modifier.height(6.dp))
                        Text("Недоступно", color = LocalRixoTokens.current.muted, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PromotionsScreen(onNotice: (String, String) -> Unit) {
    val arts = listOf<@Composable () -> Unit>(
        { GiftArt(Modifier.size(72.dp)) },
        { CoinArt(Modifier.size(72.dp)) },
        { BallArt(Modifier.size(72.dp)) },
        { CupArt(Modifier.size(72.dp)) },
    )
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        ScreenTitle("Акции и бонусы")
        Spacer(Modifier.height(12.dp))
        Catalog.promotions.forEachIndexed { index, (title, highlight) ->
            NeonCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), onClick = {
                val attempt = UserActions.claimPromo(title) as Attempt.Unavailable
                onNotice("Сервис недоступен", attempt.message)
            }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(title, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        Text(highlight, color = LocalRixoTokens.current.gold, fontWeight = FontWeight.Black, fontSize = 22.sp)
                    }
                    arts[index]()
                }
            }
        }
    }
}

@Composable
private fun VipScreen(mode: FixtureMode, onLevels: () -> Unit) {
    val tokens = LocalRixoTokens.current
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        ScreenTitle("VIP клуб")
        Spacer(Modifier.height(12.dp))
        DemoBanner(mode)
        Box(contentAlignment = Alignment.Center) {
            CrownMark(Modifier.size(120.dp))
        }
        Text("Текущий уровень", color = tokens.muted)
        Text(
            if (mode == FixtureMode.Demo) "Silver" else "Не назначен",
            fontWeight = FontWeight.Bold,
            fontSize = 28.sp,
        )
        Spacer(Modifier.height(8.dp))
        if (mode == FixtureMode.Demo) {
            Text("2 450 / 5 000 XP · ДЕМО", color = tokens.muted, fontSize = 12.sp)
            Spacer(Modifier.height(6.dp))
            LinearProgressIndicator(
                progress = { 0.49f },
                modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(8.dp)),
                color = tokens.glow,
                trackColor = tokens.elevated,
            )
        } else {
            UnavailableBlock("Программа лояльности недоступна", "Уровень и опыт появятся после подключения аккаунта.")
        }
        Spacer(Modifier.height(16.dp))
        Text("Преимущества уровня", modifier = Modifier.fillMaxWidth(), fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Catalog.vipPerks.forEach { perk ->
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("✓", color = Color(0xFF22C55E), fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                Text(perk)
            }
        }
        Spacer(Modifier.height(12.dp))
        NeonButton("Все уровни", onClick = onLevels)
    }
}

@Composable
private fun VipLevelsScreen() {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
    ) {
        ScreenTitle("Все уровни")
        Spacer(Modifier.height(8.dp))
        Text(
            "Список справочный. Уровень игрока не назначен, пока сервис не подключён.",
            color = LocalRixoTokens.current.muted,
            fontSize = 13.sp,
        )
        Spacer(Modifier.height(12.dp))
        Catalog.vipLevels.forEach { level ->
            NeonCard(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                Text(level, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        }
    }
}

@Composable
private fun ProfileScreen(mode: FixtureMode, onPush: (Overlay) -> Unit, onLeave: () -> Unit) {
    val tokens = LocalRixoTokens.current
    val rows = listOf(
        "Личные данные" to Icons.Filled.Person,
        "Верификация" to Icons.Filled.Verified,
        "История игр" to Icons.Filled.History,
        "История ставок" to Icons.Filled.History,
        "Бонусы" to Icons.Filled.CardGiftcard,
        "VIP уровень" to Icons.Filled.Star,
    )
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.weight(1f))
            Icon(
                Icons.Filled.Settings,
                contentDescription = "Настройки",
                tint = tokens.glow,
                modifier = Modifier.clickable { onPush(Overlay.Settings) },
            )
        }
        DemoBanner(mode)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(64.dp).clip(CircleShape).background(tokens.glow.copy(alpha = 0.35f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Person, contentDescription = null, tint = Color.White, modifier = Modifier.size(34.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(
                    if (mode == FixtureMode.Demo) Fixtures.profileNameDemo else "Гость",
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                )
                Text(
                    if (mode == FixtureMode.Demo) "ID: ${Fixtures.profileIdDemo} · ДЕМО" else "Вход не выполнен",
                    color = tokens.muted,
                    fontSize = 13.sp,
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        rows.forEach { (title, icon) ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(tokens.card)
                    .clickable {
                        when (title) {
                            "Бонусы" -> onPush(Overlay.Detail("Бонусы"))
                            "VIP уровень" -> onPush(Overlay.Vip)
                            else -> onPush(Overlay.Detail(title))
                        }
                    }
                    .padding(horizontal = 14.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onBackground)
                Spacer(Modifier.width(12.dp))
                Text(title, modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
                if (title == "Верификация") {
                    Text("не пройдена", color = tokens.muted, fontSize = 12.sp)
                } else {
                    Text(">", color = tokens.muted)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        NeonButton("Ко входу", onClick = onLeave)
    }
}

@Composable
private fun SettingsScreen(
    prefs: LocalPrefs,
    onPrefs: (LocalPrefs) -> Unit,
    onNotice: (String, String) -> Unit,
    onPassword: () -> Unit,
) {
    var currencyOpen by rememberSaveable { mutableStateOf(false) }
    var languageOpen by rememberSaveable { mutableStateOf(false) }
    var themeOpen by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        ScreenTitle("Настройки")
        Spacer(Modifier.height(12.dp))
        SettingRow(Icons.Filled.Language, "Валюта", prefs.currency) { currencyOpen = true }
        SettingRow(Icons.Filled.Language, "Язык", "Русский") { languageOpen = true }
        SettingRow(Icons.Filled.Star, "Тема", prefs.theme.settingsLabel) { themeOpen = true }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(LocalRixoTokens.current.card)
                .padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Notifications, contentDescription = null)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Уведомления", fontWeight = FontWeight.Medium)
                Text("Только на устройстве. Push не подключён.", color = LocalRixoTokens.current.muted, fontSize = 11.sp)
            }
            Switch(
                checked = prefs.notificationsEnabled,
                onCheckedChange = { onPrefs(prefs.copy(notificationsEnabled = it)) },
                colors = SwitchDefaults.colors(checkedTrackColor = LocalRixoTokens.current.glow),
            )
        }
        SettingRow(Icons.Filled.Lock, "Безопасность", "") {
            onNotice("Сервис недоступен", "Раздел безопасности недоступен. Сессии RIXO BET не подключены.")
        }
        SettingRow(Icons.Filled.Key, "Сменить пароль", "") { onPassword() }
        if (currencyOpen) {
            ChoiceDialog("Валюта", LocalPrefsRepositoryCurrencies, prefs.currency, { currencyOpen = false }) {
                onPrefs(prefs.copy(currency = it))
                currencyOpen = false
            }
        }
        if (languageOpen) {
            ChoiceDialog("Язык", listOf("Русский", "English", "Türkmen"), "Русский", { languageOpen = false }) { pick ->
                languageOpen = false
                if (pick != "Русский") {
                    onNotice("Сервис недоступен", "Интерфейс R001 доступен на русском языке.")
                }
            }
        }
        if (themeOpen) {
            ChoiceDialog(
                "Тема",
                listOf(ThemeMode.DarkVip.settingsLabel, ThemeMode.WhiteEmerald.settingsLabel),
                prefs.theme.settingsLabel,
                { themeOpen = false },
            ) { pick ->
                val mode = ThemeMode.entries.first { it.settingsLabel == pick }
                onPrefs(prefs.withTheme(mode, chosen = true))
                themeOpen = false
            }
        }
    }
}

private val LocalPrefsRepositoryCurrencies = com.rixobet.app.domain.LocalPrefsRepository.AllowedCurrencies.toList()

@Composable
private fun SettingRow(icon: ImageVector, title: String, value: String, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(LocalRixoTokens.current.card)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null)
        Spacer(Modifier.width(12.dp))
        Text(title, modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
        if (value.isNotEmpty()) Text(value, color = LocalRixoTokens.current.muted)
        Spacer(Modifier.width(6.dp))
        Text(">", color = LocalRixoTokens.current.muted)
    }
}

@Composable
private fun ChoiceDialog(
    title: String,
    options: List<String>,
    selected: String,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                options.forEach { option ->
                    Text(
                        if (option == selected) "$option  ✓" else option,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(option) }
                            .padding(vertical = 10.dp),
                        fontWeight = if (option == selected) FontWeight.Bold else FontWeight.Normal,
                    )
                }
            }
        },
        confirmButton = {
            androidx.compose.material3.TextButton(onClick = onDismiss) { Text("Закрыть") }
        },
    )
}

@Composable
private fun PasswordScreen(onNotice: (String, String) -> Unit) {
    var current by rememberSaveable { mutableStateOf("") }
    var next by rememberSaveable { mutableStateOf("") }
    var confirm by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        ScreenTitle("Сменить пароль")
        Spacer(Modifier.height(8.dp))
        Text("Пароль не изменяется: сервис аккаунтов не подключён.", color = LocalRixoTokens.current.muted, fontSize = 13.sp)
        Spacer(Modifier.height(12.dp))
        RixoField(current, { current = it }, "Текущий пароль", Icons.Filled.Lock, password = true)
        Spacer(Modifier.height(8.dp))
        RixoField(next, { next = it }, "Новый пароль", Icons.Filled.Lock, password = true)
        Spacer(Modifier.height(8.dp))
        RixoField(confirm, { confirm = it }, "Повторите пароль", Icons.Filled.Lock, password = true)
        if (error.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(error, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(16.dp))
        NeonButton("Сохранить") {
            when (val attempt = UserActions.changePassword(current, next, confirm)) {
                is Attempt.Invalid -> error = attempt.reason
                is Attempt.Unavailable -> {
                    error = ""
                    current = ""
                    next = ""
                    confirm = ""
                    onNotice("Сервис недоступен", attempt.message)
                }
            }
        }
    }
}

@Composable
private fun DetailScreen(title: String, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable(onClick = onBack)) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Назад", tint = LocalRixoTokens.current.muted)
            Spacer(Modifier.width(8.dp))
            Text(title, fontWeight = FontWeight.Bold, fontSize = 22.sp)
        }
        Spacer(Modifier.height(12.dp))
        UnavailableBlock(
            "Раздел недоступен",
            "«$title» откроется после подключения сервисов RIXO BET. Данные игрока не загружаются.",
        )
    }
}
