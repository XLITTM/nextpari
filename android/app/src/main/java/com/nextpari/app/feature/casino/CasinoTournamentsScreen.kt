package com.nextpari.app.feature.casino

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.components.NextpariTopBar
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariTheme
import kotlinx.coroutines.CancellationException

internal object CasinoTournamentContract {
    const val MISSING_ENDPOINT =
        "GET /api/player/casino/real не отдаёт массив tournaments. Отдельного /api/player/casino/tournaments нет."
    const val EMPTY_COPY =
        "Турниры казино сейчас недоступны: сервер не отдаёт турнирные данные."
}

@Composable
fun CasinoTournamentsScreen(
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    var retry by rememberSaveable { mutableIntStateOf(0) }
    var loading by rememberSaveable { mutableStateOf(true) }
    var failed by rememberSaveable { mutableStateOf(false) }
    var unauthorized by rememberSaveable { mutableStateOf(false) }
    var tournaments by remember { mutableStateOf(CasinoCatalogStore.peekDirectory()?.tournaments.orEmpty()) }

    LaunchedEffect(retry) {
        val cached = CasinoCatalogStore.peekDirectory()?.tournaments.orEmpty()
        if (cached.isNotEmpty()) {
            tournaments = cached
            loading = false
        } else {
            loading = true
        }
        failed = false
        unauthorized = false
        try {
            tournaments = CasinoCatalogStore.directory().tournaments
            loading = false
        } catch (error: CancellationException) {
            throw error
        } catch (error: CasinoCatalogException) {
            unauthorized = error.unauthorized
            failed = tournaments.isEmpty()
            loading = false
        } catch (_: Exception) {
            failed = tournaments.isEmpty()
            loading = false
        }
    }

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        NextpariTopBar("Турниры", NextpariWebIcons.ChevronLeft, onBack)
        when {
            loading && tournaments.isEmpty() -> Text("Проверяем турниры…", Modifier.padding(16.dp), color = colors.textSecondary)
            failed -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(CasinoCatalogLogic.emptyMessage(unauthorized), color = colors.textSecondary, fontSize = 14.sp)
                Button(onClick = { retry++ }) { Text("Повторить") }
            }
            tournaments.isEmpty() -> Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Турниры недоступны", color = colors.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(CasinoTournamentContract.EMPTY_COPY, color = colors.textSecondary, fontSize = 14.sp)
                Text(CasinoTournamentContract.MISSING_ENDPOINT, color = colors.textMuted, fontSize = 12.sp)
                Button(onClick = { retry++ }) { Text("Повторить") }
                Button(onClick = { onNavigate(Destinations.CASINO_CATEGORIES) }) { Text("Открыть каталог") }
            }
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(tournaments, key = { it.id }) { item ->
                    val shape = RoundedCornerShape(16.dp)
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(shape)
                            .background(colors.surface)
                            .border(1.dp, colors.border, shape)
                            .clickable { onNavigate(Destinations.CASINO_CATEGORIES) }
                            .padding(16.dp),
                    ) {
                        Text(item.title, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        item.status?.takeIf { it.isNotBlank() }?.let {
                            Text(it, color = colors.textSecondary, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                        item.prizePool?.takeIf { it.isNotBlank() }?.let {
                            Text(it, color = colors.accent, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                        val dates = listOfNotNull(item.startsAt, item.endsAt).filter { it.isNotBlank() }
                        if (dates.isNotEmpty()) {
                            Text(dates.joinToString(" — "), color = colors.textMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        }
    }
}
