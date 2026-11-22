package com.nextpari.app.feature.casino

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.R
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariTheme
import kotlinx.coroutines.CancellationException

enum class CasinoDirectoryKind { Categories, Providers }

@Composable
fun CasinoDirectoryScreen(
    kind: CasinoDirectoryKind,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val title = if (kind == CasinoDirectoryKind.Categories) "Категории" else "Провайдеры"
    var retry by rememberSaveable { mutableIntStateOf(0) }
    var unauthorized by rememberSaveable { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }
    var snapshot by remember { mutableStateOf(CasinoCatalogStore.peekDirectory() ?: CasinoDirectorySnapshot()) }
    var loading by rememberSaveable { mutableStateOf(snapshot.categories.isEmpty() && snapshot.providers.isEmpty()) }

    LaunchedEffect(kind, retry) {
        val cached = CasinoCatalogStore.peekDirectory()
        if (cached != null) {
            snapshot = cached
            loading = false
        } else {
            loading = true
        }
        failed = false
        unauthorized = false
        try {
            snapshot = CasinoCatalogStore.directory()
            loading = false
        } catch (error: CancellationException) {
            throw error
        } catch (error: CasinoCatalogException) {
            unauthorized = error.unauthorized
            failed = snapshot.categories.isEmpty() && snapshot.providers.isEmpty()
            loading = false
        } catch (_: Exception) {
            failed = snapshot.categories.isEmpty() && snapshot.providers.isEmpty()
            loading = false
        }
    }

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        NextpariTopBar(title, NextpariWebIcons.ChevronLeft, onBack)
        val rowsEmpty = if (kind == CasinoDirectoryKind.Categories) snapshot.categories.isEmpty() else snapshot.providers.isEmpty()
        when {
            loading && rowsEmpty -> Text("Загружаем каталог…", Modifier.padding(16.dp), color = colors.textSecondary)
            failed -> Column(Modifier.padding(16.dp)) {
                Text(CasinoCatalogLogic.emptyMessage(unauthorized), color = colors.textSecondary, fontSize = 14.sp)
                TextButton(onClick = { retry++ }) { Text("Повторить") }
            }
            rowsEmpty -> Text(
                CasinoCatalogLogic.emptyMessage(false),
                Modifier.padding(16.dp),
                color = colors.textSecondary,
                fontSize = 14.sp,
            )
            kind == CasinoDirectoryKind.Categories -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(snapshot.categories, key = { it.id }) { category ->
                    CasinoCategoryDirectoryCard(category) {
                        onNavigate(Destinations.casinoStandard(category.id))
                    }
                }
            }
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(snapshot.providers, key = { it.id }) { provider ->
                    CasinoProviderDirectoryCard(provider) {
                        onNavigate(Destinations.casinoProvider(provider.id))
                    }
                }
            }
        }
    }
}

@Composable
private fun CasinoCategoryDirectoryCard(category: CasinoDirectoryCategory, onOpen: () -> Unit) {
    val colors = NextpariTheme.colors
    val shape = RoundedCornerShape(16.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .height(92.dp)
            .clip(shape)
            .clickable(onClick = onOpen),
    ) {
        Image(
            painterResource(categoryArtworkRes(category.artwork)),
            contentDescription = category.label,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(listOf(Color.Black.copy(alpha = 0.18f), Color.Black.copy(alpha = 0.72f)))))
        Row(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(category.label, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                val count = category.total
                if (count != null && count > 0) {
                    Text("$count игр", color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun CasinoProviderDirectoryCard(provider: CasinoProviderRef, onOpen: () -> Unit) {
    val colors = NextpariTheme.colors
    val shape = RoundedCornerShape(16.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surface)
            .border(1.dp, colors.border, shape)
            .clickable(onClick = onOpen)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(colors.surfaceMint),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                CasinoCatalogLogic.providerInitials(provider.name.ifBlank { provider.id }),
                color = colors.accentInk,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 14.sp,
            )
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(provider.name.ifBlank { provider.id }, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
            Text("Провайдер каталога", color = colors.textSecondary, fontSize = 12.sp)
        }
    }
}

private fun categoryArtworkRes(name: String): Int = when (name) {
    "game_pharaoh" -> R.drawable.game_pharaoh
    "game_blackjack" -> R.drawable.game_blackjack
    "game_crystal" -> R.drawable.game_crystal
    "game_dice" -> R.drawable.game_dice
    "game_apples" -> R.drawable.game_apples
    else -> R.drawable.game_pharaoh
}
