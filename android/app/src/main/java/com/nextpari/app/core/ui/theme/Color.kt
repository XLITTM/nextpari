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
    val premiumGold: Color,
) {
    companion object {
        val Light = NextpariColors(
            bg = Color(0xFFF7FBF8),
            bg2 = Color(0xFFFFFFFF),
            surface = Color(0xFFFFFFFF),
            surfaceElevated = Color(0xFFFFFFFF),
            surfaceSoft = Color(0xFFF3FAF6),
            surfaceMuted = Color(0xFFE7F6EE),
            surfaceMint = Color(0xFFDFF8EC),
            border = Color(0xFFD5EBE0),
            text = Color(0xFF10241C),
            textSecondary = Color(0xFF4C6A5C),
            textMuted = Color(0xFF7A9486),
            accent = Color(0xFF12C97A),
            accentHover = Color(0xFF0EBE70),
            accentInk = Color(0xFF04261A),
            success = Color(0xFF0E9F62),
            danger = Color(0xFFE11D48),
            info = Color(0xFF0F766E),
            nav = Color(0xFFFFFFFF),
            premiumGold = Color(0xFFC8962E),
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
            premiumGold = Color(0xFFF5C969),
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
