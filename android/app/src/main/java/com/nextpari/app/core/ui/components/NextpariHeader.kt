package com.nextpari.app.core.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.R
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun NextpariHeader(
    balanceLabel: String,
    darkTheme: Boolean,
    onWallet: () -> Unit,
    onHome: () -> Unit,
    onToggleTheme: () -> Unit,
    onSettings: () -> Unit,
    onSearch: () -> Unit,
) {
    val colors = NextpariTheme.colors
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))
            .clip(RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))
            .background(if (darkTheme) Color(0xFF18181B) else Color.White)
            .statusBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF16A34A))
                        .clickable(onClick = onWallet),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.Add, contentDescription = "Пополнить", tint = Color.White, modifier = Modifier.size(16.dp))
                }
                Row(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .clickable(onClick = onWallet)
                        .background(if (darkTheme) Color(0xFF1E293B) else Color(0xFFF3F4F6))
                        .padding(start = 8.dp, end = 10.dp, top = 4.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(balanceLabel, color = colors.text, fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                    Icon(Icons.Outlined.KeyboardArrowDown, contentDescription = null, tint = Color(0xFF6B7280), modifier = Modifier.size(16.dp).padding(start = 4.dp))
                }
            }
            Box(
                modifier = Modifier.clickable(onClick = onHome),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(if (darkTheme) R.drawable.logo_white else R.drawable.logo_black),
                    contentDescription = "NextPari — на главную",
                    modifier = Modifier.height(28.dp),
                    contentScale = ContentScale.Fit,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                HeaderIcon(if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode, "Переключить тему", if (darkTheme) Color(0xFFE5E7EB) else Color(0xFF1F2937), onToggleTheme)
                HeaderIcon(Icons.Outlined.Settings, "Настройки", if (darkTheme) Color(0xFFE5E7EB) else Color(0xFF1F2937), onSettings)
                HeaderIcon(Icons.Outlined.Search, "Поиск", if (darkTheme) Color(0xFFE5E7EB) else Color(0xFF1F2937), onSearch)
            }
        }
    }
}

@Composable
private fun HeaderIcon(
    icon: ImageVector,
    description: String,
    tint: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = description, tint = tint, modifier = Modifier.size(20.dp))
    }
}
