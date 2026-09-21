package com.nextpari.app.core.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/**
 * Exact SVG geometry from src/components/SectionIcons.tsx.
 * fillGreen = #4ADE80, ink = #FFFFFF.
 */
object NextpariSectionIcons {
    private val FillGreen = SolidColor(Color(0xFF4ADE80))
    private val Ink = SolidColor(Color.White)

    val Top: ImageVector by lazy {
        ImageVector.Builder("section.Top", 24.dp, 24.dp, 24f, 24f).apply {
            fill("M12 2c1.4 3.2-.6 5.2 1.6 8.4-2.6-.4-4-2.2-4.6 1.6C8.6 8.4 9.6 5.2 12 2z")
            fill("M16.2 4.2c.9 2.4-.2 4.2 1.6 6.6-2.3-.1-3.6-1.6-4.2 1.4.3-3.2 1.2-5.4 2.6-8z")
            fill("M8.6 9.2C6.4 11.6 6 14.2 7.4 16.6c1.2 2.1 3.4 3.4 5.8 3.4 4.2 0 7-3.2 6.4-7.2-.4-2.4-2.2-3.6-4.2-3.2-1.2-2.2-3.6-2.4-6.8-.4z")
        }.build()
    }

    val Sport: ImageVector by lazy {
        ImageVector.Builder("section.Sport", 24.dp, 24.dp, 24f, 24f).apply {
            fill("M11.8 1.5c.5 2.6-1.5 3.8.8 6.8-2.4-.6-3.4-2.2-4.1.8C8.6 6.2 9.7 3.4 11.8 1.5z")
            fill("M15.6 2.8c.7 2.2-.3 3.8 1.4 6-2-.2-3-1.5-3.7.9.4-2.6 1.2-4.6 2.3-6.9z")
            fillCircle(12f, 15.2f, 7.4f)
            fill("M12 12.35l1.75 1.27-.67 2.06h-2.16l-.67-2.06z", Ink)
            stroke(
                "M12 12.35v-2.7M13.75 13.62l2.35-1.05M13.08 15.68l1.35 2.05M10.92 15.68l-1.35 2.05M10.25 13.62l-2.35-1.05",
                1.1f,
                Ink,
            )
        }.build()
    }

    val Esports: ImageVector by lazy {
        ImageVector.Builder("section.Esports", 24.dp, 24.dp, 24f, 24f).apply {
            fill("M7.2 7.6h9.6c2.6 0 4.7 2.15 4.7 4.9 0 2.35-1.55 4.25-3.55 4.25-.85 0-1.6-.35-2.2-1l-.85-.85H8.1l-.85.85c-.6.65-1.35 1-2.2 1-2 0-3.55-1.9-3.55-4.25 0-2.75 2.1-4.9 4.7-4.9z")
            stroke("M6.9 11.35v3.1M5.35 12.9h3.1", 1.5f, Ink)
            fillCircle(15.15f, 11.55f, 1f, Ink)
            fillCircle(17.15f, 13.05f, 1f, Ink)
            fillCircle(13.2f, 13.05f, 1f, Ink)
            fillCircle(15.15f, 14.55f, 1f, Ink)
        }.build()
    }

    val Casino: ImageVector by lazy {
        ImageVector.Builder("section.Casino", 24.dp, 24.dp, 24f, 24f).apply {
            fill("M7.7,2.6h8.6a2.2,2.2 0 0 1 2.2,2.2v14.4a2.2,2.2 0 0 1 -2.2,2.2h-8.6a2.2,2.2 0 0 1 -2.2,-2.2v-14.4a2.2,2.2 0 0 1 2.2,-2.2z")
            fill(
                "M12 16.6c-2.85-2.15-4.45-3.75-4.45-5.55 0-1.3.95-2.25 2.2-2.25.85 0 1.6.5 2.25 1.35.65-.85 1.4-1.35 2.25-1.35 1.25 0 2.2.95 2.2 2.25 0 1.8-1.6 3.4-4.45 5.55z",
                Ink,
            )
            fill("M7.6 5.1h1.15l.85 2.15.85-2.15H11.6l-1.4 3.15v1.85H9v-1.85z", Ink)
        }.build()
    }

    val Games: ImageVector by lazy {
        ImageVector.Builder("section.Games", 24.dp, 24.dp, 24f, 24f).apply {
            fill("M11.2,3.2h7a2,2 0 0 1 2,2v7a2,2 0 0 1 -2,2h-7a2,2 0 0 1 -2,-2v-7a2,2 0 0 1 2,-2z")
            fillCircle(12.2f, 6.2f, 0.95f, Ink)
            fillCircle(17.2f, 11.2f, 0.95f, Ink)
            fillCircle(14.7f, 8.7f, 0.95f, Ink)
            fill("M5.6,9.6h7.2a2,2 0 0 1 2,2v7.2a2,2 0 0 1 -2,2h-7.2a2,2 0 0 1 -2,-2v-7.2a2,2 0 0 1 2,-2z")
            fillCircle(7f, 13f, 0.95f, Ink)
            fillCircle(11.4f, 13f, 0.95f, Ink)
            fillCircle(7f, 17.4f, 0.95f, Ink)
            fillCircle(11.4f, 17.4f, 0.95f, Ink)
            fillCircle(9.2f, 15.2f, 0.95f, Ink)
        }.build()
    }

    private fun ImageVector.Builder.fill(d: String, brush: SolidColor = FillGreen) {
        addPath(
            pathData = PathParser().parsePathString(d).toNodes(),
            fill = brush,
        )
    }

    private fun ImageVector.Builder.stroke(d: String, width: Float, brush: SolidColor) {
        addPath(
            pathData = PathParser().parsePathString(d).toNodes(),
            fill = SolidColor(Color.Transparent),
            fillAlpha = 0f,
            stroke = brush,
            strokeLineWidth = width,
            strokeLineCap = StrokeCap.Round,
        )
    }

    private fun ImageVector.Builder.fillCircle(cx: Float, cy: Float, r: Float, brush: SolidColor = FillGreen) {
        fill("M${cx + r},$cy A$r,$r 0 1 1 ${cx - r},$cy A$r,$r 0 1 1 ${cx + r},$cy", brush)
    }
}
