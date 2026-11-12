package com.nextpari.app.feature.sportsbook

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.feature.home.OddsMovement

@Composable
fun MarketAccordion(
    market: MarketGroup,
    open: Boolean,
    pinned: Boolean,
    selectedKeys: Set<String>,
    onToggle: () -> Unit,
    onPin: () -> Unit,
    onSelect: (MarketOutcome) -> Unit,
) {
    val colors = NextpariTheme.colors
    val columns = MarketAccordionLogic.columns(market)
    val rotation by animateFloatAsState(if (open) 180f else 0f, label = "market-chevron")
    Column(Modifier.fillMaxWidth()) {
        HorizontalDivider(Modifier.padding(horizontal = 12.dp), color = colors.border)
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle)
                .heightIn(min = 42.dp).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                market.name,
                color = colors.text,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Box(Modifier.size(36.dp).clickable(onClick = onPin), contentAlignment = Alignment.Center) {
                Icon(
                    NextpariWebIcons.Pin,
                    contentDescription = if (pinned) "Открепить рынок" else "Закрепить рынок",
                    tint = if (pinned) colors.accent else colors.textMuted,
                    modifier = Modifier.size(16.dp),
                )
            }
            Icon(
                NextpariWebIcons.ChevronDown,
                contentDescription = null,
                tint = colors.textSecondary,
                modifier = Modifier.size(16.dp).rotate(rotation),
            )
        }
        AnimatedVisibility(visible = open, enter = expandVertically(), exit = shrinkVertically()) {
            Column(Modifier.padding(start = 10.dp, end = 10.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                market.outcomes.chunked(columns).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                        row.forEach { outcome ->
                            MarketOutcomeButton(
                                outcome = outcome,
                                selected = outcomeIdentity(outcome) in selectedKeys,
                                modifier = Modifier.weight(1f),
                                onClick = { onSelect(outcome) },
                            )
                        }
                        repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

fun outcomeIdentity(outcome: MarketOutcome): String =
    outcome.selection?.identity ?: listOf(outcome.eventId, outcome.marketId, outcome.outcomeId.orEmpty(), outcome.line.orEmpty(), outcome.label).joinToString("|")

@Composable
fun MarketOutcomeButton(
    outcome: MarketOutcome,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val colors = NextpariTheme.colors
    val locked = outcome.locked || outcome.odds.isNullOrBlank()
    val expires = outcome.observedUntil
    val observed by produceState(expires != null && expires > SystemClock.elapsedRealtime(), expires) {
        value = expires != null && expires > SystemClock.elapsedRealtime()
        if (expires != null && value) delay((expires - SystemClock.elapsedRealtime()).coerceAtLeast(0))
        value = false
    }
    val highlighted = selected && !locked
    val oddsColor = when {
        highlighted -> colors.accentInk
        outcome.movement == OddsMovement.Up -> Color(0xFF16A34A)
        outcome.movement == OddsMovement.Down -> Color(0xFFEF4444)
        else -> colors.text
    }
    val bg = when {
        highlighted -> colors.surfaceMint
        locked -> colors.surfaceMuted
        else -> colors.surfaceSoft
    }
    Row(
        modifier
            .heightIn(min = 38.dp)
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, if (highlighted) colors.accent else colors.border, RoundedCornerShape(10.dp))
            .background(bg)
            .clickable(enabled = !locked, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(outcome.label, color = if (highlighted) colors.accentInk else colors.textSecondary,
            fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).padding(end = 4.dp))
        if (locked && (!observed || outcome.odds == null)) {
            Icon(NextpariWebIcons.Lock, contentDescription = null, tint = colors.textMuted, modifier = Modifier.size(14.dp))
        } else {
            Text(outcome.odds.orEmpty(), color = oddsColor, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, maxLines = 1)
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun MarketAccordionPreview() {
    NextpariTheme(darkTheme = false) {
        MarketAccordion(
            market = SportsbookPreviewData.markets.first(),
            open = true,
            pinned = true,
            selectedKeys = emptySet(),
            onToggle = {},
            onPin = {},
            onSelect = {},
        )
    }
}
