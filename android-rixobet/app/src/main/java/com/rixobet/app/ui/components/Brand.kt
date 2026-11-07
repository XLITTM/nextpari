package com.rixobet.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rixobet.app.ui.theme.Gold
import com.rixobet.app.ui.theme.GoldBright
import com.rixobet.app.ui.theme.Magenta
import com.rixobet.app.ui.theme.Violet

private val Metal = Brush.linearGradient(
    listOf(Color(0xFFF7F4FF), Color(0xFFC9B6FF), Color.White, Color(0xFF8B4DFF)),
)

@Composable
fun CrownMark(modifier: Modifier = Modifier, tint: Color = Gold) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w * 0.08f, h * 0.72f)
            lineTo(w * 0.22f, h * 0.38f)
            lineTo(w * 0.38f, h * 0.62f)
            lineTo(w * 0.50f, h * 0.18f)
            lineTo(w * 0.62f, h * 0.62f)
            lineTo(w * 0.78f, h * 0.38f)
            lineTo(w * 0.92f, h * 0.72f)
            close()
        }
        drawPath(path, tint)
        drawCircle(GoldBright, radius = w * 0.07f, center = Offset(w * 0.50f, h * 0.16f))
        drawRoundRect(
            color = tint,
            topLeft = Offset(w * 0.12f, h * 0.74f),
            size = Size(w * 0.76f, h * 0.16f),
            cornerRadius = CornerRadius(w * 0.04f),
        )
    }
}

@Composable
fun LionMark(modifier: Modifier = Modifier, gold: Boolean = false) {
    Canvas(modifier) {
        val w = size.width
        val mane = if (gold) Gold else Color(0xFFEDE7FF)
        val face = if (gold) Color(0xFF3A2A10) else Color(0xFF2A1248)
        drawCircle(mane, radius = w * 0.48f, center = Offset(w * 0.5f, w * 0.52f))
        drawCircle(if (gold) GoldBright else Violet, radius = w * 0.34f, center = Offset(w * 0.5f, w * 0.56f))
        drawCircle(face, radius = w * 0.24f, center = Offset(w * 0.5f, w * 0.58f))
        drawCircle(mane, radius = w * 0.08f, center = Offset(w * 0.22f, w * 0.28f))
        drawCircle(mane, radius = w * 0.08f, center = Offset(w * 0.78f, w * 0.28f))
        val crown = Path().apply {
            moveTo(w * 0.32f, w * 0.34f)
            lineTo(w * 0.40f, w * 0.18f)
            lineTo(w * 0.50f, w * 0.30f)
            lineTo(w * 0.60f, w * 0.16f)
            lineTo(w * 0.68f, w * 0.34f)
            close()
        }
        drawPath(crown, Gold)
    }
}

@Composable
fun RixoLogo(compact: Boolean, modifier: Modifier = Modifier, showTagline: Boolean = !compact) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        CrownMark(Modifier.size(if (compact) 28.dp else 54.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = "R",
                fontSize = if (compact) 34.sp else 72.sp,
                fontWeight = FontWeight.Black,
                style = androidx.compose.ui.text.TextStyle(brush = Metal),
            )
            Column {
                Text(
                    text = if (compact) "IXO BET" else "IXO",
                    fontSize = if (compact) 22.sp else 40.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.sp,
                    style = androidx.compose.ui.text.TextStyle(brush = Metal),
                )
                if (!compact) {
                    Text(
                        text = "BET",
                        color = Gold,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 2.sp,
                    )
                }
            }
        }
        if (showTagline && !compact) {
            Text(
                text = "BOOKMAKER & CASINO",
                color = Color(0xFFD9D0F2),
                fontSize = 12.sp,
                letterSpacing = 1.4.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
fun GlowOrb(modifier: Modifier = Modifier, color: Color = Magenta) {
    Canvas(modifier) {
        drawCircle(
            brush = Brush.radialGradient(listOf(color.copy(alpha = 0.55f), Color.Transparent)),
        )
    }
}

@Composable
fun GiftArt(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        drawRoundRect(
            color = Violet,
            topLeft = Offset(w * 0.18f, h * 0.38f),
            size = Size(w * 0.64f, h * 0.48f),
            cornerRadius = CornerRadius(12f),
        )
        drawRoundRect(
            color = Gold,
            topLeft = Offset(w * 0.12f, h * 0.28f),
            size = Size(w * 0.76f, h * 0.16f),
            cornerRadius = CornerRadius(8f),
        )
        drawRect(Gold, topLeft = Offset(w * 0.44f, h * 0.28f), size = Size(w * 0.12f, h * 0.58f))
        drawCircle(GoldBright, w * 0.12f, Offset(w * 0.36f, h * 0.24f))
        drawCircle(GoldBright, w * 0.12f, Offset(w * 0.64f, h * 0.24f))
    }
}

@Composable
fun CoinArt(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        drawCircle(Gold, size.minDimension * 0.28f, Offset(size.width * 0.38f, size.height * 0.55f))
        drawCircle(GoldBright, size.minDimension * 0.28f, Offset(size.width * 0.62f, size.height * 0.42f))
        drawCircle(
            color = Color(0xFF6A4A12),
            radius = size.minDimension * 0.18f,
            center = Offset(size.width * 0.62f, size.height * 0.42f),
            style = Stroke(width = 3f),
        )
    }
}

@Composable
fun BallArt(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        drawCircle(Color.White, size.minDimension * 0.34f, center = Offset(size.width * 0.55f, size.height * 0.5f))
        drawCircle(Color(0xFF1A1A1A), size.minDimension * 0.08f, center = Offset(size.width * 0.55f, size.height * 0.5f))
    }
}

@Composable
fun CupArt(modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w * 0.28f, h * 0.22f)
            lineTo(w * 0.72f, h * 0.22f)
            lineTo(w * 0.64f, h * 0.58f)
            lineTo(w * 0.36f, h * 0.58f)
            close()
        }
        drawPath(path, Gold)
        drawRect(GoldBright, Offset(w * 0.44f, h * 0.58f), Size(w * 0.12f, h * 0.16f))
        drawRoundRect(Gold, Offset(w * 0.30f, h * 0.74f), Size(w * 0.40f, h * 0.1f), CornerRadius(8f))
    }
}

@Composable
fun EnvelopeArt(modifier: Modifier = Modifier, sizeDp: Dp = 96.dp) {
    Box(modifier.size(sizeDp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(sizeDp)) {
            val w = size.width
            val h = size.height
            drawRoundRect(Violet, Offset(w * 0.08f, h * 0.28f), Size(w * 0.84f, h * 0.58f), CornerRadius(18f))
            val flap = Path().apply {
                moveTo(w * 0.08f, h * 0.32f)
                lineTo(w * 0.50f, h * 0.62f)
                lineTo(w * 0.92f, h * 0.32f)
            }
            drawPath(flap, Color(0xFFE6D9FF), style = Stroke(width = w * 0.04f))
            drawRoundRect(Color(0xFFF4EFFF), Offset(w * 0.28f, h * 0.12f), Size(w * 0.44f, h * 0.34f), CornerRadius(8f))
            drawCircle(Color.White, w * 0.08f, Offset(w * 0.62f, h * 0.62f))
        }
    }
}
