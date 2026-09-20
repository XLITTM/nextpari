package com.nextpari.app.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun ProductSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    badge: String? = null,
    badgeColor: Color = Color(0xFF0C1A2E),
    badgeTextColor: Color = NextpariTheme.colors.accent,
    filterLabel: String? = null,
    onFilter: (() -> Unit)? = null,
    count: Int? = null,
    onSeeAll: (() -> Unit)? = null,
) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    Row(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, color = colors.text, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        if (badge != null) {
            Text(
                badge,
                color = badgeTextColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(badgeColor)
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
        if (onFilter != null) {
            Row(
                Modifier
                    .padding(start = 8.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (dark) Color(0xFF1E293B) else Color(0xFFF3F4F6))
                    .clickable(onClick = onFilter)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(filterLabel ?: "Спорт", color = colors.text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Icon(NextpariIcons.ChevronRight, contentDescription = null, tint = colors.text, modifier = Modifier.size(12.dp))
            }
        }
        if (count != null && count > 0) {
            Text(
                "$count",
                color = colors.accent,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        if (onSeeAll != null) {
            Spacer(Modifier.weight(1f))
            Row(Modifier.clickable(onClick = onSeeAll), verticalAlignment = Alignment.CenterVertically) {
                Text("Все", color = colors.accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Icon(NextpariIcons.ChevronRight, contentDescription = null, tint = colors.accent, modifier = Modifier.size(12.dp))
            }
        }
    }
}
