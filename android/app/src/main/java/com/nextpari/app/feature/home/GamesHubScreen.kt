package com.nextpari.app.feature.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.Casino
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.HeaderWalletSwitcher
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.neon.VipNeonChrome
import com.nextpari.app.core.ui.neon.vipNeonFrame
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.feature.wallets.WalletsUiState

private val GamesGold = Color(0xFFC8962E)

@Composable
fun GamesHubScreen(
    session: AuthSession,
    balanceLabel: String,
    darkTheme: Boolean,
    walletsState: WalletsUiState,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    onRefreshWallets: () -> Unit,
    onSelectWallet: (String) -> Boolean,
    onAddWallet: (String) -> Boolean,
    onConsumeWalletNotice: () -> Unit,
    viewModel: GamesHubViewModel = viewModel(factory = GamesHubViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(session.playerPublicId) { viewModel.bindPlayer(session.playerPublicId) }
    val colors = NextpariTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .background(colors.bg),
    ) {
        GamesHeaderBar(
            state = state,
            session = session,
            balanceLabel = balanceLabel,
            onBack = onBack,
            onToggleSearch = viewModel::toggleSearch,
            onQuery = viewModel::setQuery,
            darkTheme = darkTheme,
            walletsState = walletsState,
            onRefreshWallets = onRefreshWallets,
            onSelectWallet = onSelectWallet,
            onAddWallet = onAddWallet,
            onConsumeWalletNotice = onConsumeWalletNotice,
            onDeposit = { onNavigate(Destinations.WALLET) },
        )
        if (state.lobby == "all") {
            CategoryRow(
                category = state.category,
                sortAz = state.sortAz,
                onSort = viewModel::toggleSort,
                onCategory = viewModel::setCategory,
            )
        }
        Box(Modifier.weight(1f).fillMaxWidth().background(colors.bg)) {
            GameGrid(
                games = state.games,
                favorites = state.favorites,
                emptyText = if (state.lobby == "favorites") "В избранном пока пусто" else "Игры не найдены",
                onOpen = { onNavigate(it.route) },
                onFavorite = viewModel::toggleFavorite,
            )
        }
        GamesLobbyBar(
            active = state.lobby,
            onSelect = { id ->
                when (id) {
                    "bonuses" -> onNavigate(Destinations.PROMO)
                    "cashback" -> onNavigate(Destinations.VIP_CASHBACK)
                    else -> viewModel.setLobby(id)
                }
            },
        )
    }
}

@Composable
private fun GamesHeaderBar(
    state: GamesHubUiState,
    session: AuthSession,
    balanceLabel: String,
    onBack: () -> Unit,
    onToggleSearch: () -> Unit,
    onQuery: (String) -> Unit,
    darkTheme: Boolean,
    walletsState: WalletsUiState,
    onRefreshWallets: () -> Unit,
    onSelectWallet: (String) -> Boolean,
    onAddWallet: (String) -> Boolean,
    onConsumeWalletNotice: () -> Unit,
    onDeposit: () -> Unit,
) {
    val colors = NextpariTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .background(colors.nav)
            .statusBarsPadding(),
    ) {
        Row(
            Modifier.fillMaxWidth().height(48.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                Modifier.clickable(onClick = onBack).padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(NextpariWebIcons.ChevronLeft, contentDescription = "Назад", tint = colors.text)
                Text("Назад", color = colors.textSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            }
            if (state.searchOpen) {
                Row(
                    Modifier
                        .weight(1f)
                        .padding(horizontal = 8.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(colors.surfaceMuted)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(NextpariWebIcons.Search, contentDescription = null, tint = colors.textMuted, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    BasicTextField(
                        value = state.query,
                        onValueChange = onQuery,
                        singleLine = true,
                        textStyle = androidx.compose.ui.text.TextStyle(color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
                        cursorBrush = SolidColor(colors.accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { }),
                        modifier = Modifier.weight(1f),
                        decorationBox = { inner ->
                            Box {
                                if (state.query.isEmpty()) {
                                    Text("Поиск игр", color = colors.textMuted, fontSize = 14.sp)
                                }
                                inner()
                            }
                        },
                    )
                }
            } else {
                Text(
                    "Nextpari Games",
                    color = colors.text,
                    fontWeight = FontWeight.Black,
                    fontSize = 15.sp,
                    modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
            IconButton(onClick = onToggleSearch) {
                Icon(
                    if (state.searchOpen) NextpariWebIcons.X else NextpariWebIcons.Search,
                    contentDescription = "Поиск",
                    tint = colors.text,
                )
            }
        }
        Row(
            Modifier.padding(start = 12.dp, end = 12.dp, bottom = 12.dp, top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HeaderWalletSwitcher(
                    balanceLabel = balanceLabel,
                    darkTheme = darkTheme,
                    state = walletsState,
                    closeKey = state.lobby + state.category,
                    onRefresh = onRefreshWallets,
                    onSelect = onSelectWallet,
                    onAdd = onAddWallet,
                    onConsumeNotice = onConsumeWalletNotice,
                )
                if (session.playerPublicId.isNotBlank()) {
                    Text(
                        "ID #${session.playerPublicId.filter { it.isDigit() }.ifBlank { session.playerPublicId }}",
                        color = colors.textMuted,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
            Row(
                Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(colors.accent)
                    .clickable(onClick = onDeposit)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(NextpariWebIcons.Plus, contentDescription = null, tint = colors.accentInk, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Пополнить", color = colors.accentInk, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun CategoryRow(
    category: String,
    sortAz: Boolean,
    onSort: () -> Unit,
    onCategory: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val selectedFill = if (colors.bg == NextpariColors.Dark.bg) colors.accent else GamesGold
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        item(key = "sort") {
            Box(
                Modifier
                    .size(48.dp)
                    .vipNeonFrame(
                        selected = sortAz,
                        gold = true,
                        shape = RoundedCornerShape(12.dp),
                        chrome = VipNeonChrome.Glow,
                    )
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (sortAz) selectedFill else colors.surface)
                    .clickable(onClick = onSort),
                contentAlignment = Alignment.Center,
            ) {
                Icon(NextpariWebIcons.SlidersHorizontal, contentDescription = "Фильтр", tint = if (sortAz) colors.accentInk else colors.text, modifier = Modifier.size(16.dp))
            }
        }
        items(GamesCatalog.categories, key = { it.id }) { item ->
            val active = category == item.id
            Text(
                item.label,
                color = if (active) colors.accentInk else colors.text,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .vipNeonFrame(
                        selected = active,
                        gold = active,
                        shape = CircleShape,
                        chrome = if (active) VipNeonChrome.Glow else VipNeonChrome.PressOnly,
                    )
                    .clip(CircleShape)
                    .background(if (active) selectedFill else colors.surface)
                    .clickable { onCategory(item.id) }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun GameGrid(
    games: List<HubGame>,
    favorites: Set<String>,
    emptyText: String,
    onOpen: (HubGame) -> Unit,
    onFavorite: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    if (games.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(emptyText, color = colors.textMuted, fontWeight = FontWeight.SemiBold)
        }
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(games, key = { it.id }) { game ->
            GameCard(
                game = game,
                liked = game.id in favorites,
                onOpen = { onOpen(game) },
                onFavorite = { onFavorite(game.id) },
            )
        }
    }
}

@Composable
private fun GameCard(
    game: HubGame,
    liked: Boolean,
    onOpen: () -> Unit,
    onFavorite: () -> Unit,
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val interaction = remember(game.id) { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.98f else 1f, tween(120), label = "game-press")
    val heart by animateFloatAsState(if (liked) 1.12f else 1f, tween(160), label = "game-heart")
    Column(
        Modifier
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(if (dark) 10.dp else 4.dp, RoundedCornerShape(18.dp), ambientColor = colors.accent, spotColor = Color.Black)
            .clip(RoundedCornerShape(18.dp))
            .background(colors.surface)
            .border(1.dp, if (dark) colors.accent.copy(alpha = 0.35f) else colors.border, RoundedCornerShape(18.dp))
            .clickable(interactionSource = interaction, indication = null, onClick = onOpen)
            .padding(8.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 10f)
                .clip(RoundedCornerShape(16.dp)),
        ) {
            Image(
                painter = painterResource(game.coverRes),
                contentDescription = game.name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
            )
            if (game.badge != null) {
                Text(
                    game.badge,
                    color = Color.Black,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier
                        .padding(8.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xFFFBBF24))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
            if (game.winLabel != null) {
                Box(
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f))))
                        .padding(start = 8.dp, end = 8.dp, bottom = 6.dp, top = 24.dp),
                ) {
                    Text(
                        buildAnnotatedString {
                            append("Выигрыш до ")
                            withStyle(SpanStyle(color = Color(0xFFFACC15), fontWeight = FontWeight.Bold)) {
                                append(game.winLabel.orEmpty())
                            }
                        },
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(game.name, color = colors.text, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Icon(
                if (liked) NextpariWebIcons.Heart else NextpariWebIcons.Heart,
                contentDescription = if (liked) "Убрать из избранного" else "В избранное",
                tint = if (liked) Color(0xFFF43F5E) else colors.textMuted,
                modifier = Modifier
                    .size(48.dp)
                    .graphicsLayer { scaleX = heart; scaleY = heart }
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onFavorite)
                    .padding(12.dp),
            )
        }
    }
}

@Composable
private fun GamesLobbyBar(active: String, onSelect: (String) -> Unit) {
    val colors = NextpariTheme.colors
    val selectedTint = if (colors.bg == NextpariColors.Dark.bg) colors.accent else colors.premiumGold
    Row(
        Modifier
            .fillMaxWidth()
            .background(colors.nav)
            .windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime))
            .padding(top = 4.dp, bottom = 6.dp),
    ) {
        GamesCatalog.lobbyTabs.forEach { tab ->
            val selected = active == tab.id
            Column(
                Modifier.weight(1f).heightIn(min = 48.dp).clickable { onSelect(tab.id) }.padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(lobbyIcon(tab.id), contentDescription = tab.label, tint = if (selected) selectedTint else colors.textMuted, modifier = Modifier.size(20.dp))
                Text(tab.label, color = if (selected) selectedTint else colors.textMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Box(
                    Modifier
                        .padding(top = 4.dp)
                        .size(width = 18.dp, height = 2.dp)
                        .background(if (selected) selectedTint else Color.Transparent),
                )
            }
        }
    }
}

private fun lobbyIcon(id: String): ImageVector = when (id) {
    "bonuses" -> NextpariWebIcons.Gift
    "cashback" -> NextpariWebIcons.RotateCcw
    "favorites" -> NextpariWebIcons.Star
    else -> NextpariWebIcons.Dices
}
