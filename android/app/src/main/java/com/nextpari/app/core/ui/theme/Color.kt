package com.nextpari.app.core.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

val TabActiveGold = Color(0xFFC88D3E)

@Immutable
data class NextpariColors(
    val bg: Color,
    val bg2: Color,
    val surface: Color,
    val surfaceElevated: Color,
    val surfaceSoft: Color,
    val surfaceMuted: Color,
    val surfaceMint: Color,
    val border: Color,
    val text: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val accent: Color,
    val accentHover: Color,
    val accentInk: Color,
    val success: Color,
    val danger: Color,
    val info: Color,
    val nav: Color,
) {
    companion object {
        val Light = NextpariColors(
            bg = Color(0xFFF5F9FC),
            bg2 = Color(0xFFF8FBFD),
            surface = Color(0xFFFFFFFF),
            surfaceElevated = Color(0xFFFFFFFF),
            surfaceSoft = Color(0xFFF4F8FB),
            surfaceMuted = Color(0xFFEEF5F8),
            surfaceMint = Color(0xFFF0FFF8),
            border = Color(0xFFDCE8EF),
            text = Color(0xFF07182F),
            textSecondary = Color(0xFF67819C),
            textMuted = Color(0xFF91A5B9),
            accent = Color(0xFF16D982),
            accentHover = Color(0xFF11C674),
            accentInk = Color(0xFF04261A),
            success = Color(0xFF12B96F),
            danger = Color(0xFFFF4E58),
            info = Color(0xFF3D8EBD),
            nav = Color(0xFFFFFFFF),
        )
        val Dark = NextpariColors(
            bg = Color(0xFF031522),
            bg2 = Color(0xFF041A2A),
            surface = Color(0xFF08283A),
            surfaceElevated = Color(0xFF0A2E43),
            surfaceSoft = Color(0xFF072438),
            surfaceMuted = Color(0xFF0D3348),
            surfaceMint = Color(0xFF0A3534),
            border = Color(0x2450B4D2),
            text = Color(0xFFF8FAFC),
            textSecondary = Color(0xFF91AEC7),
            textMuted = Color(0xFF6F8EA8),
            accent = Color(0xFF22F39A),
            accentHover = Color(0xFF19D985),
            accentInk = Color(0xFF04261A),
            success = Color(0xFF27E889),
            danger = Color(0xFFFF555F),
            info = Color(0xFF5EC8E8),
            nav = Color(0xFF061C2C),
        )

        fun forDark(dark: Boolean): NextpariColors = if (dark) Dark else Light
    }
}

val LocalNextpariColors = staticCompositionLocalOf { NextpariColors.Dark }

val NpRadiusPanel: Dp = 22.dp
val NpRadiusCard: Dp = 20.dp
val NpRadiusControl: Dp = 16.dp

@Deprecated("Use NextpariTheme.colors")
val NpBackground get() = NextpariColors.Dark.bg
@Deprecated("Use NextpariTheme.colors")
val NpBackgroundAlt get() = NextpariColors.Dark.bg2
@Deprecated("Use NextpariTheme.colors")
val NpSurface get() = NextpariColors.Dark.surface
@Deprecated("Use NextpariTheme.colors")
val NpSurfaceElevated get() = NextpariColors.Dark.surfaceElevated
@Deprecated("Use NextpariTheme.colors")
val NpSurfaceMuted get() = NextpariColors.Dark.surfaceMuted
@Deprecated("Use NextpariTheme.colors")
val NpBorder get() = NextpariColors.Dark.border
@Deprecated("Use NextpariTheme.colors")
val NpText get() = NextpariColors.Dark.text
@Deprecated("Use NextpariTheme.colors")
val NpTextSecondary get() = NextpariColors.Dark.textSecondary
@Deprecated("Use NextpariTheme.colors")
val NpTextMuted get() = NextpariColors.Dark.textMuted
@Deprecated("Use NextpariTheme.colors")
val NpAccent get() = NextpariColors.Dark.accent
@Deprecated("Use NextpariTheme.colors")
val NpAccentHover get() = NextpariColors.Dark.accentHover
@Deprecated("Use NextpariTheme.colors")
val NpAccentInk get() = NextpariColors.Dark.accentInk
@Deprecated("Use NextpariTheme.colors")
val NpDanger get() = NextpariColors.Dark.danger
@Deprecated("Use NextpariTheme.colors")
val NpSuccess get() = NextpariColors.Dark.success
@Deprecated("Use NextpariTheme.colors")
val NpNav get() = NextpariColors.Dark.nav
