package com.nextpari.app.core.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val LiveRed = Color(0xFFEF4444)

@Composable
fun LiveIndicator(
    modifier: Modifier = Modifier,
    size: Dp = 8.dp,
    bordered: Boolean = false,
    borderColor: Color = Color.White,
) {
    val pulse by rememberInfiniteTransition(label = "live-dot").animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "live-alpha",
    )
    Box(
        modifier
            .size(size)
            .then(if (bordered) Modifier.border(2.dp, borderColor, CircleShape) else Modifier)
            .clip(CircleShape)
            .background(LiveRed.copy(alpha = pulse)),
    )
}

@Composable
fun LiveBadge(
    modifier: Modifier = Modifier,
    period: String? = null,
    showLabel: Boolean = true,
) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        LiveIndicator(size = 6.dp)
        if (showLabel) {
            Text(
                " LIVE",
                color = LiveRed,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
        if (!period.isNullOrBlank()) {
            Text(
                " $period",
                color = LiveRed,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 2.dp),
            )
        }
    }
}
