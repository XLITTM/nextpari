package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.icons.isPremiumIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

val SportsbookGold = Color(0xFFD9822B)

@Composable
fun SportsbookScreenHeader(
    title: String,
    onBack: () -> Unit,
    actions: List<Pair<ImageVector, String>> = emptyList(),
    onAction: (String) -> Unit = {},
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Row(
        Modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(if (dark) Color(0xFF1E293B) else Color.White)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).clickable(onClick = onBack), contentAlignment = Alignment.Center) {
            Icon(
                NextpariIcons.Back,
                contentDescription = "Назад",
                tint = if (isPremiumIcons()) NextpariIconPalette.Action.Chevron else Color(0xFF6B7280),
                modifier = Modifier.size(24.dp),
            )
        }
        Text(
            title,
            color = if (dark) Color.White else Color(0xFF1F2937),
            fontSize = 18.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Row {
            if (actions.isEmpty()) {
                Box(Modifier.size(40.dp))
            } else {
                actions.forEach { (icon, desc) ->
                    Box(Modifier.size(36.dp).clickable { onAction(desc) }, contentAlignment = Alignment.Center) {
                        Icon(
                            icon,
                            contentDescription = desc,
                            tint = if (isPremiumIcons()) NextpariIconPalette.Action.forChrome(desc) else Color(0xFF6B7280),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun SportsbookSegmentedTabs(
    tabs: List<Pair<String, String>>,
    activeId: String,
    onChange: (String) -> Unit,
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Row(
        Modifier
            .padding(start = 16.dp, end = 16.dp, bottom = 12.dp, top = 4.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(if (dark) Color(0xFF1F2937) else Color(0xFFF3F4F6))
            .padding(4.dp),
    ) {
        tabs.forEach { (id, label) ->
            val active = id == activeId
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (active) SportsbookGold else Color.Transparent)
                    .clickable { onChange(id) }
                    .padding(vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    color = if (active) Color.White else Color(0xFF6B7280),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
fun CountPill(count: Int) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (dark) Color(0xFF374151) else Color(0xFFE5E7EB))
            .padding(horizontal = 8.dp, vertical = 2.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("$count", color = if (dark) Color(0xFFD1D5DB) else Color(0xFF4B5563), fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun SportsbookPageBackground(content: @Composable () -> Unit) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Column(Modifier.fillMaxWidth().background(if (dark) Color(0xFF111827) else Color(0xFFF3F4F6))) {
        content()
    }
}
