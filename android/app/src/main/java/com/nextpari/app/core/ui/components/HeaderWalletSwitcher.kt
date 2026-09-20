package com.nextpari.app.core.ui.components

import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.wallets.WalletsCatalog
import com.nextpari.app.feature.wallets.WalletsUiState

@Composable
fun HeaderWalletSwitcher(
    balanceLabel: String,
    darkTheme: Boolean,
    state: WalletsUiState,
    closeKey: String?,
    onRefresh: () -> Unit,
    onSelect: (String) -> Boolean,
    onAdd: (String) -> Boolean,
    onConsumeNotice: () -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val rotation by animateFloatAsState(targetValue = if (open) 180f else 0f, label = "walletChevron")
    val colors = NextpariTheme.colors
    val context = LocalContext.current
    val menuBg = if (darkTheme) Color(0xFF18181B) else Color.White
    val menuBorder = if (darkTheme) Color(0xFF374151) else Color(0xFFE5E7EB)

    LaunchedEffect(closeKey) { open = false }
    LaunchedEffect(state.notice) {
        val notice = state.notice ?: return@LaunchedEffect
        Toast.makeText(context, notice, Toast.LENGTH_SHORT).show()
        onConsumeNotice()
    }

    Box {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .border(1.dp, if (darkTheme) Color(0xFF374151) else Color(0xFFE5E7EB), RoundedCornerShape(50))
                .background(if (darkTheme) Color(0xFF1E293B) else Color(0xFFF3F4F6))
                .clickable {
                    val next = !open
                    if (next) onRefresh()
                    open = next
                }
                .padding(start = 4.dp, end = 10.dp, top = 4.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                balanceLabel,
                color = colors.text,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
            Icon(
                Icons.Outlined.KeyboardArrowDown,
                contentDescription = WalletsCatalog.SWITCHER_LABEL,
                tint = Color(0xFF6B7280),
                modifier = Modifier
                    .padding(start = 4.dp)
                    .size(16.dp)
                    .graphicsLayer { rotationZ = rotation },
            )
        }
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            offset = DpOffset(0.dp, 8.dp),
            modifier = Modifier
                .width(224.dp)
                .border(1.dp, menuBorder, RoundedCornerShape(16.dp)),
            shape = RoundedCornerShape(16.dp),
            containerColor = menuBg,
            shadowElevation = 8.dp,
        ) {
            Text(
                WalletsCatalog.MY_CURRENCIES,
                color = Color(0xFF6B7280),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.6.sp,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            )
            if (state.owned.isEmpty()) {
                Text(
                    WalletsCatalog.EMPTY_WALLETS,
                    color = Color(0xFF6B7280),
                    fontSize = 12.sp,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                )
            } else {
                state.owned.forEach { row ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !state.busy) {
                                if (onSelect(row.currency)) open = false
                            }
                            .padding(horizontal = 8.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            WalletsCatalog.rowLabel(row),
                            color = colors.text,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            row.availableBalance,
                            color = colors.text,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
            HorizontalDivider(
                modifier = Modifier.padding(top = 4.dp),
                color = if (darkTheme) Color(0xFF27272A) else Color(0xFFF3F4F6),
            )
            Text(
                WalletsCatalog.ADD_CURRENCY_MENU,
                color = Color(0xFF6B7280),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            )
            state.addable.forEach { option ->
                Text(
                    option.label,
                    color = if (darkTheme) Color(0xFF86EFAC) else Color(0xFF15803D),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = !state.busy) {
                            if (onAdd(option.value)) open = false
                        }
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                )
            }
        }
    }
}
