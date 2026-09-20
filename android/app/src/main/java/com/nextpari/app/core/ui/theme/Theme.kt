package com.nextpari.app.core.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

private fun scheme(colors: NextpariColors, dark: Boolean) = if (dark) {
    darkColorScheme(
        primary = colors.accent,
        onPrimary = colors.accentInk,
        primaryContainer = colors.surfaceMuted,
        onPrimaryContainer = colors.accent,
        secondary = colors.accentHover,
        onSecondary = colors.accentInk,
        background = colors.bg,
        onBackground = colors.text,
        surface = colors.surface,
        onSurface = colors.text,
        surfaceVariant = colors.surfaceElevated,
        onSurfaceVariant = colors.textSecondary,
        outline = colors.border,
        error = colors.danger,
        onError = Color.White,
        inverseSurface = colors.nav,
    )
} else {
    lightColorScheme(
        primary = colors.accent,
        onPrimary = colors.accentInk,
        primaryContainer = colors.surfaceMint,
        onPrimaryContainer = colors.accentInk,
        secondary = colors.accentHover,
        onSecondary = colors.accentInk,
        background = colors.bg,
        onBackground = colors.text,
        surface = colors.surface,
        onSurface = colors.text,
        surfaceVariant = colors.surfaceElevated,
        onSurfaceVariant = colors.textSecondary,
        outline = colors.border,
        error = colors.danger,
        onError = Color.White,
        inverseSurface = colors.nav,
    )
}

object NextpariTheme {
    val colors: NextpariColors
        @Composable
        @ReadOnlyComposable
        get() = LocalNextpariColors.current
}

@Composable
fun NextpariTheme(
    darkTheme: Boolean,
    content: @Composable () -> Unit,
) {
    val colors = NextpariColors.forDark(darkTheme)
    CompositionLocalProvider(LocalNextpariColors provides colors) {
        MaterialTheme(
            colorScheme = scheme(colors, darkTheme),
            typography = NextpariTypography,
            shapes = NextpariShapes,
            content = content,
        )
    }
}
