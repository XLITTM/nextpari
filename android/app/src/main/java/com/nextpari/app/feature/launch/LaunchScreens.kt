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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.R
import com.nextpari.app.core.ui.icons.NextpariWebIcons
import com.nextpari.app.core.ui.icons.ProfessionalPremiumIcons

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
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Image(
            painter = painterResource(R.drawable.np_splash_stadium_background),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
        Column(
            Modifier
                .fillMaxSize()
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.weight(0.48f))
            Image(
                painter = painterResource(R.drawable.np_splash_neon_logo_medallion),
                contentDescription = "NEXTPARI",
                modifier = Modifier.fillMaxWidth(0.8f),
                contentScale = ContentScale.Fit,
            )
            Spacer(Modifier.weight(0.38f))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .shadow(12.dp, RoundedCornerShape(99.dp), ambientColor = Color(0xFF03ED88), spotColor = Color(0xFF00D877))
                    .clip(RoundedCornerShape(99.dp))
                    .background(Color(0xFF10241C)),
            ) {
                Box(
                    Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(progress)
                        .background(Brush.horizontalGradient(listOf(Color(0xFF03ED88), Color(0xFFB8FFE4)))),
                )
            }
            Text(
                "Подключаем спорт, Live и игры...",
                color = BrandText,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 14.dp, bottom = 18.dp),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                SplashFeature(ProfessionalPremiumIcons.SportFootball, "Спорт", "Тысячи событий")
                SplashFeature(NextpariWebIcons.Dices, "Казино", "Топовые игры")
                SplashFeature(NextpariWebIcons.Gift, "Бонусы", "Ежедневно")
            }
            Spacer(Modifier.height(8.dp))
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
            .background(Color(0xFF05080A))
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = 20.dp, vertical = 8.dp),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            LaunchWordmark(height = 34.dp)
            Spacer(Modifier.weight(1f))
            Text(
                "Пропустить",
                color = BrandMuted,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onExistingAccount).padding(8.dp),
            )
        }
        Box(Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Image(
                painter = painterResource(R.drawable.np_welcome_luxury_tiger_scene),
                contentDescription = "Nextpari",
                modifier = Modifier.fillMaxWidth(),
                contentScale = ContentScale.FillWidth,
            )
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color(0xD905080A), Color(0xFF05080A)),
                        ),
                    )
                    .padding(top = 42.dp),
            ) {
                Text("БОЛЬШЕ", color = BrandText, fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
                Text("ЧЕМ ИГРА", color = Color(0xFF03ED88), fontSize = 34.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    "Спорт  •  Live  •  Казино  •  Бонусы",
                    color = BrandText,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Text(
                    "Всё в одном приложении",
                    color = BrandMuted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
        Spacer(Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 12.dp, bottom = 14.dp)) {
            Box(Modifier.size(8.dp).clip(RoundedCornerShape(99.dp)).background(Color(0xFF03ED88)))
            Box(Modifier.size(8.dp).clip(RoundedCornerShape(99.dp)).background(Color(0xFF1C4A62)))
            Box(Modifier.size(8.dp).clip(RoundedCornerShape(99.dp)).background(Color(0xFF1C4A62)))
        }
        NeonPrimaryButton("Начать", onContinue)
        Spacer(Modifier.height(10.dp))
        NeonSecondaryButton("У меня есть аккаунт", onExistingAccount)
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
internal fun LaunchWordmark(height: Dp = 36.dp) {
    Image(
        painter = painterResource(R.drawable.np_crowned_n_wordmark_from_reference),
        contentDescription = "NEXTPARI",
        modifier = Modifier.height(height),
        contentScale = ContentScale.Fit,
    )
}

@Composable
internal fun NeonPrimaryButton(text: String, onClick: () -> Unit, enabled: Boolean = true) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by androidx.compose.animation.core.animateFloatAsState(if (pressed && enabled) 0.98f else 1f, tween(130), label = "press")
    Box(
        Modifier
            .fillMaxWidth()
            .height(58.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .shadow(16.dp, RoundedCornerShape(16.dp), ambientColor = Color(0xFF03ED88), spotColor = Color(0xFF00A86A))
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.horizontalGradient(listOf(Color(0xFF03ED88), Color(0xFF00D877))))
            .border(1.dp, Color.White.copy(alpha = 0.28f), RoundedCornerShape(16.dp))
            .clickable(interaction, indication = null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = Color(0xFF02120E), fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
    }
}

@Composable
internal fun NeonSecondaryButton(text: String, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by androidx.compose.animation.core.animateFloatAsState(if (pressed) 0.98f else 1f, tween(130), label = "press-secondary")
    Box(
        Modifier
            .fillMaxWidth()
            .height(58.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF07110E))
            .border(1.dp, Color(0xFF1EEA86), RoundedCornerShape(16.dp))
            .clickable(interaction, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = BrandText, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
    }
}

@Composable
private fun SplashFeature(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    caption: String,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier
                .size(52.dp)
                .border(1.5.dp, Color.White.copy(alpha = 0.9f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = BrandText, modifier = Modifier.size(26.dp))
        }
        Text(title, color = BrandText, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
        Text(caption, color = BrandMuted, fontSize = 11.sp)
    }
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
