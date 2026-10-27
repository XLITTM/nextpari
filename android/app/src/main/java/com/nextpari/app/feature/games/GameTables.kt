package com.nextpari.app.feature.games

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.player.formatServerBalance
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun GameStage(
    title: String,
    spec: GameSpec,
    state: GameUiState,
    onBack: () -> Unit,
    onStake: (String) -> Unit,
    onPlay: () -> Unit,
    onAct: (String, Map<String, String>) -> Unit,
) {
    val colors = NextpariTheme.colors
    val round = state.round
    val open = round?.state == "open"
    val stake = parseStake(state.stakeText)
    val short = state.available != null && (state.available < spec.minStake || stake > state.available)
    val canPlay = !state.busy && !state.blocked && !open && stake >= spec.minStake && !short
    Column(Modifier.fillMaxSize().background(colors.bg)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Назад",
                color = colors.accent,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(CircleShape).clickable(onClick = onBack).padding(8.dp),
            )
            Text(
                title,
                color = colors.text,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 18.sp,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
            )
            Column(horizontalAlignment = Alignment.End) {
                Text("Баланс", color = colors.textMuted, fontSize = 10.sp)
                Text(state.balanceLabel, color = colors.accent, fontWeight = FontWeight.Black, fontSize = 13.sp)
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (spec.code) {
                "blackjack" -> BlackjackTable(round)
                "apples" -> AppleTable(round, state.busy, onAct)
                "aviator" -> AviatorStage(round, state.sessionNote)
                "crystal" -> CrystalTable(round)
                "dice" -> DiceTable(round, state.busy)
                "pharaoh" -> PharaohTable(round, state.busy)
            }
        }
        Column(
            Modifier.fillMaxWidth().background(colors.surface).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (state.blocked) {
                Text(state.error ?: "Игра временно недоступна", color = colors.danger, fontWeight = FontWeight.Bold)
            } else {
                if (!open) {
                    androidx.compose.material3.OutlinedTextField(
                        value = state.stakeText,
                        onValueChange = onStake,
                        enabled = !state.busy,
                        label = { Text("Ставка") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text("Минимум ${formatServerBalance(spec.minStake)}", color = colors.textMuted, fontSize = 12.sp)
                }
                if (short && state.error != "Недостаточно средств") {
                    Text("Недостаточно средств", color = colors.danger, fontWeight = FontWeight.Bold)
                }
                state.error?.let { Text(it, color = colors.danger) }
                Settlement(round)
                when (spec.code) {
                    "blackjack" -> if (open) BlackjackActions(round, state.busy, onAct)
                    "apples" -> AppleDock(round, state.busy, canPlay, onPlay, onAct)
                    "aviator" -> if (open && round?.allowedActions?.contains("cashout") == true) {
                        DockButton("Забрать", enabled = !state.busy) { onAct("cashout", emptyMap()) }
                    }
                }
                if (!open && spec.code != "apples") {
                    DockButton(if (state.busy) "Запуск..." else "Играть", enabled = canPlay, onClick = onPlay)
                }
            }
        }
    }
}

@Composable
private fun BlackjackTable(round: PlayerGameRound?) {
    val felt = Brush.verticalGradient(listOf(Color(0xFF0E4D32), Color(0xFF146B45), Color(0xFF0B3A26)))
    Column(
        Modifier.fillMaxSize().background(felt).padding(16.dp),
        verticalArrangement = Arrangement.SpaceEvenly,
    ) {
        HandRow("Дилер", cardFaces(round?.publicResult?.get("dealerHand")))
        HandRow("Вы", cardFaces(round?.publicResult?.get("playerHand")))
    }
}

@Composable
private fun HandRow(label: String, cards: List<CardFace>) {
    Column {
        Text(label, color = Color(0xFFE8FFF4), fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Spacer(Modifier.height(8.dp))
        if (cards.isEmpty()) {
            Text("Карты появятся после раздачи", color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp)
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                cards.forEach { PlayingCard(it) }
            }
        }
    }
}

@Composable
private fun PlayingCard(card: CardFace) {
    val red = card.suit == "♥" || card.suit == "♦"
    Box(
        Modifier.size(width = 62.dp, height = 88.dp).clip(RoundedCornerShape(10.dp)).background(if (card.hidden) Color(0xFF12324A) else Color.White),
        contentAlignment = Alignment.Center,
    ) {
        if (card.hidden) {
            Text("N", color = Color(0xFFD4AF37), fontWeight = FontWeight.Black, fontSize = 22.sp)
        } else {
            Text(card.rank, color = if (red) Color(0xFFE11D48) else Color(0xFF0F172A), fontWeight = FontWeight.Black, fontSize = 16.sp, modifier = Modifier.align(Alignment.TopStart).padding(6.dp))
            Text(card.suit, color = if (red) Color(0xFFE11D48) else Color(0xFF0F172A), fontSize = 28.sp, fontWeight = FontWeight.Bold)
        }
        Canvas(Modifier.matchParentSize()) {
            drawRoundRect(
                color = Color(0xFFD4AF37),
                cornerRadius = CornerRadius(18f, 18f),
                style = Stroke(width = 3f),
            )
        }
    }
}

@Composable
private fun AppleTable(round: PlayerGameRound?, busy: Boolean, onAct: (String, Map<String, String>) -> Unit) {
    val rows = appleBoard(round).asReversed()
    val active = appleActiveLevel(round)
    val playing = applePhase(round) == "playing" || (round?.state == "open" && "pick" in round.allowedActions)
    Column(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF14532D), Color(0xFF052E16)))).padding(8.dp),
        verticalArrangement = Arrangement.Bottom,
    ) {
        rows.forEach { row ->
            val current = row.level == active && playing
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
                Text(
                    "x${row.multiplier}",
                    color = if (current) Color(0xFF052E16) else Color(0xFF86EFAC),
                    fontWeight = FontWeight.Black,
                    fontSize = 11.sp,
                    modifier = Modifier.width(52.dp).clip(CircleShape).background(if (current) Color(0xFF4ADE80) else Color.Black.copy(alpha = 0.35f)).padding(vertical = 2.dp),
                    textAlign = TextAlign.Center,
                )
                row.cells.forEachIndexed { index, cell ->
                    AppleGlyph(
                        cell = cell,
                        active = current && !cell.revealed,
                        enabled = current && !cell.revealed && !busy,
                        onClick = { onAct("pick", mapOf("col" to index.toString())) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AppleGlyph(cell: AppleCellFace, active: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val fill = when {
        cell.revealed && cell.kind == "bad" -> Color(0xFF7F1D1D)
        cell.revealed -> Color(0xFF84CC16)
        active -> Color(0xFF22C55E)
        else -> Color(0xFFB91C1C).copy(alpha = 0.55f)
    }
    Canvas(
        Modifier.padding(horizontal = 3.dp).size(36.dp).clickable(enabled = enabled, onClick = onClick),
    ) {
        drawCircle(fill)
        drawCircle(Color.White.copy(alpha = 0.35f), radius = size.minDimension * 0.18f, center = Offset(size.width * 0.38f, size.height * 0.34f))
        if (!cell.revealed || cell.kind != "bad") {
            drawCircle(Color(0xFF166534), radius = size.minDimension * 0.08f, center = Offset(size.width * 0.62f, size.height * 0.18f))
        }
    }
}

@Composable
private fun AviatorStage(round: PlayerGameRound?, session: String?) {
    val multiplier = aviatorMultiplier(round, session)
    val crash = aviatorCrash(round, session)
    val phase = aviatorPhase(round, session)
    val flying = phase == "flying" || phase == "fly"
    val progress = ((multiplier?.replace(',', '.')?.toFloatOrNull() ?: 1f) - 1f).coerceIn(0f, 8f) / 8f
    val bob = rememberInfiniteTransition(label = "plane").animateFloat(
        initialValue = -6f,
        targetValue = 6f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse),
        label = "bob",
    )
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF020617), Color(0xFF0F172A), Color(0xFF134E4A))))) {
        Canvas(Modifier.fillMaxSize().padding(24.dp)) {
            val start = Offset(size.width * 0.08f, size.height * 0.78f)
            val control = Offset(size.width * 0.42f, size.height * 0.72f)
            val end = Offset(size.width * 0.88f, size.height * 0.22f)
            val path = Path().apply {
                moveTo(start.x, start.y)
                quadraticTo(control.x, control.y, end.x, end.y)
            }
            drawPath(path, Color(0xFF22F39A).copy(alpha = 0.85f), style = Stroke(width = 8f))
            val t = if (flying || crash != null) progress else 0.05f
            val u = 1f - t
            val point = Offset(
                u * u * start.x + 2 * u * t * control.x + t * t * end.x,
                u * u * start.y + 2 * u * t * control.y + t * t * end.y + if (flying) bob.value else 0f,
            )
            rotate(degrees = -28f * t, pivot = point) {
                val body = Path().apply {
                    moveTo(point.x + 34f, point.y)
                    lineTo(point.x - 28f, point.y - 12f)
                    lineTo(point.x - 18f, point.y)
                    lineTo(point.x - 28f, point.y + 12f)
                    close()
                }
                drawPath(body, if (crash != null && phase != "flying") Color(0xFFFB7185) else Color.White)
            }
        }
        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                multiplier?.let { "${it}x" } ?: "Ожидание",
                color = Color.White,
                fontWeight = FontWeight.Black,
                fontSize = 42.sp,
            )
            Text(
                when {
                    crash != null -> "Крушение ${crash}x"
                    phase.isBlank() -> "Ставка до взлёта"
                    else -> phase
                },
                color = Color(0xFF99F6E4),
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun CrystalTable(round: PlayerGameRound?) {
    val gems = crystalGems(round)
    Column(
        Modifier.fillMaxSize().background(Brush.radialGradient(listOf(Color(0xFF1E1B4B), Color(0xFF0B1020)))).padding(16.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        if (gems.isEmpty()) {
            Text("Поле появится после вращения", color = Color(0xFFC4B5FD), fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally))
            Spacer(Modifier.height(12.dp))
        }
        val shown = if (gems.isEmpty()) List(49) { CrystalGem("") } else gems.take(49)
        shown.chunked(7).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                row.forEach { gem ->
                    Canvas(Modifier.padding(2.dp).size(36.dp)) {
                        val color = gemColor(gem.kind)
                        val path = Path().apply {
                            moveTo(size.width / 2f, 2f)
                            lineTo(size.width - 2f, size.height / 2f)
                            lineTo(size.width / 2f, size.height - 2f)
                            lineTo(2f, size.height / 2f)
                            close()
                        }
                        drawPath(path, color)
                        drawPath(path, if (gem.exploding) Color(0xFFF5C969) else Color.White.copy(alpha = 0.45f), style = Stroke(if (gem.exploding) 4f else 2f))
                    }
                }
            }
        }
    }
}

private fun gemColor(kind: String): Color = when (kind) {
    "green" -> Color(0xFF22C55E)
    "cyan" -> Color(0xFF22D3EE)
    "red" -> Color(0xFFEF4444)
    "blue" -> Color(0xFF3B82F6)
    "purple" -> Color(0xFFA855F7)
    "orange" -> Color(0xFFF97316)
    "coin" -> Color(0xFFF5C969)
    else -> Color(0xFF334155)
}

@Composable
private fun DiceTable(round: PlayerGameRound?, busy: Boolean) {
    val player = diceFaces(round?.publicResult?.get("playerDice"))
    val rival = diceFaces(round?.publicResult?.get("rivalDice"))
    val spin by rememberInfiniteTransition(label = "dice").animateFloat(
        initialValue = 0f,
        targetValue = 18f,
        animationSpec = infiniteRepeatable(tween(120, easing = LinearEasing), RepeatMode.Reverse),
        label = "tilt",
    )
    Column(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF3F1D12), Color(0xFF14532D)))).padding(20.dp),
        verticalArrangement = Arrangement.SpaceEvenly,
    ) {
        Text("Вы", color = Color(0xFFFECACA), fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DieFace(player.getOrNull(0), Color(0xFFB91C1C), busy, spin)
            DieFace(player.getOrNull(1), Color(0xFFB91C1C), busy, spin)
        }
        Text("Соперник", color = Color(0xFFD9F99D), fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DieFace(rival.getOrNull(0), Color(0xFF111827), busy, -spin)
            DieFace(rival.getOrNull(1), Color(0xFF111827), busy, -spin)
        }
    }
}

@Composable
private fun DieFace(value: Int?, color: Color, busy: Boolean, tilt: Float) {
    Canvas(Modifier.size(72.dp).rotate(if (busy) tilt else 0f)) {
        drawRoundRect(color, cornerRadius = CornerRadius(28f, 28f))
        val face = if (busy || value == null) 0 else value.coerceIn(1, 6)
        val spots = pipOffsets(face)
        spots.forEach { spot ->
            drawCircle(Color.White, radius = size.minDimension * 0.08f, center = Offset(size.width * spot.x, size.height * spot.y))
        }
    }
}

private fun pipOffsets(face: Int): List<Offset> {
    val c = Offset(0.5f, 0.5f)
    val tl = Offset(0.28f, 0.28f)
    val tr = Offset(0.72f, 0.28f)
    val ml = Offset(0.28f, 0.5f)
    val mr = Offset(0.72f, 0.5f)
    val bl = Offset(0.28f, 0.72f)
    val br = Offset(0.72f, 0.72f)
    return when (face) {
        1 -> listOf(c)
        2 -> listOf(tl, br)
        3 -> listOf(tl, c, br)
        4 -> listOf(tl, tr, bl, br)
        5 -> listOf(tl, tr, c, bl, br)
        6 -> listOf(tl, tr, ml, mr, bl, br)
        else -> emptyList()
    }
}

@Composable
private fun PharaohTable(round: PlayerGameRound?, busy: Boolean) {
    val tiles = pharaohTiles(round)
    val prize = pharaohPrize(round)
    Column(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF78350F), Color(0xFF1C1917)))).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        PharaohTile(if (prize.isBlank()) null else prize, large = true)
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(6) { index ->
                val id = tiles.getOrNull(index)
                PharaohTile(if (busy) null else id, large = false)
            }
        }
    }
}

@Composable
private fun PharaohTile(id: String?, large: Boolean) {
    val size = if (large) 92.dp else 48.dp
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Canvas(Modifier.size(size)) {
            val gold = Color(0xFFF5C969)
            drawRoundRect(
                if (id == null) Color(0xFFD6B25E) else Color(0xFF3F2A12),
                cornerRadius = CornerRadius(18f, 18f),
            )
            drawRoundRect(gold, cornerRadius = CornerRadius(18f, 18f), style = Stroke(3f))
            if (id != null) drawPharaohMark(id, gold)
        }
        if (large && id != null) {
            Text(pharaohName(id), color = Color(0xFFFDE68A), fontWeight = FontWeight.Bold, fontSize = 12.sp)
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawPharaohMark(id: String, ink: Color) {
    val w = size.width
    val h = size.height
    when (id) {
        "pyramid" -> drawPath(Path().apply {
            moveTo(w * 0.5f, h * 0.22f)
            lineTo(w * 0.78f, h * 0.74f)
            lineTo(w * 0.22f, h * 0.74f)
            close()
        }, ink)
        "ankh" -> {
            drawCircle(ink, radius = w * 0.12f, center = Offset(w * 0.5f, h * 0.32f), style = Stroke(4f))
            drawLine(ink, Offset(w * 0.5f, h * 0.42f), Offset(w * 0.5f, h * 0.78f), strokeWidth = 4f)
            drawLine(ink, Offset(w * 0.32f, h * 0.52f), Offset(w * 0.68f, h * 0.52f), strokeWidth = 4f)
        }
        "lotus" -> {
            drawCircle(ink, w * 0.08f, Offset(w * 0.5f, h * 0.38f))
            drawCircle(ink, w * 0.08f, Offset(w * 0.34f, h * 0.56f))
            drawCircle(ink, w * 0.08f, Offset(w * 0.66f, h * 0.56f))
        }
        "ring" -> drawCircle(ink, w * 0.18f, Offset(w * 0.5f, h * 0.5f), style = Stroke(5f))
        "scroll" -> drawRoundRect(ink, topLeft = Offset(w * 0.28f, h * 0.24f), size = Size(w * 0.44f, h * 0.52f), cornerRadius = CornerRadius(8f, 8f), style = Stroke(4f))
        "harp" -> drawArc(ink, startAngle = 200f, sweepAngle = 140f, useCenter = false, topLeft = Offset(w * 0.22f, h * 0.22f), size = Size(w * 0.56f, h * 0.56f), style = Stroke(4f))
        "cat" -> {
            drawCircle(ink, w * 0.12f, Offset(w * 0.5f, h * 0.55f))
            drawPath(Path().apply {
                moveTo(w * 0.32f, h * 0.48f); lineTo(w * 0.28f, h * 0.28f); lineTo(w * 0.46f, h * 0.42f); close()
            }, ink)
            drawPath(Path().apply {
                moveTo(w * 0.68f, h * 0.48f); lineTo(w * 0.72f, h * 0.28f); lineTo(w * 0.54f, h * 0.42f); close()
            }, ink)
        }
        "cylinder" -> drawRoundRect(ink, topLeft = Offset(w * 0.34f, h * 0.22f), size = Size(w * 0.32f, h * 0.56f), cornerRadius = CornerRadius(20f, 20f))
        else -> drawCircle(ink, w * 0.16f, Offset(w * 0.5f, h * 0.5f))
    }
}

@Composable
private fun Settlement(round: PlayerGameRound?) {
    if (round == null || round.state == "open") return
    val won = round.payout > 0.0
    val colors = NextpariTheme.colors
    Text(
        if (won) "Выплата ${formatServerBalance(round.payout)}" else "Проигрыш",
        color = if (won) colors.accent else colors.danger,
        fontWeight = FontWeight.Black,
        fontSize = 18.sp,
    )
}

@Composable
private fun BlackjackActions(round: PlayerGameRound?, busy: Boolean, onAct: (String, Map<String, String>) -> Unit) {
    val allowed = round?.allowedActions.orEmpty()
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        if ("hit" in allowed) DockButton("Ещё", enabled = !busy, modifier = Modifier.weight(1f)) { onAct("hit", emptyMap()) }
        if ("stand" in allowed) DockButton("Хватит", enabled = !busy, modifier = Modifier.weight(1f)) { onAct("stand", emptyMap()) }
    }
}

@Composable
private fun AppleDock(
    round: PlayerGameRound?,
    busy: Boolean,
    canPlay: Boolean,
    onPlay: () -> Unit,
    onAct: (String, Map<String, String>) -> Unit,
) {
    val phase = applePhase(round)
    val cash = appleCashout(round)
    when {
        round?.allowedActions?.contains("cashout") == true && cash.isNotBlank() && cash != "0" && cash != "0.0" ->
            DockButton("Забрать $cash", enabled = !busy) { onAct("cashout", emptyMap()) }
        phase == "playing" || round?.state == "open" ->
            Text("Выберите яблоко", color = NextpariTheme.colors.accent, fontWeight = FontWeight.Bold)
        else -> DockButton(if (busy) "Запуск..." else "Играть", enabled = canPlay, onClick = onPlay)
    }
}

@Composable
private fun DockButton(text: String, enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val colors = NextpariTheme.colors
    Box(
        modifier
            .fillMaxWidth()
            .height(52.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (enabled) colors.accent else colors.accent.copy(alpha = 0.35f))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = colors.accentInk, fontWeight = FontWeight.Black)
    }
}
