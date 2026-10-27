package com.nextpari.app.feature.launch

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.R

private val BrandBg = Color(0xFF031522)
private val BrandMint = Color(0xFF22F39A)
private val BrandText = Color(0xFFF8FAFC)
private val BrandMuted = Color(0xFF91AEC7)

@Composable
fun SplashBrandScreen() {
    val progress by rememberInfiniteTransition(label = "splash-progress").animateFloat(
        initialValue = 0.18f,
        targetValue = 0.92f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Reverse),
        label = "splash-bar",
    )
    Box(
        Modifier
            .fillMaxSize()
            .background(BrandBg)
            .windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(1f))
            EmeraldRing(size = 228.dp, stroke = 7.dp) {
                Image(
                    painter = painterResource(R.drawable.logo),
                    contentDescription = "BK NEXT PARI",
                    modifier = Modifier.size(156.dp),
                    contentScale = ContentScale.Fit,
                )
            }
            Spacer(Modifier.height(28.dp))
            Text(
                "NEXTPARI",
                color = BrandText,
                fontSize = 28.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.4.sp,
            )
            Text(
                "В центре игры",
                color = BrandMuted,
                fontSize = 16.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
            Spacer(Modifier.height(36.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .clip(RoundedCornerShape(99.dp))
                    .background(Color(0xFF143246)),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(progress)
                        .height(3.dp)
                        .background(BrandMint),
                )
            }
            Text(
                "Подключаем спорт, Live и игры...",
                color = BrandText,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 18.dp),
            )
            Text(
                "Загрузка данных · начальный экран",
                color = BrandMuted,
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 6.dp),
            )
            Spacer(Modifier.weight(1.15f))
            Text("18+", color = BrandMuted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
fun SessionRestoreScreen(
    message: String? = null,
    onRetry: (() -> Unit)? = null,
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(BrandBg)
            .windowInsetsPadding(WindowInsets.safeDrawing),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 28.dp)) {
            EmeraldRing(size = 92.dp, stroke = 4.dp) {}
            Text(
                if (message == null) "Загрузка…" else "Не удалось восстановить сессию",
                color = BrandText,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 22.dp),
            )
            if (message != null) {
                Text(
                    message,
                    color = BrandMuted,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            if (onRetry != null) {
                Text(
                    "Повторить",
                    color = Color(0xFF04261A),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 16.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .padding(top = 22.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(BrandMint)
                        .clickable(onClick = onRetry)
                        .padding(vertical = 16.dp),
                )
            }
        }
    }
}

@Composable
fun WelcomeScreen(
    onContinue: () -> Unit,
    onExistingAccount: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(BrandBg)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp, vertical = 12.dp),
    ) {
        Text(
            "Добро пожаловать",
            color = BrandText,
            fontSize = 32.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Text(
            "Всё любимое — в одном приложении",
            color = BrandMuted,
            fontSize = 15.sp,
            modifier = Modifier.padding(top = 6.dp, bottom = 18.dp),
        )
        Box(
            Modifier
                .fillMaxWidth()
                .height(340.dp)
                .clip(RoundedCornerShape(28.dp))
                .background(Color(0xFF08283A)),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.welcome_sports_tiger),
                contentDescription = "Nextpari",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
            )
        }
        Text(
            "Твой Nextpari",
            color = BrandText,
            fontSize = 26.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.padding(top = 18.dp),
        )
        Text(
            "Следи за матчами, находи любимые игры и управляй кошельком в одном месте.",
            color = BrandMuted,
            fontSize = 15.sp,
            lineHeight = 21.sp,
            modifier = Modifier.padding(top = 8.dp, bottom = 18.dp),
        )
        BrandButton("Начать", onContinue)
        Spacer(Modifier.height(10.dp))
        Text(
            "У меня уже есть аккаунт",
            color = BrandText,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .border(1.dp, Color(0xFF1C4A62), RoundedCornerShape(16.dp))
                .clickable(onClick = onExistingAccount)
                .padding(vertical = 16.dp),
        )
        Text(
            "18+  ·  Ответственная игра",
            color = BrandMuted,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp, bottom = 8.dp),
        )
    }
}

@Composable
private fun BrandButton(text: String, onClick: () -> Unit) {
    Text(
        text,
        color = Color(0xFF04261A),
        fontWeight = FontWeight.ExtraBold,
        fontSize = 16.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(BrandMint)
            .clickable(onClick = onClick)
            .padding(vertical = 16.dp),
    )
}

@Composable
private fun EmeraldRing(
    size: Dp,
    stroke: Dp,
    content: @Composable () -> Unit,
) {
    val turn by rememberInfiniteTransition(label = "emerald-ring").animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1200, easing = LinearEasing)),
        label = "ring-turn",
    )
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val strokePx = stroke.toPx()
            val inset = strokePx / 2f
            val arc = Size(this.size.width - strokePx, this.size.height - strokePx)
            drawCircle(
                color = BrandMint.copy(alpha = 0.16f),
                radius = this.size.minDimension / 2f,
            )
            rotate(turn) {
                drawArc(
                    brush = Brush.sweepGradient(
                        listOf(Color.Transparent, BrandMint.copy(alpha = 0.15f), BrandMint, Color.White),
                    ),
                    startAngle = 0f,
                    sweepAngle = 270f,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = arc,
                    style = Stroke(width = strokePx, cap = StrokeCap.Round),
                )
            }
        }
        content()
    }
}
