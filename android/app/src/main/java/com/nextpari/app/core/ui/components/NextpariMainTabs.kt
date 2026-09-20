package com.nextpari.app.core.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.MainTabSpec
import com.nextpari.app.core.navigation.MainTabsSpec
import com.nextpari.app.core.ui.icons.NextpariSectionIcons
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun NextpariMainTabs(
    activeId: String,
    onChange: (MainTabSpec) -> Unit,
) {
    val colors = NextpariTheme.colors
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        MainTabsSpec.tabs.forEach { tab ->
            val active = tab.id == activeId
            val icon = tabIcon(tab.id)
            val dark = colors.bg == com.nextpari.app.core.ui.theme.NextpariColors.Dark.bg
            val sectionIcon = tab.id == "games"
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onChange(tab) }
                    .drawBehind {
                        if (active) {
                            val stroke = 2.dp.toPx()
                            drawLine(NextpariWebIcons.TabActive, Offset(0f, size.height), Offset(size.width, size.height), stroke)
                        }
                    }
                    .padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = tab.label,
                    tint = if (sectionIcon) {
                        Color.Unspecified
                    } else if (active) {
                        NextpariWebIcons.TabActive
                    } else if (dark) {
                        NextpariWebIcons.TabInactiveDark
                    } else {
                        NextpariWebIcons.TabInactiveLight
                    },
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    text = tab.label,
                    fontSize = 11.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                    color = if (active) {
                        if (dark) Color.White else Color(0xFF111827)
                    } else {
                        if (dark) Color(0xFF9CA3AF) else Color(0xFF6B7280)
                    },
                )
            }
        }
    }
}

private fun tabIcon(id: String): ImageVector = when (id) {
    "top" -> NextpariWebIcons.flame(NextpariWebIcons.MainTabsStroke)
    "sport" -> NextpariWebIcons.trophy(NextpariWebIcons.MainTabsStroke)
    "esports" -> NextpariWebIcons.gamepad2(NextpariWebIcons.MainTabsStroke)
    "casino" -> NextpariWebIcons.dices(NextpariWebIcons.MainTabsStroke)
    else -> NextpariSectionIcons.Games
}
