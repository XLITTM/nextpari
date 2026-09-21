package com.nextpari.app.core.ui.icons

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun isDarkIcons(): Boolean = NextpariTheme.colors.bg == NextpariColors.Dark.bg

@Composable
fun NextpariReferenceIcon(
    key: String,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    size: Dp? = null,
    active: Boolean = true,
) {
    val spec = NextpariReferenceIconAssets.spec(key)
    val res = NextpariReferenceIconAssets.res(key, isDarkIcons())
    Image(
        painter = painterResource(res),
        contentDescription = contentDescription,
        modifier = modifier.size(size ?: spec.sizeDp.dp),
        contentScale = ContentScale.Fit,
        alpha = if (active) 1f else 0.55f,
    )
}

@Composable
fun NextpariGlyph(
    key: NextpariIconKey,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    tint: Color = Color.Unspecified,
    size: Dp? = null,
    active: Boolean = true,
    fallback: ImageVector = NextpariIcons.vector(key),
) {
    val referenceKey = NextpariReferenceIconAssets.iconKey(key)
    if (isPremiumIcons() && referenceKey != null) {
        NextpariReferenceIcon(
            key = referenceKey,
            modifier = modifier,
            contentDescription = contentDescription,
            size = size,
            active = active,
        )
    } else {
        Icon(
            imageVector = fallback,
            contentDescription = contentDescription,
            modifier = if (size != null) modifier.size(size) else modifier,
            tint = tint,
        )
    }
}

@Composable
fun NextpariGlyph(
    imageVector: ImageVector,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    tint: Color = Color.Unspecified,
    size: Dp? = null,
    active: Boolean = true,
) {
    val referenceKey = NextpariReferenceIconAssets.keyForVector(imageVector)
    if (isPremiumIcons() && referenceKey != null) {
        NextpariReferenceIcon(
            key = referenceKey,
            modifier = modifier,
            contentDescription = contentDescription,
            size = size,
            active = active,
        )
    } else {
        Icon(
            imageVector = imageVector,
            contentDescription = contentDescription,
            modifier = if (size != null) modifier.size(size) else modifier,
            tint = tint,
        )
    }
}
