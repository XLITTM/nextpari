package com.nextpari.app.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ConfirmationNumber
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.navigation.BottomNavItem
import com.nextpari.app.core.navigation.BottomNavSpec
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun NextpariBottomNav(
    activeRoute: String?,
    betCount: Int,
    onSelect: (BottomNavItem) -> Unit,
) {
    val colors = NextpariTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.nav)
            .navigationBarsPadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
                .border(width = 0.5.dp, color = colors.border),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BottomNavSpec.items.forEach { item ->
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    if (item.center) {
                        CouponButton(betCount = betCount, onClick = { onSelect(item) })
                    } else {
                        val selected = activeRoute == item.route ||
                            (item.route == Destinations.HOME && activeRoute == Destinations.HOME)
                        NavItem(item.label, navIcon(item.route), selected, colors.accent, colors.textMuted) {
                            onSelect(item)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CouponButton(betCount: Int, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .offset(y = (-18).dp)
                .size(58.dp)
                .shadow(12.dp, CircleShape)
                .clip(CircleShape)
                .background(colors.accent)
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Outlined.ConfirmationNumber,
                contentDescription = "Купон",
                tint = Color.White,
                modifier = Modifier.size(24.dp),
            )
            if (betCount > 0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(18.dp)
                        .clip(CircleShape)
                        .background(Color.White),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("$betCount", color = colors.accentInk, fontSize = 10.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                }
            }
        }
        Text(
            "Купон",
            color = colors.accent,
            fontSize = 10.sp,
            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
            modifier = Modifier.offset(y = (-10).dp),
        )
    }
}

@Composable
private fun NavItem(
    label: String,
    icon: ImageVector,
    active: Boolean,
    accent: Color,
    muted: Color,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .height(64.dp)
            .clickable(onClick = onClick)
            .padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = label, tint = if (active) accent else muted, modifier = Modifier.size(18.dp))
        Text(
            label,
            color = if (active) accent else muted,
            fontSize = 10.sp,
            fontWeight = if (active) androidx.compose.ui.text.font.FontWeight.SemiBold else androidx.compose.ui.text.font.FontWeight.Medium,
        )
    }
}

private fun navIcon(route: String): ImageVector = when (route) {
    Destinations.HOME -> Icons.Outlined.LocalFireDepartment
    Destinations.FAVORITES -> Icons.Outlined.StarBorder
    Destinations.HISTORY -> Icons.Outlined.History
    else -> Icons.Outlined.GridView
}
