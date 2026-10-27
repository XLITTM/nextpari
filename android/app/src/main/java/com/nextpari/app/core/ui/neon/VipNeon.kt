package com.nextpari.app.core.ui.neon

import android.provider.Settings
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape

enum class VipNeonPhase {
    Default,
    Pressed,
    Selected,
    Disabled,
}

enum class VipNeonChrome {
    Card,
    Glow,
    PressOnly,
}

data class VipNeonVisual(
    val phase: VipNeonPhase,
    val scale: Float,
    val glowAlpha: Float,
    val borderAlpha: Float,
    val contentAlpha: Float,
    val durationMillis: Int,
    val interactive: Boolean,
)

object VipNeon {
    const val PRESS_SCALE = 0.98f
    const val PRESS_MILLIS = 130

    fun resolve(
        selected: Boolean,
        pressed: Boolean,
        enabled: Boolean,
        reducedMotion: Boolean = false,
    ): VipNeonVisual {
        if (!enabled) {
            return VipNeonVisual(
                phase = VipNeonPhase.Disabled,
                scale = 1f,
                glowAlpha = 0f,
                borderAlpha = 0.14f,
                contentAlpha = 0.42f,
                durationMillis = 0,
                interactive = false,
            )
        }
        val duration = if (reducedMotion) 0 else PRESS_MILLIS
        if (pressed) {
            return VipNeonVisual(
                phase = VipNeonPhase.Pressed,
                scale = if (reducedMotion) 1f else PRESS_SCALE,
                glowAlpha = 0.46f,
                borderAlpha = 1f,
                contentAlpha = 1f,
                durationMillis = duration,
                interactive = true,
            )
        }
        if (selected) {
            return VipNeonVisual(
                phase = VipNeonPhase.Selected,
                scale = 1f,
                glowAlpha = 0.30f,
                borderAlpha = 0.9f,
                contentAlpha = 1f,
                durationMillis = duration,
                interactive = true,
            )
        }
        return VipNeonVisual(
            phase = VipNeonPhase.Default,
            scale = 1f,
            glowAlpha = 0f,
            borderAlpha = 0.28f,
            contentAlpha = 1f,
            durationMillis = duration,
            interactive = true,
        )
    }

    fun phaseFor(activeId: String, itemId: String, enabled: Boolean = true): VipNeonPhase {
        if (!enabled) return VipNeonPhase.Disabled
        return if (activeId == itemId) VipNeonPhase.Selected else VipNeonPhase.Default
    }
}

@Composable
fun Modifier.vipNeonFrame(
    selected: Boolean = false,
    enabled: Boolean = true,
    shape: Shape = RoundedCornerShape(16.dp),
    gold: Boolean = false,
    chrome: VipNeonChrome = VipNeonChrome.Card,
): Modifier {
    val colors = NextpariTheme.colors
    val reduced = vipReducedMotion()
    var pressed by remember { mutableStateOf(false) }
    val visual = VipNeon.resolve(selected, pressed && enabled, enabled, reduced)
    val spec = if (visual.durationMillis == 0) snap() else tween<Float>(visual.durationMillis)
    val scale by animateFloatAsState(visual.scale, spec, label = "vipNeonScale")
    val glow by animateFloatAsState(visual.glowAlpha, spec, label = "vipNeonGlow")
    val border by animateFloatAsState(visual.borderAlpha, spec, label = "vipNeonBorder")
    val paint = if (gold) colors.premiumGold else colors.accent
    return this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
            alpha = visual.contentAlpha
        }
        .drawWithContent {
            drawContent()
            if (chrome != VipNeonChrome.PressOnly && glow > 0.02f) {
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(paint.copy(alpha = glow), Color.Transparent),
                        center = center,
                        radius = size.minDimension * 0.75f,
                    ),
                )
            }
            if (chrome == VipNeonChrome.Card && enabled) {
                val stroke = Path().apply {
                    addOutline(shape.createOutline(size, layoutDirection, this@drawWithContent))
                }
                drawPath(
                    path = stroke,
                    color = paint.copy(alpha = border * if (colors.isDarkNeon) 0.85f else 0.45f),
                    style = Stroke(width = 1.dp.toPx()),
                )
            }
        }
        .pointerInput(enabled) {
            if (!enabled) return@pointerInput
            awaitEachGesture {
                try {
                    awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    pressed = true
                    waitForUpOrCancellation(pass = PointerEventPass.Initial)
                } finally {
                    pressed = false
                }
            }
        }
}

@Composable
fun VipNeonButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    selected: Boolean = false,
    gold: Boolean = false,
) {
    val colors = NextpariTheme.colors
    Box(
        modifier = modifier
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
            .vipNeonFrame(selected = selected, enabled = enabled, gold = gold)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = if (gold) colors.premiumGold else colors.text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun vipReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    val scale = Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
    return scale == 0f
}

private val NextpariColors.isDarkNeon: Boolean
    get() = bg == NextpariColors.Dark.bg
