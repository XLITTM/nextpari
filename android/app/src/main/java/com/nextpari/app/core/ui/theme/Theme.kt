package com.nextpari.app.core.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val NextpariDarkColors = darkColorScheme(
    primary = NpAccent,
    onPrimary = NpAccentInk,
    primaryContainer = NpSurfaceMuted,
    onPrimaryContainer = NpAccent,
    secondary = NpAccentHover,
    onSecondary = NpAccentInk,
    background = NpBackground,
    onBackground = NpText,
    surface = NpSurface,
    onSurface = NpText,
    surfaceVariant = NpSurfaceElevated,
    onSurfaceVariant = NpTextSecondary,
    outline = NpBorder,
    error = NpDanger,
    onError = Color.White,
    inverseSurface = NpNav,
)

@Composable
fun NextpariTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = NextpariDarkColors,
        typography = NextpariTypography,
        shapes = NextpariShapes,
        content = content,
    )
}
