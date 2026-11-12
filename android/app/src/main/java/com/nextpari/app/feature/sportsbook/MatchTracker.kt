package com.nextpari.app.feature.sportsbook

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.MatchTeamArtwork

@Composable
fun MatchTracker(
    match: MatchCardModel,
    sportLabel: String,
    onBack: () -> Unit,
    onToggleFavorite: (() -> Unit)? = null,
) {
    Box(Modifier.fillMaxWidth()) {
        MatchVenue(match.sport, Modifier.matchParentSize())
        Column(Modifier.fillMaxWidth().padding(bottom = 14.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(NextpariWebIcons.ArrowLeft, contentDescription = "Назад", tint = Color.White)
                }
                MatchCompetitionArtwork(match, Modifier.size(20.dp))
                Text(
                    "$sportLabel · ${match.league}",
                    color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 6.dp),
                )
                if (onToggleFavorite != null) {
                    IconButton(onClick = onToggleFavorite) {
                        Icon(
                            NextpariWebIcons.Star,
                            contentDescription = if (match.isFavorite) "Убрать из избранного" else "Добавить в избранное",
                            tint = if (match.isFavorite) Color(0xFFF4CD72) else Color.White,
                        )
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ScoreTeam(match, home = true, Modifier.weight(1f))
                Column(Modifier.width(92.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        if (match.isLive) match.score ?: "—" else "VS", color = Color.White,
                        fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1,
                    )
                    val minute = footballLiveMinute(match)
                    val status = if (match.isLive) minute?.let { "LIVE · $it" } ?: "LIVE" else match.kickoffLabel
                    status?.let {
                        Text(it, color = Color.White, fontSize = 11.sp, textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 4.dp).clip(RoundedCornerShape(6.dp))
                                .background(Color(0xA5082119)).padding(horizontal = 6.dp, vertical = 3.dp))
                    }
                    if (match.isLive && match.sport == "football") match.period?.let {
                        Text(it, color = Color(0xFFD5E7DD), fontSize = 11.sp, textAlign = TextAlign.Center)
                    }
                }
                ScoreTeam(match, home = false, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ScoreTeam(match: MatchCardModel, home: Boolean, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
        MatchTeamArtwork(match, home, Modifier.size(34.dp), placeholderTint = Color(0xFFCDDED6))
        Text(
            if (home) match.team1 else match.team2, color = Color.White, fontSize = 13.sp,
            fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun MatchVenue(sport: String, modifier: Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        fun point(x: Float, y: Float) = Offset(w * x, h * y)
        drawRect(Brush.verticalGradient(listOf(Color(0xFF122D37), Color(0xFF152F31), Color(0xFF0D251D))))
        drawOval(
            Brush.radialGradient(listOf(Color(0x4076C7B0), Color.Transparent), center = point(.15f, .22f), radius = w * .65f),
        )
        repeat(5) { row ->
            val y = .24f + row * .045f
            drawPath(Path().apply {
                moveTo(0f, h * y)
                quadraticTo(w * .5f, h * (y + .19f), w, h * y)
            }, color = Color(0x3859A093), style = Stroke(1.5.dp.toPx()))
        }

        val floor = when (sport) {
            "basketball" -> Color(0xFF9C693B)
            "tennis" -> Color(0xFF338079)
            "hockey" -> Color(0xFF9DBCC8)
            "football", "futsal" -> Color(0xFF32734F)
            else -> Color(0xFF31545B)
        }
        val court = Path().apply {
            moveTo(w * .27f, h * .46f)
            lineTo(w * .73f, h * .46f)
            lineTo(w, h)
            lineTo(0f, h)
            close()
        }
        drawPath(court, brush = Brush.verticalGradient(listOf(floor, floor.copy(alpha = .72f)), startY = h * .46f))
        val ink = Color.White.copy(alpha = .38f)
        val stroke = 1.dp.toPx()
        drawPath(court, color = ink, style = Stroke(stroke))
        drawLine(ink, point(.5f, .46f), point(.5f, 1f), stroke)
        when (sport) {
            "football", "futsal", "basketball", "hockey" -> {
                drawOval(ink, topLeft = point(.44f, .64f), size = Size(w * .12f, h * .16f), style = Stroke(stroke))
                drawLine(ink, point(.16f, .69f), point(.30f, .69f), stroke)
                drawLine(ink, point(.30f, .69f), point(.24f, .89f), stroke)
                drawLine(ink, point(.24f, .89f), point(.06f, .89f), stroke)
                drawLine(ink, point(.84f, .69f), point(.70f, .69f), stroke)
                drawLine(ink, point(.70f, .69f), point(.76f, .89f), stroke)
                drawLine(ink, point(.76f, .89f), point(.94f, .89f), stroke)
                if (sport == "hockey") {
                    drawLine(Color(0x80367EB2), point(.39f, .46f), point(.29f, 1f), 2 * stroke)
                    drawLine(Color(0x80367EB2), point(.61f, .46f), point(.71f, 1f), 2 * stroke)
                }
            }
            "tennis", "volleyball", "beach-volleyball", "table-tennis", "badminton" -> {
                drawLine(ink, point(.22f, .57f), point(.78f, .57f), stroke)
                drawLine(ink, point(.06f, .89f), point(.94f, .89f), stroke)
                drawLine(ink, point(.40f, .46f), point(.34f, 1f), stroke)
                drawLine(ink, point(.60f, .46f), point(.66f, 1f), stroke)
            }
        }
        drawRect(Brush.verticalGradient(listOf(Color(0x2005130F), Color(0x72051010), Color(0x6005160D))))
    }
}
