package com.nextpari.app.core.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

internal object PremiumIconBuilder {
    const val Stroke = 1.65f
    const val SportStroke = 1.55f
    val Cap: StrokeCap = StrokeCap.Round
    val Join: StrokeJoin = StrokeJoin.Round
    private val ink = SolidColor(Color.Black)

    fun make(
        name: String,
        autoMirror: Boolean = false,
        block: ImageVector.Builder.() -> Unit,
    ): ImageVector = ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
        autoMirror = autoMirror,
    ).apply(block).build()

    fun ImageVector.Builder.stroke(
        width: Float = Stroke,
        block: PathBuilder.() -> Unit,
    ) {
        path(
            fill = null,
            stroke = ink,
            strokeLineWidth = width,
            strokeLineCap = Cap,
            strokeLineJoin = Join,
            pathBuilder = block,
        )
    }

    fun ImageVector.Builder.fill(block: PathBuilder.() -> Unit) {
        path(fill = ink, stroke = null, pathBuilder = block)
    }
}

internal fun PathBuilder.circle(cx: Float, cy: Float, r: Float) {
    moveTo(cx + r, cy)
    arcTo(r, r, 0f, true, true, cx - r, cy)
    arcTo(r, r, 0f, true, true, cx + r, cy)
    close()
}

internal fun PathBuilder.roundedRect(left: Float, top: Float, right: Float, bottom: Float, radius: Float) {
    val w = right - left
    val h = bottom - top
    val rad = min(radius, min(w, h) / 2f)
    moveTo(left + rad, top)
    lineTo(right - rad, top)
    arcTo(rad, rad, 0f, false, true, right, top + rad)
    lineTo(right, bottom - rad)
    arcTo(rad, rad, 0f, false, true, right - rad, bottom)
    lineTo(left + rad, bottom)
    arcTo(rad, rad, 0f, false, true, left, bottom - rad)
    lineTo(left, top + rad)
    arcTo(rad, rad, 0f, false, true, left + rad, top)
    close()
}

internal fun PathBuilder.star(cx: Float, cy: Float, outer: Float, inner: Float, points: Int = 5) {
    val step = PI / points
    var angle = -PI / 2.0
    for (i in 0 until points * 2) {
        val r = if (i % 2 == 0) outer else inner
        val x = (cx + cos(angle) * r).toFloat()
        val y = (cy + sin(angle) * r).toFloat()
        if (i == 0) moveTo(x, y) else lineTo(x, y)
        angle += step
    }
    close()
}
