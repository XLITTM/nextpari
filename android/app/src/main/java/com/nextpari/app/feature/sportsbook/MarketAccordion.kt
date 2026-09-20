package com.nextpari.app.feature.sportsbook

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.OddsMovement

private val PinGreen = Color(0xFF22C55E)

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
    val columns = MarketAccordionLogic.columns(market)
    val rotation by animateFloatAsState(if (open) 90f else 0f, label = "market-chevron")
    Column(Modifier.fillMaxWidth().background(Color.White).animateContentSize()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle)
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                market.name,
                color = Color(0xFF1A1A1A),
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Text("(${market.lineCount})", color = Color(0xFF888888), fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.width(8.dp))
            Box(Modifier.size(28.dp).clickable(onClick = onPin), contentAlignment = Alignment.Center) {
                Icon(
                    if (pinned) NextpariIcons.PinFilled else NextpariIcons.Pin,
                    contentDescription = if (pinned) "Открепить рынок" else "Закрепить рынок",
                    tint = NextpariIconPalette.Action.Pin,
                    modifier = Modifier.size(16.dp),
                )
            }
            Icon(
                NextpariIcons.ChevronRight,
                contentDescription = null,
                tint = PinGreen,
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
    listOf(outcome.eventId, outcome.marketId, outcome.outcomeId.orEmpty(), outcome.line.orEmpty(), outcome.label).joinToString("|")

@Composable
fun MarketOutcomeButton(
    outcome: MarketOutcome,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val locked = outcome.locked || outcome.odds.isNullOrBlank()
    val oddsColor = when {
        selected -> Color.White
        outcome.movement == OddsMovement.Up -> Color(0xFF16A34A)
        outcome.movement == OddsMovement.Down -> Color(0xFFEF4444)
        else -> Color(0xFF1A1A1A)
    }
    val bg = when {
        selected -> PinGreen
        locked -> Color(0xFFE5E7EB)
        else -> Color(0xFFF8FAFC)
    }
    Row(
        modifier
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, if (selected) PinGreen else Color(0xFFE5E7EB), RoundedCornerShape(14.dp))
            .background(bg)
            .clickable(enabled = !locked, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(outcome.label, color = if (selected) Color.White else Color(0xFF1A1A1A), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        if (locked) {
            Icon(NextpariIcons.Lock, contentDescription = null, tint = NextpariIconPalette.Action.Lock, modifier = Modifier.size(14.dp))
        } else {
            Text(outcome.odds.orEmpty(), color = oddsColor, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
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
