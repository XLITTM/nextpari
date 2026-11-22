package com.nextpari.app.feature.express

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.sportsbook.SportsbookScreenHeader
import com.nextpari.app.feature.sportsbook.SportsbookViewModel
import kotlinx.coroutines.launch

@Composable
fun ExpressOfDayScreen(
    onBack: () -> Unit,
    onOpenCoupon: () -> Unit,
    sportsbook: SportsbookViewModel,
    repository: ExpressRepository = AppGraph.expressRepository,
) {
    val colors = NextpariTheme.colors
    var items by remember { mutableStateOf<List<ExpressOfDay>>(emptyList()) }
    var notice by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        loading = true
        items = runCatching { repository.published() }.getOrDefault(emptyList())
        loading = false
    }

    Column(Modifier.fillMaxSize().background(colors.bg)) {
        SportsbookScreenHeader("Экспресс дня", onBack)
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            notice?.let {
                Text(it, color = colors.danger, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            if (loading) {
                Text("Загрузка…", color = colors.textSecondary, fontSize = 14.sp)
            } else if (items.isEmpty()) {
                Text(
                    "Опубликованных экспрессов пока нет. Команда готовит подборки в бэкофисе.",
                    color = colors.textSecondary,
                    fontSize = 14.sp,
                )
            }
            items.forEachIndexed { index, express ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(colors.surface, RoundedCornerShape(18.dp))
                        .border(1.dp, colors.border, RoundedCornerShape(18.dp))
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (index == 0) {
                        Text("Экспресс дня", color = colors.accentInk, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold)
                    }
                    Text(express.title, color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                    if (express.description.isNotBlank()) {
                        Text(express.description, color = colors.textSecondary, fontSize = 13.sp)
                    }
                    Text(
                        "${express.selections.size} исходов",
                        color = colors.textSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    express.combinedOdds?.let {
                        Text("Кэф. $it", color = colors.text, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
                    }
                    express.publishedAt?.let { Text("Опубликован $it", color = colors.textSecondary, fontSize = 11.sp) }
                    express.selections.forEachIndexed { selectionIndex, selection ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Column(Modifier.weight(1f).padding(end = 8.dp)) {
                                Text("${selectionIndex + 1}. ${selection.matchLabel}", color = colors.text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                Text("${selection.league} · ${selection.outcomeName}", color = colors.textSecondary, fontSize = 11.sp)
                            }
                            Text("%.3f".format(selection.oddsSnapshot), color = colors.text, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                    Button(onClick = {
                        scope.launch {
                            val (fresh, error) = repository.validateForCoupon(express.id)
                            if (fresh == null) {
                                notice = error
                                return@launch
                            }
                            val result = sportsbook.addExpressToCoupon(fresh)
                            notice = result.message ?: "Экспресс добавлен в купон."
                            if (result.added.isNotEmpty()) onOpenCoupon()
                        }
                    }) {
                        Text("Добавить в купон")
                    }
                }
            }
        }
    }
}
