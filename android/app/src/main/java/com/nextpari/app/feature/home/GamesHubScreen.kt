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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
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
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.ui.icons.NextpariIcons

private val GamesBody = Color(0xFF0C1018)
private val GamesHeader = Color(0xFF121826)
private val GamesCard = Color(0xFF1B2333)
private val GamesGold = Color(0xFFC89247)

@Composable
fun GamesHubScreen(
    session: AuthSession,
    balanceLabel: String,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
    viewModel: GamesHubViewModel = viewModel(factory = GamesHubViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    Column(
        Modifier
            .fillMaxSize()
            .background(GamesBody),
    ) {
        GamesHeaderBar(
            state = state,
            session = session,
            balanceLabel = balanceLabel,
            onBack = onBack,
            onToggleSearch = viewModel::toggleSearch,
            onQuery = viewModel::setQuery,
            onToggleWallet = viewModel::toggleWalletMenu,
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
        Box(Modifier.weight(1f)) {
            when (state.lobby) {
                "bonuses" -> LobbyPanel(
                    title = "Бонусы",
                    text = "Акции и бонусы появятся после подключения бонусной системы. Сейчас в Promo — предварительная информация.",
                    action = "Открыть Promo",
                    onAction = { onNavigate(Destinations.PROMO) },
                )
                "cashback" -> LobbyPanel(
                    title = "VIP кешбэк",
                    text = "VIP-программа и кешбэк появятся после подключения бонусной системы.",
                    action = "Открыть VIP кешбэк",
                    onAction = { onNavigate(Destinations.VIP_CASHBACK) },
                )
                else -> GameGrid(
                    games = state.games,
                    favorites = state.favorites,
                    emptyText = if (state.lobby == "favorites") "В избранном пока пусто" else "Игры не найдены",
                    onOpen = { onNavigate(it.route) },
                    onFavorite = viewModel::toggleFavorite,
                )
            }
        }
        GamesLobbyBar(active = state.lobby, onSelect = viewModel::setLobby)
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
    onToggleWallet: () -> Unit,
    onDeposit: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(GamesHeader)
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
                Icon(NextpariIcons.Back, contentDescription = "Назад", tint = Color(0xFFE2E8F0))
                Text("Назад", color = Color(0xFFCBD5E1), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            }
            if (state.searchOpen) {
                Row(
                    Modifier
                        .weight(1f)
                        .padding(horizontal = 8.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.Black.copy(alpha = 0.4f))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(NextpariIcons.Search, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    BasicTextField(
                        value = state.query,
                        onValueChange = onQuery,
                        singleLine = true,
                        textStyle = androidx.compose.ui.text.TextStyle(color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
                        cursorBrush = SolidColor(Color.White),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { }),
                        modifier = Modifier.weight(1f),
                        decorationBox = { inner ->
                            Box {
                                if (state.query.isEmpty()) {
                                    Text("Поиск игр", color = Color(0xFF64748B), fontSize = 14.sp)
                                }
                                inner()
                            }
                        },
                    )
                }
            } else {
                Text(
                    "Nextpari Games",
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    fontSize = 15.sp,
                    modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
            IconButton(onClick = onToggleSearch) {
                Icon(
                    if (state.searchOpen) NextpariIcons.Close else NextpariIcons.Search,
                    contentDescription = "Поиск",
                    tint = Color(0xFFE2E8F0),
                )
            }
        }
        Row(
            Modifier.padding(start = 12.dp, end = 12.dp, bottom = 12.dp, top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(16.dp))
                    .background(GamesCard)
                    .clickable(onClick = onToggleWallet)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(32.dp).clip(CircleShape).background(Color(0x3322C55E)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(NextpariIcons.Wallet, contentDescription = null, tint = Color(0xFF6EE7B7), modifier = Modifier.size(16.dp))
                }
                Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
                    Text(balanceLabel, color = Color.White, fontWeight = FontWeight.Black, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (session.playerPublicId.isNotBlank()) {
                        Text("ID #${session.playerPublicId.filter { it.isDigit() }.ifBlank { session.playerPublicId }}", color = Color(0xFF94A3B8), fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                Icon(
                    NextpariIcons.ChevronDown,
                    contentDescription = null,
                    tint = Color(0xFF94A3B8),
                    modifier = Modifier.rotate(if (state.walletMenu) 180f else 0f),
                )
            }
            Row(
                Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFF1A1F2B))
                    .clickable(onClick = onDeposit)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(NextpariIcons.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Пополнить", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
        if (state.walletMenu) {
            Text(
                "Основной счёт · TMTM" + if (session.playerPublicId.isNotBlank()) " · #${session.playerPublicId.filter { it.isDigit() }.ifBlank { session.playerPublicId }}" else "",
                color = Color(0xFFCBD5E1),
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .padding(start = 12.dp, end = 12.dp, bottom = 12.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(GamesCard)
                    .padding(12.dp),
            )
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
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        item(key = "sort") {
            Box(
                Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (sortAz) GamesGold else GamesCard)
                    .clickable(onClick = onSort),
                contentAlignment = Alignment.Center,
            ) {
                Icon(NextpariIcons.Tune, contentDescription = "Фильтр", tint = if (sortAz) Color.White else Color(0xFFCBD5E1), modifier = Modifier.size(16.dp))
            }
        }
        items(GamesCatalog.categories, key = { it.id }) { item ->
            val active = category == item.id
            Text(
                item.label,
                color = if (active) Color.White else Color(0xFFCBD5E1),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (active) GamesGold else GamesCard)
                    .clickable { onCategory(item.id) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
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
    if (games.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(emptyText, color = Color(0xFF94A3B8), fontWeight = FontWeight.SemiBold)
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
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.98f else 1f, label = "game-press")
    Column(Modifier.graphicsLayer { scaleX = scale; scaleY = scale }) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 10f)
                .clip(RoundedCornerShape(16.dp))
                .clickable(interactionSource = interaction, indication = null, onClick = onOpen),
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
            Text(game.name, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Icon(
                if (liked) NextpariIcons.Heart else NextpariIcons.HeartBorder,
                contentDescription = "Избранное",
                tint = if (liked) Color(0xFFF43F5E) else Color(0xFF94A3B8),
                modifier = Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onFavorite).padding(4.dp),
            )
        }
    }
}

@Composable
private fun LobbyPanel(title: String, text: String, action: String, onAction: () -> Unit) {
    Column(Modifier.padding(12.dp)) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(GamesCard)
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(NextpariIcons.Gift, contentDescription = null, tint = Color(0xFFFBBF24))
                Spacer(Modifier.width(8.dp))
                Text(title, color = Color.White, fontWeight = FontWeight.Black, fontSize = 16.sp)
            }
            Text(text, color = Color(0xFFCBD5E1), fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 8.dp))
            Text(
                action,
                color = Color.White,
                fontWeight = FontWeight.Black,
                fontSize = 14.sp,
                modifier = Modifier
                    .padding(top = 16.dp)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(GamesGold)
                    .clickable(onClick = onAction)
                    .padding(vertical = 10.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

@Composable
private fun GamesLobbyBar(active: String, onSelect: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(GamesHeader)
            .navigationBarsPadding()
            .padding(top = 4.dp, bottom = 6.dp),
    ) {
        GamesCatalog.lobbyTabs.forEach { tab ->
            val selected = active == tab.id
            Column(
                Modifier.weight(1f).clickable { onSelect(tab.id) }.padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(lobbyIcon(tab.id), contentDescription = tab.label, tint = if (selected) Color(0xFFFBBF24) else Color(0xFF94A3B8), modifier = Modifier.size(20.dp))
                Text(tab.label, color = if (selected) Color(0xFFFBBF24) else Color(0xFF94A3B8), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

private fun lobbyIcon(id: String): ImageVector = when (id) {
    "bonuses" -> NextpariIcons.Tune
    "cashback" -> NextpariIcons.Refresh
    "favorites" -> NextpariIcons.FavoriteStar
    else -> NextpariIcons.Casino
}
