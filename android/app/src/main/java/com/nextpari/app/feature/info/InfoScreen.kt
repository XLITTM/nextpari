package com.nextpari.app.feature.info

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme

object InfoCatalog {
    const val TITLE = "Инфо"
    const val ABOUT = "О нас"
    const val CONTACTS = "Контакты"
    const val RULES = "Правила"
    const val PAYMENTS = "Платежи"
    const val HOWTO = "Как сделать ставку?"
    const val SUPPORT = "Поддержка"
    const val TERMS = "Основные условия"
    const val PAYMENTS_TITLE = "Пополнение и вывод"

    val rootItems: List<String> = listOf(ABOUT, CONTACTS, RULES, PAYMENTS, HOWTO)

    val bettingSteps: List<String> = listOf(
        "Выберите событие в LIVE или Линии.",
        "Нажмите на коэффициент — исход попадёт в купон.",
        "Укажите сумму ставки.",
        "Проверьте тип пари (ординар / экспресс) и нажмите «Заключить».",
        "Статус купона смотрите в разделе «История».",
    )

    const val ABOUT_P1 = "Nextpari — платформа для ставок на спорт, киберспорт и игровых разделов."
    const val ABOUT_P2 = "Часть сервисов становится доступна после подключения соответствующих провайдеров."
    const val ABOUT_P3 = "Играйте ответственно. Сервис доступен только лицам старше 18 лет."
    const val CONTACTS_BODY = "Контакты поддержки будут опубликованы перед запуском сервиса."
    const val RULES_P1 = "Сервис доступен только лицам старше 18 лет. Играйте ответственно."
    const val RULES_P2 = "Полные юридические документы и правила будут опубликованы до запуска сервиса для клиентов."
    const val PAYMENTS_BODY =
        "Актуальные способы, лимиты и условия пополнения и вывода отображаются в платёжном интерфейсе."
}

@Composable
fun InfoScreen(onBack: () -> Unit) {
    var view by rememberSaveable { mutableStateOf("root") }
    BackHandler(enabled = view != "root") { view = "root" }

    when (view) {
        "about" -> SubPage(InfoCatalog.ABOUT, onBack = { view = "root" }) {
            InfoArticle {
                Text(InfoCatalog.ABOUT_P1, color = NextpariTheme.colors.textSecondary, fontSize = 14.sp, lineHeight = 20.sp)
                Text(InfoCatalog.ABOUT_P2, color = NextpariTheme.colors.textSecondary, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 12.dp))
                Text(InfoCatalog.ABOUT_P3, color = NextpariTheme.colors.textSecondary, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 12.dp))
            }
        }
        "contacts" -> SubPage(InfoCatalog.CONTACTS, onBack = { view = "root" }) {
            InfoArticle {
                Text(InfoCatalog.SUPPORT, color = NextpariTheme.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(InfoCatalog.CONTACTS_BODY, color = NextpariTheme.colors.textSecondary, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 12.dp))
            }
        }
        "rules" -> SubPage(InfoCatalog.RULES, onBack = { view = "root" }) {
            InfoArticle {
                Text(InfoCatalog.TERMS, color = NextpariTheme.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Text(InfoCatalog.RULES_P1, color = NextpariTheme.colors.textSecondary, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 12.dp))
                Text(InfoCatalog.RULES_P2, color = NextpariTheme.colors.textSecondary, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 12.dp))
            }
        }
        "payments" -> SubPage(InfoCatalog.PAYMENTS, onBack = { view = "root" }) {
            InfoArticle {
                Text(InfoCatalog.PAYMENTS_TITLE, color = NextpariTheme.colors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 6.dp))
                Text(InfoCatalog.PAYMENTS_BODY, color = NextpariTheme.colors.textSecondary, fontSize = 14.sp, lineHeight = 20.sp)
            }
        }
        "howto" -> SubPage(InfoCatalog.HOWTO, onBack = { view = "root" }) {
            InfoCatalog.bettingSteps.forEachIndexed { index, step ->
                Row(
                    Modifier
                        .padding(bottom = 12.dp)
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(articleBg())
                        .padding(16.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        Modifier.size(28.dp).clip(CircleShape).background(Color(0xFF16A34A)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${index + 1}", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                    Text(
                        step,
                        color = NextpariTheme.colors.textSecondary,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        modifier = Modifier.padding(start = 12.dp, top = 2.dp),
                    )
                }
            }
        }
        else -> InfoRoot(onBack = onBack, onOpen = { view = it })
    }
}

@Composable
private fun InfoRoot(onBack: () -> Unit, onOpen: (String) -> Unit) {
    val dark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    val screenBg = if (dark) Color(0xFF111827) else Color.White
    Column(Modifier.fillMaxSize().background(screenBg)) {
        PageHeader(InfoCatalog.TITLE, onBack)
        Column(Modifier.padding(horizontal = 16.dp, vertical = 24.dp)) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(articleBg()),
            ) {
                InfoRow(NextpariIcons.AccountBalance, Color(0xFFDCFCE7), Color(0xFF16A34A), Color(0x6614532D), Color(0xFF4ADE80), InfoCatalog.ABOUT) { onOpen("about") }
                InfoDivider()
                InfoRow(NextpariIcons.Headset, Color(0xFFE0F2FE), Color(0xFF0284C7), Color(0x660C4A6E), Color(0xFF38BDF8), InfoCatalog.CONTACTS) { onOpen("contacts") }
                InfoDivider()
                InfoRow(NextpariIcons.LegalBalance, Color(0xFFEDE9FE), Color(0xFF7C3AED), Color(0x664C1D95), Color(0xFFA78BFA), InfoCatalog.RULES) { onOpen("rules") }
                InfoDivider()
                InfoRow(NextpariIcons.CreditCard, Color(0xFFFEF3C7), Color(0xFFD97706), Color(0x66783150), Color(0xFFFBBF24), InfoCatalog.PAYMENTS) { onOpen("payments") }
                InfoDivider()
                InfoRow(NextpariIcons.Book, Color(0xFFD1FAE5), Color(0xFF059669), Color(0x66064E3B), Color(0xFF34D399), InfoCatalog.HOWTO) { onOpen("howto") }
            }
        }
    }
}

@Composable
private fun SubPage(title: String, onBack: () -> Unit, content: @Composable () -> Unit) {
    val dark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    val screenBg = if (dark) Color(0xFF111827) else Color.White
    Column(Modifier.fillMaxSize().background(screenBg).verticalScroll(rememberScrollState())) {
        PageHeader(title, onBack)
        Column(Modifier.padding(horizontal = 16.dp, vertical = 24.dp)) {
            content()
        }
    }
}

@Composable
private fun PageHeader(title: String, onBack: () -> Unit) {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val screenBg = if (dark) Color(0xFF111827) else Color.White
    Column(Modifier.fillMaxWidth().background(screenBg)) {
        Row(
            Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(40.dp).clickable(onClick = onBack), contentAlignment = Alignment.Center) {
                Icon(
                    NextpariIcons.ChevronLeft,
                    contentDescription = "Назад",
                    tint = if (dark) Color(0xFFE5E7EB) else Color(0xFF374151),
                    modifier = Modifier.size(24.dp),
                )
            }
            Text(
                title,
                color = colors.text,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f).padding(end = 40.dp),
            )
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(if (dark) Color(0xFF1F2937) else Color(0xFFF3F4F6)))
    }
}

@Composable
private fun InfoRow(
    icon: ImageVector,
    lightBg: Color,
    lightFg: Color,
    darkBg: Color,
    darkFg: Color,
    label: String,
    onClick: () -> Unit,
) {
    val dark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp).clip(RoundedCornerShape(16.dp)).background(if (dark) darkBg else lightBg),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = if (dark) darkFg else lightFg, modifier = Modifier.size(20.dp))
        }
        Text(
            label,
            color = NextpariTheme.colors.text,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f).padding(start = 12.dp),
        )
        Icon(NextpariIcons.ChevronRight, contentDescription = null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun InfoArticle(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(articleBg())
            .padding(16.dp),
    ) {
        content()
    }
}

@Composable
private fun InfoDivider() {
    val dark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    HorizontalDivider(color = if (dark) Color(0xFF374151) else Color(0xFFF3F4F6))
}

@Composable
private fun articleBg(): Color {
    val dark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
    return if (dark) Color(0xFF1E293B) else Color(0xFFF9FAFB)
}
