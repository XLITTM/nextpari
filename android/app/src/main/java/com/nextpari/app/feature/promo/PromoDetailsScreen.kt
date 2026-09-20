package com.nextpari.app.feature.promo

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.icons.NextpariIcons

@Composable
fun PromoDetailsScreen(onBack: () -> Unit) {
    PromoArticleHost(PromoCatalog.details, onBack)
}

@Composable
internal fun PromoArticleHost(article: PromoArticle, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Color(0xFF0A1128))) {
        Row(
            Modifier.fillMaxWidth().height(56.dp).background(Color(0xFF1E293B)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(40.dp).clickable(onClick = onBack), contentAlignment = Alignment.Center) {
                Icon(NextpariIcons.Back, contentDescription = "Назад", tint = NextpariIconPalette.Action.Chevron, modifier = Modifier.size(24.dp))
            }
            Text("Акции", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Spacer(Modifier.width(40.dp))
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 96.dp)) {
            Image(
                painterResource(article.heroRes),
                contentDescription = null,
                modifier = Modifier.fillMaxWidth().height(176.dp),
                contentScale = ContentScale.Crop,
            )
            Column(Modifier.padding(16.dp)) {
                Text(article.headline, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Text(article.lead, color = Color(0xFFD1D5DB), fontSize = 14.sp, modifier = Modifier.padding(top = 12.dp), lineHeight = 20.sp)
                Text(
                    article.warning,
                    color = Color(0xFFFDE68A),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .padding(top = 16.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.05f))
                        .padding(12.dp),
                )
                article.sections.forEach { section ->
                    Text(section.title, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 24.dp))
                    if (section.prizeRows.isNotEmpty()) {
                        section.prizeRows.forEach { (place, amount) ->
                            Row(
                                Modifier
                                    .padding(top = 8.dp)
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(Color(0xFF1E293B))
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(place, color = Color.White, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Text(amount, color = Color(0xFF4ADE80), fontWeight = FontWeight.Black)
                            }
                        }
                        if (article.route.contains("unbeatable")) {
                            Text("Розыгрыш проводится по окончании трехмесячного цикла.", color = Color(0xFFD1D5DB), fontSize = 14.sp, modifier = Modifier.padding(top = 16.dp))
                        }
                    } else {
                        section.bullets.forEachIndexed { index, bullet ->
                            Text(
                                if (section.ordered) "${index + 1}. $bullet" else "• $bullet",
                                color = Color(0xFFD1D5DB),
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
