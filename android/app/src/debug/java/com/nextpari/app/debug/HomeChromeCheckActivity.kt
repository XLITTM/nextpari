package com.nextpari.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nextpari.app.core.ui.icons.NextpariSportIconBadge
import com.nextpari.app.core.ui.neon.VipNeonChrome
import com.nextpari.app.core.ui.neon.vipNeonFrame
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.ui.theme.TabActiveGold
import com.nextpari.app.feature.home.HomePromoCatalog
import com.nextpari.app.feature.home.HomePromoLayout
import com.nextpari.app.feature.home.HomeSport
import com.nextpari.app.feature.home.MatchCardModel
import com.nextpari.app.feature.home.MatchCarousel
import com.nextpari.app.feature.sportsbook.CompetitionDirectory
import com.nextpari.app.feature.sportsbook.CountryGrouping
import com.nextpari.app.feature.sportsbook.FeaturedSports
import com.nextpari.app.feature.sportsbook.GameListEntry
import com.nextpari.app.feature.sportsbook.GameListLayout
import com.nextpari.app.feature.sportsbook.SportsListCatalog

/**
 * Debug-only home chrome host. Not a launcher. Does not place wagers or invent odds.
 */
class HomeChromeCheckActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val widthDp = intent.getIntExtra("widthDp", 390).coerceIn(360, 430)
        val dark = intent.getBooleanExtra("dark", true)
        enableEdgeToEdge()
        setContent {
            NextpariTheme(darkTheme = dark) {
                HomeChromeGallery(widthDp)
            }
        }
    }
}

@Composable
private fun HomeChromeGallery(widthDp: Int) {
    val colors = NextpariTheme.colors
    val sports = listOf(HomeSport("all", "Все")) + SportsListCatalog.supported.take(8)
    var selected by rememberSaveable { mutableStateOf("all") }
    val live = liveFixtures
    val popular = FeaturedSports.selectFeatured(
        live,
        live = true,
        featuredIds = listOf("oddspapi-v5:id1000005272723326"),
        nowMs = 0L,
    )
    val directory = CompetitionDirectory.organize(CountryGrouping.groupByCountry(live), emptySet())
    Column(
        Modifier
            .fillMaxSize()
            .background(colors.bg)
            .padding(top = 24.dp),
    ) {
        Text(
            "Home chrome  ${widthDp}.dp",
            color = colors.text,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
        LazyColumn(
            modifier = Modifier.width(widthDp.dp).fillMaxSize(),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            item(key = "sports") {
                LazyRow(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(sports, key = { it.id }) { sport ->
                        val active = sport.id == selected
                        Column(
                            modifier = Modifier
                                .widthIn(min = 70.dp)
                                .vipNeonFrame(selected = active, shape = RoundedCornerShape(16.dp))
                                .shadow(if (active) 6.dp else 2.dp, RoundedCornerShape(16.dp))
                                .clip(RoundedCornerShape(16.dp))
                                .background(colors.surface)
                                .clickable { selected = sport.id }
                                .padding(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            NextpariSportIconBadge(
                                sportId = sport.id,
                                contentDescription = sport.name,
                                active = active,
                                containerSize = 36.dp,
                                iconSize = 28.dp,
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                sport.name,
                                color = if (active) TabActiveGold else colors.text,
                                fontSize = 11.sp,
                                lineHeight = 14.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            }
            item(key = "promos") { CompactPromoRow() }
            item(key = "live-title") {
                Text(
                    "Популярное LIVE",
                    color = colors.text,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 4.dp),
                )
            }
            item(key = "live") {
                MatchCarousel(popular, onOpen = {})
            }
            item(key = "list-title") {
                Text(
                    "LIVE список",
                    color = colors.text,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
                )
            }
            items(GameListLayout.entries(popular).filterIsInstance<GameListEntry.Fixture>(), key = { it.match.id }) { row ->
                Text(
                    "${row.match.league}: ${row.match.team1} — ${row.match.team2}",
                    color = colors.text,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                )
            }
            item(key = "champs") {
                Text(
                    "Чемпионаты",
                    color = colors.text,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
                )
                directory.top.forEach { league ->
                    Text(
                        "Топ · ${league.name}  ${league.count}",
                        color = colors.text,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }
                directory.international.forEach { league ->
                    Text(
                        "Международные · ${league.name}  ${league.count}",
                        color = colors.text,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun CompactPromoRow() {
    val colors = NextpariTheme.colors
    val dark = colors.bg == NextpariColors.Dark.bg
    val shape = RoundedCornerShape(HomePromoLayout.Corner)
    val face = Brush.verticalGradient(listOf(colors.surfaceElevated, colors.surfaceSoft))
    val rim = Brush.verticalGradient(
        listOf(
            colors.accent.copy(alpha = if (dark) .44f else .24f).compositeOver(colors.border),
            colors.border,
        ),
    )
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val cardWidth = HomePromoLayout.cardWidth(maxWidth)
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(HomePromoLayout.Gap),
        ) {
            items(HomePromoCatalog.items, key = { it.route }) { promo ->
                Column(
                    modifier = Modifier.width(cardWidth)
                        .vipNeonFrame(shape = shape, chrome = VipNeonChrome.PressOnly)
                        .shadow(HomePromoLayout.Shadow, shape, clip = false, spotColor = if (dark) colors.accent else colors.text)
                        .clip(shape).background(face).border(1.dp, rim, shape)
                        .padding(2.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier.fillMaxWidth().aspectRatio(HomePromoLayout.ImageAspect)
                            .clip(RoundedCornerShape(10.dp)).background(colors.surfaceMuted),
                    ) {
                        Image(
                            painter = painterResource(promo.imageRes),
                            contentDescription = promo.title,
                            modifier = Modifier.matchParentSize(),
                            contentScale = ContentScale.Fit,
                        )
                    }
                    Text(
                        promo.title,
                        color = colors.text,
                        fontSize = 11.sp,
                        lineHeight = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        minLines = 2,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 3.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
}

private val liveFixtures = listOf(
    MatchCardModel(
        id = "oddspapi-v5:id1000046373835908",
        eventId = "oddspapi-v5:id1000046373835908",
        sport = "football",
        league = "AFC Champions League Elite",
        country = "International Clubs",
        team1 = "Al-Ittihad Club",
        team2 = "Pakhtakor",
        isLive = true,
        provider = "oddspapi-v5",
    ),
    MatchCardModel(
        id = "oddspapi-v5:id1000046373835914",
        eventId = "oddspapi-v5:id1000046373835914",
        sport = "football",
        league = "AFC Champions League Elite",
        country = "International Clubs",
        team1 = "Al Quwa Al Jawiya",
        team2 = "Al Gharafa SC",
        isLive = true,
        provider = "oddspapi-v5",
    ),
    MatchCardModel(
        id = "oddspapi-v5:id1000005272723326",
        eventId = "oddspapi-v5:id1000005272723326",
        sport = "football",
        league = "Super Lig",
        country = "Turkey",
        team1 = "Istanbul Basaksehir",
        team2 = "Corum FK",
        isLive = true,
        provider = "oddspapi-v5",
    ),
    MatchCardModel(
        id = "pl-1",
        eventId = "pl-1",
        sport = "football",
        league = "Premier League",
        country = "England",
        team1 = "Arsenal",
        team2 = "Chelsea",
        isLive = true,
        provider = "oddspapi-v5",
    ),
)
