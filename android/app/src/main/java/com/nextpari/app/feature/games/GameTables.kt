package com.nextpari.app.feature.games

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.R
import com.nextpari.app.core.player.formatServerBalance

private val Gold = Color(0xFFE4C56A)
private val Ink = Color(0xFF0F172A)

@Composable
fun GameStage(
    title: String,
    spec: GameSpec,
    state: GameUiState,
    onBack: () -> Unit,
    onStake: (String) -> Unit,
    onPlay: (Map<String, String>) -> Unit,
    onAct: (String, Map<String, String>) -> Unit,
) {
    val stake = parseStake(state.stakeText)
    val short = state.available != null && (state.available < spec.minStake || stake > state.available)
    val open = state.round?.state == "open"
    val canPlay = !state.busy && !state.blocked && !open && stake >= spec.minStake && !short
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        when (spec.code) {
            "apples" -> AppleScreen(state, spec, short, canPlay, onBack, onStake, onPlay, onAct)
            "pharaoh" -> PharaohScreen(state, short, canPlay, onBack, onStake, onPlay)
            "blackjack" -> BlackjackScreen(state, spec, short, canPlay, onBack, onStake, onPlay, onAct)
            "aviator" -> AviatorScreen(state, spec, short, canPlay, onBack, onStake, onPlay, onAct)
            "crystal" -> CrystalScreen(state, spec, short, canPlay, onBack, onStake, onPlay)
            else -> DiceScreen(state, spec, short, canPlay, onBack, onStake, onPlay)
        }
    }
}

@Composable
private fun AppleScreen(
    state: GameUiState,
    spec: GameSpec,
    short: Boolean,
    canPlay: Boolean,
    onBack: () -> Unit,
    onStake: (String) -> Unit,
    onPlay: (Map<String, String>) -> Unit,
    onAct: (String, Map<String, String>) -> Unit,
) {
    val round = state.round
    val rows = appleBoard(round).asReversed()
    val active = appleActiveLevel(round)
    val playing = applePhase(round) == "playing" || (round?.state == "open" && "pick" in round.allowedActions)
    val cash = appleCashout(round)
    val lost = applePhase(round) == "lost" || (round != null && round.state != "open" && round.payout <= 0.0 && applePhase(round) != "playing")
    Box(Modifier.fillMaxSize()) {
        Image(painterResource(R.drawable.game_apple_forest), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Column(Modifier.fillMaxSize()) {
            GameHeader(onBack, state.balanceLabel, Color(0xFFD9F99D))
            Column(
                Modifier.weight(1f).fillMaxWidth().padding(horizontal = 8.dp),
                verticalArrangement = Arrangement.Bottom,
            ) {
                rows.forEach { row ->
                    val current = row.level == active && playing
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 1.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            formatMultiplierLabel(row.multiplier),
                            color = if (current) Color.Black else Color(0xFF86EFAC),
                            fontWeight = FontWeight.Black,
                            fontSize = 11.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.width(48.dp).clip(CircleShape).background(
                                if (current) Brush.horizontalGradient(listOf(Color(0xFF4ADE80), Color(0xFF6EE7B7)))
                                else Brush.horizontalGradient(listOf(Color.Black.copy(0.4f), Color.Black.copy(0.4f))),
                            ).padding(vertical = 2.dp),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            row.cells.forEachIndexed { index, cell ->
                                AppleSprite(
                                    cell = cell,
                                    clover = current && !cell.revealed,
                                    inactive = !current && !cell.revealed,
                                    enabled = current && !cell.revealed && !state.busy,
                                    onClick = { onAct("pick", mapOf("col" to index.toString())) },
                                )
                            }
                        }
                    }
                }
            }
            Column(
                Modifier.fillMaxWidth().background(Color.Black.copy(0.6f)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (!playing) StakeField(state.stakeText, !state.busy && !state.blocked, onStake)
                if (!playing) StakeSteps(state, spec, onStake)
                Notice(state, short)
                when {
                    state.blocked -> Unit
                    round?.allowedActions?.contains("cashout") == true && cash.isNotBlank() && cash != "0" && cash != "0.0" ->
                        ActionButton("ЗАБРАТЬ $cash TMTM", Brush.verticalGradient(listOf(Color(0xFFFCD34D), Color(0xFFF97316))), Color(0xFF052E16), !state.busy) {
                            onAct("cashout", emptyMap())
                        }
                    lost && round != null -> {
                        Text("ПРОИГРЫШ", color = Color(0xFFFDA4AF), fontWeight = FontWeight.Black, fontSize = 18.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                        ActionButton("ИГРАТЬ", Brush.verticalGradient(listOf(Color(0xFFA3E635), Color(0xFF059669))), Color(0xFF052E16), canPlay) { onPlay(emptyMap()) }
                    }
                    playing -> ActionButton("ВЫБЕРИТЕ ЯБЛОКО", Brush.verticalGradient(listOf(Color.Black.copy(0.35f), Color.Black.copy(0.35f))), Color(0xFFD9F99D), false) {}
                    else -> ActionButton(if (state.busy) "ЗАПУСК..." else "ИГРАТЬ", Brush.verticalGradient(listOf(Color(0xFFA3E635), Color(0xFF059669))), Color(0xFF052E16), canPlay) {
                        onPlay(emptyMap())
                    }
                }
            }
        }
    }
}

@Composable
private fun AppleSprite(cell: AppleCellFace, clover: Boolean, inactive: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Box(Modifier.size(40.dp).clickable(enabled = enabled, onClick = onClick), contentAlignment = Alignment.Center) {
        when {
            cell.revealed && cell.kind == "bad" -> Text("🍎", fontSize = 22.sp)
            cell.revealed -> Text("🍏", fontSize = 22.sp)
            else -> Image(
                painterResource(if (clover) R.drawable.game_apple_clover else R.drawable.game_apple_red),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
                alpha = if (inactive) 0.4f else 1f,
            )
        }
    }
}

@Composable
private fun PharaohScreen(
    state: GameUiState,
    short: Boolean,
    canPlay: Boolean,
    onBack: () -> Unit,
    onStake: (String) -> Unit,
    onPlay: (Map<String, String>) -> Unit,
) {
    val round = state.round
    val tiles = pharaohTiles(round)
    val prize = pharaohPrize(round)
    val won = round != null && round.state != "open" && round.payout > 0.0
    val lost = round != null && round.state != "open" && round.payout <= 0.0
    Box(Modifier.fillMaxSize()) {
        Image(painterResource(R.drawable.game_pharaoh_bg), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Color.Black.copy(0.3f)))
        Column(Modifier.fillMaxSize().padding(bottom = 8.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                RoundIcon("‹", onBack)
                Spacer(Modifier.weight(1f))
                Text(state.balanceLabel, color = Color(0xFFFDE68A), fontWeight = FontWeight.Black, modifier = Modifier.clip(CircleShape).background(Color.Black.copy(0.55f)).padding(horizontal = 12.dp, vertical = 6.dp))
            }
            Text(
                when {
                    won -> "ВЫИГРЫШ: ${formatServerBalance(round.payout)} TMTM"
                    lost -> "ВЫ ПРОИГРАЛИ"
                    state.busy -> "ОТКРЫВАЕМ..."
                    else -> "СДЕЛАЙТЕ СТАВКУ"
                },
                color = if (lost) Color.White else Color(0xFF3B2A14),
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 12.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(
                    when {
                        won -> Brush.verticalGradient(listOf(Color(0xFF34D399), Color(0xFF84CC16)))
                        lost -> Brush.verticalGradient(listOf(Color(0xFFFB7185), Color(0xFFEF4444)))
                        else -> Brush.verticalGradient(listOf(Color(0xFFF0D080), Color(0xFFD4A017)))
                    },
                ).padding(vertical = 10.dp),
            )
            Column(Modifier.weight(1f).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                PharaohTile(if (prize.isBlank() || state.busy) null else prize, 92.dp)
                Spacer(Modifier.height(16.dp))
                Column(Modifier.padding(horizontal = 28.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFF1A1008).copy(0.7f)).padding(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    repeat(2) { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            repeat(3) { column ->
                                val id = tiles.getOrNull(row * 3 + column)
                                Box(Modifier.weight(1f)) {
                                    PharaohTile(if (state.busy) null else id, 0.dp, fill = true)
                                }
                            }
                        }
                    }
                }
            }
            Notice(state, short)
            if (!state.blocked && round?.state != "open") {
                BasicTextField(
                    value = state.stakeText,
                    onValueChange = { if (!state.busy) onStake(it) },
                    enabled = !state.busy,
                    singleLine = true,
                    textStyle = TextStyle(color = Color(0xFFFEF3C7), fontWeight = FontWeight.Black, fontSize = 14.sp, textAlign = TextAlign.Center),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    cursorBrush = SolidColor(Color(0xFFFEF3C7)),
                    modifier = Modifier.align(Alignment.CenterHorizontally).width(140.dp).height(36.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF1A1008).copy(0.9f)).border(2.dp, Color(0xFFD97706), RoundedCornerShape(12.dp)),
                    decorationBox = { inner -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { inner() } },
                )
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.game_pharaoh_coins), contentDescription = "Ставка", modifier = Modifier.size(64.dp), contentScale = ContentScale.Fit)
                Image(
                    painterResource(R.drawable.game_pharaoh_play),
                    contentDescription = "Играть",
                    modifier = Modifier.size(80.dp).clickable(enabled = canPlay) { onPlay(emptyMap()) },
                    contentScale = ContentScale.Fit,
                    alpha = if (canPlay) 1f else 0.45f,
                )
                Image(painterResource(R.drawable.game_pharaoh_auto), contentDescription = "Автоигра", modifier = Modifier.size(64.dp), contentScale = ContentScale.Fit, alpha = 0.55f)
            }
        }
    }
}

@Composable
private fun PharaohTile(id: String?, size: Dp, fill: Boolean = false) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        (if (fill) Modifier.fillMaxWidth().aspectRatio(1f) else Modifier.size(size)).clip(shape).border(2.dp, Color(0xFFF59E0B), shape),
        contentAlignment = Alignment.Center,
    ) {
        if (id == null) {
            Image(painterResource(R.drawable.game_pharaoh_back), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            Box(Modifier.fillMaxSize().background(Color(0xFF1A1008).copy(0.85f)).padding(6.dp)) {
                Image(painterResource(pharaohArt(id)), contentDescription = pharaohName(id), modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            }
        }
    }
}

@Composable
private fun BlackjackScreen(
    state: GameUiState,
    spec: GameSpec,
    short: Boolean,
    canPlay: Boolean,
    onBack: () -> Unit,
    onStake: (String) -> Unit,
    onPlay: (Map<String, String>) -> Unit,
    onAct: (String, Map<String, String>) -> Unit,
) {
    val round = state.round
    val open = round?.state == "open"
    val player = cardFaces(round?.publicResult?.get("playerHand"))
    val dealer = cardFaces(round?.publicResult?.get("dealerHand"))
    val felt = Brush.verticalGradient(listOf(Color(0xFF0D6A5C), Color(0xFF0A5248), Color(0xFF083F38), Color(0xFF062824), Color(0xFF02090A)))
    Column(Modifier.fillMaxSize().background(felt)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            RoundIcon("‹", onBack, Gold)
            Text("NEXTPARI · 21", color = Gold, fontWeight = FontWeight.Black, fontSize = 11.sp, letterSpacing = 1.5.sp, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Text(state.balanceLabel, color = Color.White, fontWeight = FontWeight.Black, fontSize = 11.sp, modifier = Modifier.clip(CircleShape).border(1.dp, Gold, CircleShape).padding(horizontal = 10.dp, vertical = 4.dp))
        }
        Text(
            when {
                open -> "ВЫБЕРИТЕ ДЕЙСТВИЕ"
                round != null && round.payout > 0.0 -> (round.publicResult["result"] ?: "ВЫИГРЫШ").uppercase()
                round != null -> "ПРОИГРЫШ"
                short -> "МИНИМУМ ${formatServerBalance(spec.minStake)} TMTM"
                else -> "СДЕЛАЙТЕ СТАВКУ"
            },
            color = Ink,
            fontWeight = FontWeight.Black,
            fontSize = 12.sp,
            letterSpacing = 1.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 12.dp).fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White).padding(vertical = 8.dp),
        )
        Column(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.SpaceEvenly) {
            HandRow("Дилер", dealer)
            HandRow("Вы", player)
        }
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Notice(state, short)
            if (open) {
                Text(state.stakeText, color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally).clip(RoundedCornerShape(12.dp)).background(Color(0xFF8B2CF5)).padding(horizontal = 24.dp, vertical = 8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    if ("stand" in round.allowedActions) ActionButton("СТОП", Brush.verticalGradient(listOf(Color(0xFFDC2626), Color(0xFF9F1239))), Color.White, !state.busy, Modifier.weight(1f)) { onAct("stand", emptyMap()) }
                    if ("hit" in round.allowedActions) ActionButton("ЕЩЕ", Brush.verticalGradient(listOf(Color(0xFF22D3EE), Color(0xFF0F766E))), Color.White, !state.busy, Modifier.weight(1f)) { onAct("hit", emptyMap()) }
                }
            } else if (!state.blocked) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(1, 5, 10, 25, 50, 100).forEach { chip ->
                        val colors = chipBrush(chip)
                        Box(
                            Modifier.weight(1f).aspectRatio(1f).clip(CircleShape).background(colors).border(1.5.dp, Gold, CircleShape).clickable(enabled = !state.busy) {
                                onStake(adjustedStake(state.stakeText, "add", spec.minStake, state.available, chip.toDouble()))
                            },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(chip.toString(), color = if (chip == 1) Ink else Color.White, fontWeight = FontWeight.Black, fontSize = 11.sp)
                        }
                    }
                }
                Text("${state.stakeText} TMTM", color = Color.White, fontWeight = FontWeight.Black, modifier = Modifier.align(Alignment.CenterHorizontally).clip(CircleShape).background(Brush.verticalGradient(listOf(Color(0xFF8A58C9), Color(0xFF5A2D96)))).border(1.dp, Gold, CircleShape).padding(horizontal = 18.dp, vertical = 6.dp))
                StakeSteps(state, spec, onStake, purple = true)
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    Box(
                        Modifier.size(72.dp).clip(CircleShape).background(Brush.radialGradient(listOf(Color(0xFFFFF3B0), Color(0xFFE4C56A), Color(0xFFC9A227)))).border(3.dp, Color(0xFFF6E7B0), CircleShape).clickable(enabled = canPlay) { onPlay(emptyMap()) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("PLAY", color = Color(0xFF2A1548), fontWeight = FontWeight.Black)
                    }
                }
            }
        }
    }
}

@Composable
private fun HandRow(label: String, cards: List<CardFace>) {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = Color(0xFFF5E6A8), fontWeight = FontWeight.Bold, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        if (cards.isEmpty()) {
            Text("—", color = Color.White.copy(0.5f))
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { cards.forEach { CasinoCard(it) } }
        }
    }
}

@Composable
private fun CasinoCard(card: CardFace) {
    val red = card.suit == "♥" || card.suit == "♦"
    val ink = if (red) Color(0xFFEF4444) else Ink
    Box(
        Modifier.size(width = 72.dp, height = 104.dp).clip(RoundedCornerShape(12.dp)).background(if (card.hidden) Color(0xFF0B3A34) else Color.White).border(1.dp, Gold.copy(0.7f), RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center,
    ) {
        if (card.hidden) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("N", color = Gold, fontWeight = FontWeight.Black, fontSize = 28.sp)
                Text("Nextpari", color = Gold, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            }
        } else {
            Column(Modifier.align(Alignment.TopStart).padding(6.dp)) {
                Text(card.rank, color = ink, fontWeight = FontWeight.Black, fontSize = 14.sp)
                Text(card.suit, color = ink, fontSize = 12.sp)
            }
            Text(card.suit, color = ink, fontSize = 32.sp)
            Column(Modifier.align(Alignment.BottomEnd).padding(6.dp), horizontalAlignment = Alignment.End) {
                Text(card.rank, color = ink, fontWeight = FontWeight.Black, fontSize = 14.sp)
                Text(card.suit, color = ink, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun AviatorScreen(
    state: GameUiState,
    spec: GameSpec,
    short: Boolean,
    canPlay: Boolean,
    onBack: () -> Unit,
    onStake: (String) -> Unit,
    onPlay: (Map<String, String>) -> Unit,
    onAct: (String, Map<String, String>) -> Unit,
) {
    val round = state.round
    val multiplier = aviatorMultiplier(round, state.sessionNote)
    val crash = aviatorCrash(round, state.sessionNote)
    val phase = aviatorPhase(round, state.sessionNote)
    val flying = phase == "flying" || phase == "fly"
    val sky = Brush.verticalGradient(listOf(Color(0xFF14021F), Color(0xFF3B0764), Color(0xFF9D174D), Color(0xFFFB923C)))
    Column(Modifier.fillMaxSize().background(Color(0xFF070B14))) {
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            RoundIcon("‹", onBack)
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("NEXTPARI ORIGINALS", color = Color(0xFFFDA4AF), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                Text("AVIATOR", color = Color.White, fontWeight = FontWeight.Black)
            }
            Text(state.balanceLabel, color = Color.White, fontWeight = FontWeight.Black, fontSize = 11.sp)
        }
        Text(
            if (crash.isNullOrBlank()) "История раундов появится после вылета" else crash,
            color = Color.White.copy(0.7f),
            fontSize = 11.sp,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
        Box(Modifier.weight(1f).fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(16.dp)).background(sky)) {
            androidx.compose.foundation.Canvas(Modifier.fillMaxSize().padding(16.dp)) {
                val start = androidx.compose.ui.geometry.Offset(size.width * 0.08f, size.height * 0.78f)
                val control = androidx.compose.ui.geometry.Offset(size.width * 0.45f, size.height * 0.7f)
                val end = androidx.compose.ui.geometry.Offset(size.width * 0.86f, size.height * 0.28f)
                val path = androidx.compose.ui.graphics.Path().apply {
                    moveTo(start.x, start.y)
                    quadraticTo(control.x, control.y, end.x, end.y)
                }
                drawPath(path, Color(0xFFE9D5FF), style = androidx.compose.ui.graphics.drawscope.Stroke(8f))
                val t = if (flying || crash != null) ((multiplier?.replace(',', '.')?.toFloatOrNull() ?: 1f) - 1f).coerceIn(0f, 8f) / 8f else 0.08f
                val u = 1f - t
                val point = androidx.compose.ui.geometry.Offset(
                    u * u * start.x + 2 * u * t * control.x + t * t * end.x,
                    u * u * start.y + 2 * u * t * control.y + t * t * end.y,
                )
                val jet = androidx.compose.ui.graphics.Path().apply {
                    moveTo(point.x + 34f, point.y)
                    lineTo(point.x - 6f, point.y - 8f)
                    lineTo(point.x - 16f, point.y - 18f)
                    lineTo(point.x - 4f, point.y)
                    lineTo(point.x - 16f, point.y + 16f)
                    lineTo(point.x - 6f, point.y + 8f)
                    close()
                }
                drawPath(jet, Color(0xFF111827))
                drawCircle(Color(0xFFD946EF), 5f, androidx.compose.ui.geometry.Offset(point.x + 24f, point.y))
            }
            Text(
                multiplier?.let { "${it}x" } ?: "Ожидание",
                color = Color(0xFFFEF3C7),
                fontWeight = FontWeight.Black,
                fontSize = 40.sp,
                modifier = Modifier.align(Alignment.Center),
            )
        }
        Column(Modifier.padding(12.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFF0F1724)).padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("СТАВКА", color = Color.White.copy(0.5f), fontSize = 10.sp, fontWeight = FontWeight.Bold)
            if (round?.state != "open") StakeField(state.stakeText, !state.busy && !state.blocked, onStake)
            StakeSteps(state, spec, onStake)
            Notice(state, short)
            if (round?.state == "open" && "cashout" in round.allowedActions) {
                ActionButton("ЗАБРАТЬ", Brush.verticalGradient(listOf(Color(0xFFFB923C), Color(0xFFEA580C))), Color.White, !state.busy) { onAct("cashout", emptyMap()) }
            } else if (!state.blocked) {
                ActionButton(if (state.busy) "ЗАПУСК..." else "СТАВКА (BET)", Brush.verticalGradient(listOf(Color(0xFF34D399), Color(0xFF059669))), Color(0xFF052E16), canPlay) { onPlay(emptyMap()) }
            }
        }
    }
}

@Composable
private fun CrystalScreen(
    state: GameUiState,
    spec: GameSpec,
    short: Boolean,
    canPlay: Boolean,
    onBack: () -> Unit,
    onStake: (String) -> Unit,
    onPlay: (Map<String, String>) -> Unit,
) {
    val round = state.round
    val gems = crystalGems(round).ifEmpty { List(49) { index -> CrystalGem(listOf("green", "cyan", "blue", "red", "purple", "orange", "coin")[index % 7]) } }
    val won = round != null && round.state != "open" && round.payout > 0.0
    val lost = round != null && round.state != "open" && round.payout <= 0.0
    Box(Modifier.fillMaxSize()) {
        Image(painterResource(R.drawable.game_crystal_bg), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Column(Modifier.fillMaxSize()) {
            GameHeader(onBack, state.balanceLabel, Color(0xFFFDE68A))
            Text("CRYSTAL", color = Color.White, fontWeight = FontWeight.Black, letterSpacing = 3.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(0.35f)).padding(6.dp)) {
                gems.take(49).chunked(7).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        row.forEach { gem ->
                            Box(Modifier.weight(1f).aspectRatio(1f).border(if (gem.exploding) 2.dp else 0.dp, Gold, RoundedCornerShape(6.dp)), contentAlignment = Alignment.Center) {
                                Image(painterResource(gemArt(gem.kind)), contentDescription = gem.kind, modifier = Modifier.fillMaxSize().padding(2.dp), contentScale = ContentScale.Fit)
                            }
                        }
                    }
                }
            }
            Box(Modifier.padding(horizontal = 12.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(0.5f)).padding(12.dp)) {
                Text(
                    when {
                        won -> "Победа!\n${formatServerBalance(round.payout)} TMTM"
                        lost -> "ПРОИГРЫШ"
                        else -> "Сделайте ставку"
                    },
                    color = if (lost) Color(0xFFFB7185) else Color(0xFF4ADE80),
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.weight(1f))
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (round?.state != "open") StakeSteps(state, spec, onStake, gold = true)
                if (round?.state != "open") StakeField(state.stakeText, !state.busy && !state.blocked, onStake)
                Notice(state, short)
                if (!state.blocked && round?.state != "open") {
                    ActionButton(if (state.busy) "ЗАПУСК..." else "СТАВКА", Brush.verticalGradient(listOf(Color(0xFFC88D3E), Color(0xFFB57D34))), Color.White, canPlay) { onPlay(emptyMap()) }
                }
            }
        }
    }
}

@Composable
private fun DiceScreen(
    state: GameUiState,
    spec: GameSpec,
    short: Boolean,
    canPlay: Boolean,
    onBack: () -> Unit,
    onStake: (String) -> Unit,
    onPlay: (Map<String, String>) -> Unit,
) {
    val round = state.round
    val player = diceFaces(round?.publicResult?.get("playerDice")).ifEmpty { listOf(5, 3) }
    val rival = diceFaces(round?.publicResult?.get("rivalDice")).ifEmpty { listOf(4, 2) }
    val settled = round != null && round.state != "open"
    Box(Modifier.fillMaxSize()) {
        Image(painterResource(R.drawable.game_dice_bg), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                RoundIcon("‹", onBack)
                Text(
                    when {
                        state.busy -> "Идёт бросок..."
                        settled && round.payout > 0.0 -> "Выигрыш"
                        settled -> "Проигрыш"
                        else -> "Для начала игры нажмите 'Play'"
                    },
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(0.55f)).padding(8.dp),
                )
                Text(state.balanceLabel, color = Color(0xFFBEF264), fontWeight = FontWeight.Black, fontSize = 11.sp, modifier = Modifier.clip(CircleShape).background(Color.Black.copy(0.55f)).padding(horizontal = 8.dp, vertical = 4.dp))
            }
            Row(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DieCube(player.getOrElse(0) { 1 }, red = true, rolling = state.busy)
                    DieCube(player.getOrElse(1) { 1 }, red = true, rolling = state.busy)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DieCube(rival.getOrElse(0) { 1 }, red = false, rolling = state.busy)
                    DieCube(rival.getOrElse(1) { 1 }, red = false, rolling = state.busy)
                }
            }
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Вы ${if (state.busy) "" else player.sum()}", color = Color(0xFFFFE4E6), fontWeight = FontWeight.Bold)
                    Text("Соперник ${if (state.busy) "" else rival.sum()}", color = Color(0xFFECFCCB), fontWeight = FontWeight.Bold)
                }
                StakeSteps(state, spec, onStake)
                if (round?.state != "open") StakeField(state.stakeText, !state.busy && !state.blocked, onStake)
                Notice(state, short)
                if (!state.blocked && round?.state != "open") {
                    ActionButton(if (state.busy) "Идёт бросок..." else "Play", Brush.verticalGradient(listOf(Color(0xFF22C55E), Color(0xFF16A34A))), Color.White, canPlay) { onPlay(emptyMap()) }
                }
            }
        }
    }
}

@Composable
private fun DieCube(value: Int, red: Boolean, rolling: Boolean) {
    val pips = when (value.coerceIn(1, 6)) {
        1 -> listOf(4)
        2 -> listOf(0, 8)
        3 -> listOf(0, 4, 8)
        4 -> listOf(0, 2, 6, 8)
        5 -> listOf(0, 2, 4, 6, 8)
        else -> listOf(0, 2, 3, 5, 6, 8)
    }
    Column(
        Modifier.size(56.dp).clip(RoundedCornerShape(12.dp)).background(if (red) Brush.linearGradient(listOf(Color(0xFFF43F5E), Color(0xFF991B1B))) else Brush.linearGradient(listOf(Color(0xFF3F3F46), Color.Black))).padding(7.dp),
        verticalArrangement = Arrangement.SpaceEvenly,
    ) {
        repeat(3) { row ->
            Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                repeat(3) { column ->
                    val on = !rolling && (row * 3 + column) in pips
                    Box(Modifier.size(8.dp).clip(CircleShape).background(if (on) Color.White else Color.Transparent))
                }
            }
        }
    }
}

@Composable
private fun GameHeader(onBack: () -> Unit, balance: String, accent: Color) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        RoundIcon("‹", onBack)
        Spacer(Modifier.weight(1f))
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.clip(CircleShape).background(Color.Black.copy(0.4f)).padding(horizontal = 10.dp, vertical = 4.dp)) {
            Text("БАЛАНС", color = accent.copy(0.7f), fontSize = 8.sp, fontWeight = FontWeight.Bold)
            Text(balance, color = Color.White, fontWeight = FontWeight.Black, fontSize = 12.sp)
        }
    }
}

@Composable
private fun RoundIcon(glyph: String, onClick: () -> Unit, tint: Color = Color.White) {
    Box(Modifier.size(36.dp).clip(CircleShape).background(Color.Black.copy(0.4f)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Text(glyph, color = tint, fontSize = 22.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun StakeField(value: String, enabled: Boolean, onStake: (String) -> Unit, modifier: Modifier = Modifier) {
    BasicTextField(
        value = value,
        onValueChange = { if (enabled) onStake(it) },
        enabled = enabled,
        singleLine = true,
        textStyle = TextStyle(color = Color.White, fontWeight = FontWeight.Black, fontSize = 16.sp, textAlign = TextAlign.Center),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        cursorBrush = SolidColor(Color.White),
        modifier = modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(0.45f)),
        decorationBox = { inner -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { inner() } },
    )
}

@Composable
private fun StakeSteps(state: GameUiState, spec: GameSpec, onStake: (String) -> Unit, purple: Boolean = false, gold: Boolean = false) {
    val enabled = !state.busy && !state.blocked && state.round?.state != "open"
    val brush = when {
        gold -> Brush.verticalGradient(listOf(Color(0xFFC88D3E), Color(0xFFB57D34)))
        purple -> Brush.verticalGradient(listOf(Color(0xFF7B4DB8), Color(0xFF34185C)))
        else -> Brush.verticalGradient(listOf(Color.Black.copy(0.4f), Color.Black.copy(0.4f)))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        listOf("MIN" to "min", "X2" to "x2", "X/2" to "half", "MAX" to "max").forEach { (label, op) ->
            Box(
                Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(12.dp)).background(brush).border(1.dp, if (purple) Gold else Color.White.copy(0.12f), RoundedCornerShape(12.dp)).clickable(enabled = enabled && (op != "max" || state.available != null)) {
                    onStake(adjustedStake(state.stakeText, op, spec.minStake, state.available))
                },
                contentAlignment = Alignment.Center,
            ) {
                Text(label, color = Color.White, fontWeight = FontWeight.Black, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun ActionButton(text: String, brush: Brush, ink: Color, enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(16.dp)).background(brush).clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = ink.copy(alpha = if (enabled) 1f else 0.55f), fontWeight = FontWeight.Black, fontSize = 13.sp)
    }
}

@Composable
private fun Notice(state: GameUiState, short: Boolean) {
    val message = when {
        state.blocked -> state.error ?: "Игра временно недоступна"
        !state.error.isNullOrBlank() -> state.error
        short -> "Недостаточно средств"
        else -> null
    }
    if (message != null) {
        Text(message, color = Color(0xFFFDA4AF), fontWeight = FontWeight.Bold)
    }
}

private fun chipBrush(value: Int): Brush = when (value) {
    1 -> Brush.verticalGradient(listOf(Color(0xFFF8FAFC), Color.White))
    5 -> Brush.verticalGradient(listOf(Color(0xFFF43F5E), Color(0xFFB91C1C)))
    10 -> Brush.verticalGradient(listOf(Color(0xFF0EA5E9), Color(0xFF1D4ED8)))
    25 -> Brush.verticalGradient(listOf(Color(0xFF10B981), Color(0xFF166534)))
    50 -> Brush.verticalGradient(listOf(Color(0xFFFB923C), Color(0xFFB45309)))
    else -> Brush.verticalGradient(listOf(Color(0xFF27272A), Color.Black))
}
