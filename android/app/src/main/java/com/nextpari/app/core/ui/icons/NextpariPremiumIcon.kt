package com.nextpari.app.core.ui.icons

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

fun isPremiumIcons(): Boolean =
    NextpariIconConfig.defaultVariant == NextpariIconVariant.Premium

@Composable
fun premiumIconTint(semantic: Color, legacy: Color = Color.Unspecified): Color =
    if (isPremiumIcons()) semantic else legacy

@Composable
fun NextpariPremiumIcon(
    imageVector: ImageVector,
    semantic: Color,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    containerSize: Dp = 36.dp,
    iconSize: Dp = 24.dp,
    active: Boolean = true,
    showContainer: Boolean = true,
    inactiveAlpha: Float = 0.65f,
    legacyTint: Color = Color.Unspecified,
    corner: Dp = 12.dp,
) {
    val premium = isPremiumIcons()
    val isDark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    val tint = if (premium) {
        semantic.copy(alpha = if (active) 1f else inactiveAlpha)
    } else {
        legacyTint
    }
    if (premium && showContainer) {
        Box(
            modifier
                .size(containerSize)
                .clip(RoundedCornerShape(corner))
                .background(NextpariIconPalette.container(semantic, isDark)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = imageVector,
                contentDescription = contentDescription,
                modifier = Modifier.size(iconSize),
                tint = tint,
            )
        }
    } else {
        Icon(
            imageVector = imageVector,
            contentDescription = contentDescription,
            modifier = modifier.size(iconSize),
            tint = tint,
        )
    }
}

@Composable
fun NextpariPremiumIconBadge(
    imageVector: ImageVector,
    semantic: Color,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    containerSize: Dp = 36.dp,
    iconSize: Dp = 24.dp,
    active: Boolean = true,
    inactiveAlpha: Float = 0.65f,
    corner: Dp = 12.dp,
) {
    NextpariPremiumIcon(
        imageVector = imageVector,
        semantic = semantic,
        modifier = modifier,
        contentDescription = contentDescription,
        containerSize = containerSize,
        iconSize = iconSize,
        active = active,
        showContainer = true,
        inactiveAlpha = inactiveAlpha,
        corner = corner,
    )
}

@Composable
fun NextpariSportIconBadge(
    sportId: String,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    active: Boolean = true,
    containerSize: Dp = 36.dp,
    iconSize: Dp = 28.dp,
) {
    when (NextpariIconConfig.defaultVariant) {
        NextpariIconVariant.Legacy -> NextpariSportIcon(
            sportId = sportId,
            modifier = modifier.size(iconSize),
            contentDescription = contentDescription,
        )
        NextpariIconVariant.Premium -> NextpariReferenceIcon(
            key = NextpariSportIcons.referenceKey(sportId),
            modifier = modifier,
            contentDescription = contentDescription,
            size = iconSize,
            active = active,
        )
    }
}
