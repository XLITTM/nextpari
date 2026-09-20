package com.nextpari.app.feature.wallets

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.nextpari.app.core.ui.icons.NextpariGlyph
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun WalletsScreen(
    onBack: () -> Unit,
    viewModel: WalletsViewModel = viewModel(factory = WalletsViewModel.Factory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val context = LocalContext.current
    val screenBg = if (dark) Color(0xFF111827) else Color.White
    val cardBg = if (dark) Color(0xFF1F2937) else Color.White
    val border = if (dark) Color(0xFF374151) else Color(0xFFE5E7EB)
    val addBg = if (dark) Color(0xFF374151) else Color(0xFFF3F4F6)

    LaunchedEffect(state.notice) {
        val notice = state.notice ?: return@LaunchedEffect
        Toast.makeText(context, notice, Toast.LENGTH_SHORT).show()
        viewModel.consumeNotice()
    }
    LaunchedEffect(Unit) { viewModel.refresh() }

    Column(
        Modifier
            .fillMaxSize()
            .background(screenBg)
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp).padding(top = 8.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (dark) Color(0xFF1F2937) else Color.White)
                    .border(1.dp, if (dark) Color(0xFF4B5563) else Color(0xFFD1D5DB), RoundedCornerShape(12.dp))
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                NextpariGlyph(
                    imageVector = NextpariIcons.ChevronLeft,
                    contentDescription = "Назад",
                    tint = NextpariIconPalette.Action.Chevron,
                    size = 20.dp,
                )
            }
            Text(
                WalletsCatalog.TITLE,
                color = colors.text,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 12.dp),
            )
        }

        Column(Modifier.padding(horizontal = 12.dp)) {
            state.owned.forEach { row ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(cardBg)
                        .border(1.dp, border, RoundedCornerShape(16.dp))
                        .clickable(enabled = !state.busy) { viewModel.activate(row.currency) }
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "${if (row.isActive) "✓ " else ""}${WalletsCatalog.displayCurrency(row.currency)}",
                            color = colors.text,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(row.displayNameRu, color = colors.textMuted, fontSize = 12.sp)
                    }
                    Text(row.availableBalance, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                }
            }

            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(cardBg)
                    .border(1.dp, border, RoundedCornerShape(16.dp))
                    .padding(16.dp),
            ) {
                Text(WalletsCatalog.ADD_CURRENCY, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                state.addable.forEach { option ->
                    Box(
                        Modifier
                            .padding(bottom = 8.dp)
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(addBg)
                            .clickable(enabled = !state.busy) { viewModel.addCurrency(option.value) }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(option.label, color = colors.text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
