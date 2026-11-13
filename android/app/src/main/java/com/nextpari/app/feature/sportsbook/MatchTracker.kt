@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)

package com.nextpari.app.feature.sportsbook

import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.R
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.MatchTeamArtwork
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

internal enum class MatchTrackerPage(val label: String, val unavailable: String? = null) {
    Scoreboard("Счёт"),
    Periods("Периоды", "Счёт по периодам недоступен"),
    Statistics("Статистика", "Статистика недоступна"),
    Timeline("Хронология", "Хронология недоступна"),
    History("История", "История встреч недоступна"),
    Venue("О матче"),
}

@Composable
internal fun MatchTracker(
    match: MatchCardModel,
    sportLabel: String,
    showBroadcast: Boolean,
    onBroadcastChange: (Boolean) -> Unit,
    onBack: () -> Unit,
    onToggleFavorite: (() -> Unit)? = null,
    onOpenCoupon: (() -> Unit)? = null,
) {
    val pager = rememberPagerState(pageCount = { MatchTrackerPage.entries.size })
    val scope = rememberCoroutineScope()
    val liveStatus = matchLiveStatus(match)
    val insights = currentInsights(match.insights)
    Box(Modifier.fillMaxWidth()) {
        MatchVenue(match.sport, Modifier.matchParentSize())
        Column(Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
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
                if (onOpenCoupon != null) {
                    IconButton(onClick = onOpenCoupon) {
                        Icon(NextpariWebIcons.Ticket, contentDescription = "Купон", tint = Color.White)
                    }
                }
            }
            val tabShape = RoundedCornerShape(50)
            Row(
                Modifier.align(Alignment.CenterHorizontally).padding(horizontal = 12.dp)
                    .clip(tabShape).background(Color.Black.copy(alpha = .43f))
                    .border(1.dp, Color.White.copy(alpha = .18f), tabShape)
                    .selectableGroup().padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                TrackerTab("Информация", !showBroadcast) { onBroadcastChange(false) }
                TrackerTab("Трансляция", showBroadcast) { onBroadcastChange(true) }
            }
            if (showBroadcast) {
                TrackerMessage("Трансляция недоступна", Modifier.fillMaxWidth().height(112.dp))
            } else {
                HorizontalPager(
                    state = pager,
                    key = { MatchTrackerPage.entries[it].name },
                    modifier = Modifier.fillMaxWidth().height(112.dp),
                ) { index ->
                    when (val page = MatchTrackerPage.entries[index]) {
                        MatchTrackerPage.Scoreboard -> ScoreSlide(match, liveStatus)
                        MatchTrackerPage.Venue -> {
                            val place = match.country.takeIf { it.isNotBlank() }?.let(SportsRegions::name)
                            TrackerInfo(page.label, listOfNotNull(place, match.kickoffLabel, "Стадион не указан"))
                        }
                        MatchTrackerPage.Periods -> {
                            val lines = insights?.periodScores.orEmpty().map { score ->
                                val period = when (score.period) {
                                    "1" -> "1-й тайм"
                                    "2" -> "2-й тайм"
                                    else -> "Период ${score.period}"
                                }
                                "$period · ${score.home} : ${score.away}"
                            }
                            TrackerInfo(page.label, lines.ifEmpty { listOfNotNull(liveStatus, page.unavailable) })
                        }
                        MatchTrackerPage.Statistics -> {
                            val stats = insights?.statistics.orEmpty()
                            if (stats.isEmpty()) TrackerInfo(page.label, listOfNotNull(page.unavailable))
                            else TrackerStatistics(match, stats)
                        }
                        MatchTrackerPage.Timeline -> {
                            val lines = insights?.timeline.orEmpty().map(MatchInsights.Incident::text)
                            TrackerInfo(page.label, lines.ifEmpty { listOfNotNull(page.unavailable) })
                        }
                        MatchTrackerPage.History -> TrackerInfo(page.label, listOfNotNull(page.unavailable))
                    }
                }
                Row(
                    Modifier.fillMaxWidth().selectableGroup(),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    MatchTrackerPage.entries.forEachIndexed { index, page ->
                        val selected = pager.currentPage == index
                        Box(
                            Modifier.size(width = 40.dp, height = 30.dp)
                                .semantics { contentDescription = page.label }
                                .selectable(selected, role = Role.Tab, onClick = { scope.launch { pager.animateScrollToPage(index) } }),
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(Modifier.size(width = if (selected) 16.dp else 6.dp, height = 6.dp)
                                .clip(CircleShape).background(Color.White.copy(alpha = if (selected) 1f else .46f)))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TrackerTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(if (selected) Color.White else Color.Transparent)
            .selectable(selected, role = Role.Tab, onClick = onClick).padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(label, color = if (selected) Color(0xFF10241C) else Color.White, fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium, maxLines = 1,
            overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun TrackerMessage(message: String, modifier: Modifier) {
    Box(modifier.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
        Text(message, color = Color.White, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun currentInsights(insights: MatchInsights?): MatchInsights? {
    if (insights == null) return null
    val expires = insights.expiresAtElapsedMs
    val valid by key(expires) {
        produceState(expires > SystemClock.elapsedRealtime()) {
            delay((expires - SystemClock.elapsedRealtime()).coerceAtLeast(0))
            value = false
        }
    }
    return insights.takeIf { valid }
}

@Composable
private fun TrackerInfo(title: String, lines: List<String>) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        Text(title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        lines.forEach { line ->
            Text(line, color = Color(0xFFD5E7DD), fontSize = 12.sp, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun TrackerStatistics(match: MatchCardModel, statistics: List<MatchInsights.Statistic>) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Row(Modifier.fillMaxWidth()) {
            Text(match.team1, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text(match.team2, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        }
        statistics.forEach { stat ->
            val unit = if (stat.key == "possession_rt") "%" else ""
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("${stat.home}$unit", color = Color.White, fontSize = 12.sp, modifier = Modifier.width(40.dp))
                Text(stat.label, color = Color(0xFFD5E7DD), fontSize = 12.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f))
                Text("${stat.away}$unit", color = Color.White, fontSize = 12.sp, textAlign = TextAlign.End,
                    modifier = Modifier.width(40.dp))
            }
        }
    }
}

@Composable
private fun ScoreSlide(match: MatchCardModel, liveStatus: String?) {
    Row(
        Modifier.fillMaxSize().padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ScoreTeam(match, home = true, Modifier.weight(1f))
        val scoreShape = RoundedCornerShape(14.dp)
        Column(
            Modifier.width(116.dp).clip(scoreShape).background(Color(0x9A081A16))
                .border(1.dp, Color.White.copy(alpha = .16f), scoreShape)
                .padding(horizontal = 6.dp, vertical = 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                if (match.isLive) match.score ?: "—" else "VS", color = Color.White,
                fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1,
            )
            (if (match.isLive) liveStatus else match.kickoffLabel)?.let {
                Text(
                    it, color = Color(0xFFD5E7DD), fontSize = 11.sp, textAlign = TextAlign.Center,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp),
                )
            }
        }
        ScoreTeam(match, home = false, Modifier.weight(1f))
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
    if (sport != "football" && sport != "futsal") {
        CourtBackground(sport, modifier)
        return
    }
    Box(modifier.background(Color(0xFF0A1F12))) {
        // The original NextPari web match background from .match-bg-football.
        Image(
            painter = painterResource(R.drawable.np_match_football_stadium),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.matchParentSize(),
        )
        Box(
            Modifier.matchParentSize().background(
                Brush.verticalGradient(listOf(Color(0xA405130F), Color(0x65051010), Color(0xB005160D))),
            ),
        )
    }
}

@Composable
private fun CourtBackground(sport: String, modifier: Modifier) {
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
            "basketball", "hockey" -> {
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
