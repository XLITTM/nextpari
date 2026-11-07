package com.rixobet.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.rixobet.app.domain.ThemeMode

val Night = Color(0xFF080716)
val NightElevated = Color(0xFF120A22)
val CardDark = Color(0xFF171028)
val Violet = Color(0xFF6A00FF)
val Magenta = Color(0xFFD100FF)
val Gold = Color(0xFFC8962E)
val GoldBright = Color(0xFFE6C36A)
val Mist = Color(0xFFF6F3FF)
val MutedDark = Color(0xFFB7A8D6)

val EmeraldBg = Color(0xFFF7FBF8)
val EmeraldInk = Color(0xFF10241C)
val Emerald = Color(0xFF12C97A)
val EmeraldCard = Color(0xFFFFFFFF)
val MutedLight = Color(0xFF5E7268)

@Immutable
data class RixoTokens(
    val isDark: Boolean,
    val glow: Color,
    val gold: Color,
    val card: Color,
    val elevated: Color,
    val muted: Color,
    val field: Color,
    val stroke: Brush,
    val button: Brush,
    val page: Brush,
)

val DarkTokens = RixoTokens(
    isDark = true,
    glow = Violet,
    gold = Gold,
    card = CardDark,
    elevated = NightElevated,
    muted = MutedDark,
    field = Color(0xFF100A1C),
    stroke = Brush.linearGradient(listOf(Magenta.copy(alpha = 0.85f), Violet.copy(alpha = 0.25f))),
    button = Brush.horizontalGradient(listOf(Color(0xFF7A2BFF), Magenta)),
    page = Brush.verticalGradient(listOf(Color(0xFF140820), Night, Color(0xFF070612))),
)

val LightTokens = RixoTokens(
    isDark = false,
    glow = Emerald,
    gold = Gold,
    card = EmeraldCard,
    elevated = Color(0xFFEFF7F2),
    muted = MutedLight,
    field = Color(0xFFF3F8F5),
    stroke = Brush.linearGradient(listOf(Emerald.copy(alpha = 0.7f), Emerald.copy(alpha = 0.15f))),
    button = Brush.horizontalGradient(listOf(Color(0xFF0EAD68), Emerald)),
    page = Brush.verticalGradient(listOf(Color(0xFFFFFFFF), EmeraldBg)),
)

val LocalRixoTokens = staticCompositionLocalOf { DarkTokens }

private val DarkScheme = darkColorScheme(
    primary = Violet,
    onPrimary = Color.White,
    secondary = Gold,
    onSecondary = Color(0xFF1A1204),
    background = Night,
    onBackground = Mist,
    surface = CardDark,
    onSurface = Mist,
    surfaceVariant = NightElevated,
    onSurfaceVariant = MutedDark,
    outline = Violet,
    error = Color(0xFFFF5C7A),
)

private val LightScheme = lightColorScheme(
    primary = Emerald,
    onPrimary = Color.White,
    secondary = Gold,
    onSecondary = Color(0xFF1A1204),
    background = EmeraldBg,
    onBackground = EmeraldInk,
    surface = EmeraldCard,
    onSurface = EmeraldInk,
    surfaceVariant = Color(0xFFE7F6EE),
    onSurfaceVariant = MutedLight,
    outline = Emerald,
    error = Color(0xFFB42342),
)

val RixoTitle = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Bold, fontSize = 22.sp)
val RixoBody = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 14.sp)

@Composable
fun RixoTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = mode == ThemeMode.DarkVip
    val tokens = if (dark) DarkTokens else LightTokens
    CompositionLocalProvider(LocalRixoTokens provides tokens) {
        MaterialTheme(
            colorScheme = if (dark) DarkScheme else LightScheme,
            content = content,
        )
    }
}
