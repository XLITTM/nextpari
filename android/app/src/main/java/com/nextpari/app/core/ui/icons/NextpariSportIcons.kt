package com.nextpari.app.core.ui.icons

import androidx.compose.foundation.Image
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import com.nextpari.app.core.ui.icons.PremiumIconBuilder.stroke
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.feature.home.SportIconRes

val NextpariSportIconTint = Color(0xFF4ADE80)

object NextpariSportIcons {
    val requiredIds: List<String> = SportIconRes.knownIds

    fun canonicalId(sportId: String): String = when (sportId) {
        "futsal" -> "football"
        "beach-volleyball" -> "volleyball"
        else -> sportId
    }

    fun vector(sportId: String): ImageVector = when (sportId) {
        "all" -> ProfessionalPremiumIcons.SportAll
        "football" -> ProfessionalPremiumIcons.SportFootball
        "futsal" -> ProfessionalPremiumIcons.SportFutsal
        "tennis" -> ProfessionalPremiumIcons.SportTennis
        "basketball" -> ProfessionalPremiumIcons.SportBasketball
        "hockey" -> ProfessionalPremiumIcons.SportHockey
        "volleyball" -> ProfessionalPremiumIcons.SportVolleyball
        "beach-volleyball" -> ProfessionalPremiumIcons.SportBeachVolleyball
        "esports" -> ProfessionalPremiumIcons.SportEsports
        "table-tennis" -> ProfessionalPremiumIcons.SportTableTennis
        "badminton" -> ProfessionalPremiumIcons.SportBadminton
        "baseball" -> ProfessionalPremiumIcons.SportBaseball
        "cricket" -> ProfessionalPremiumIcons.SportCricket
        "polo" -> ProfessionalPremiumIcons.SportPolo
        "snooker" -> ProfessionalPremiumIcons.SportSnooker
        "pickleball" -> ProfessionalPremiumIcons.SportPickleball
        "ufc" -> ProfessionalPremiumIcons.SportUfc
        "fifa" -> ProfessionalPremiumIcons.SportFifa
        "mk" -> ProfessionalPremiumIcons.SportMk
        "polybet" -> ProfessionalPremiumIcons.SportPolybet
        "elections" -> ProfessionalPremiumIcons.SportElections
        "filter" -> ProfessionalPremiumIcons.SportFilter
        else -> ProfessionalPremiumIcons.SportDefault
    }

    fun premiumTint(sportId: String, isDark: Boolean): Color = when (sportId) {
        "all" -> Color(0xFF16D982)
        "football" -> if (isDark) Color.White else Color(0xFF0F172A)
        "tennis" -> Color(0xFFC7F000)
        "basketball" -> Color(0xFFFF7A1A)
        "hockey", "volleyball" -> if (isDark) Color.White else Color(0xFF0F172A)
        "esports" -> Color(0xFF22F39A)
        else -> NextpariSportIconTint
    }

    fun resolves(sportId: String, variant: NextpariIconVariant): Boolean = when (variant) {
        NextpariIconVariant.Legacy -> legacyDrawable(sportId) != 0
        NextpariIconVariant.Premium -> vector(sportId).name.isNotBlank()
    }

    fun legacyDrawable(sportId: String): Int = SportIconRes.drawable(sportId)

    fun isKnown(sportId: String): Boolean = canonicalId(sportId) in knownCanonical

    private val knownCanonical = setOf(
        "all", "football", "tennis", "basketball", "hockey", "volleyball", "esports",
        "table-tennis", "badminton", "baseball", "polo", "cricket", "snooker",
        "elections", "pickleball", "fifa", "mk", "polybet", "ufc", "filter",
    )
}

@Composable
fun NextpariSportIcon(
    sportId: String,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    tint: Color = Color.Unspecified,
) {
    when (NextpariIconConfig.defaultVariant) {
        NextpariIconVariant.Legacy -> Image(
            painter = painterResource(SportIconRes.drawable(sportId)),
            contentDescription = contentDescription,
            modifier = modifier,
        )
        NextpariIconVariant.Premium -> {
            val isDark = NextpariTheme.colors.bg == NextpariColors.Dark.bg
            Icon(
                imageVector = NextpariSportIcons.vector(sportId),
                contentDescription = contentDescription,
                modifier = modifier,
                tint = if (tint == Color.Unspecified) {
                    NextpariSportIcons.premiumTint(sportId, isDark)
                } else {
                    tint
                },
            )
        }
    }
}

/** Cursor-drawn sport geometry kept for rollback comparison. Not used by active UI. */
internal object NextpariPremiumSportIcons {
    private val cache = mutableMapOf<String, ImageVector>()

    fun vector(sportId: String): ImageVector {
        val id = NextpariSportIcons.canonicalId(sportId)
        return cache.getOrPut(id) { build(id) }
    }

    private fun build(id: String): ImageVector = when (id) {
        "all" -> allSports()
        "football" -> football()
        "tennis" -> tennis()
        "basketball" -> basketball()
        "hockey" -> hockey()
        "volleyball" -> volleyball()
        "esports" -> esports()
        "table-tennis" -> tableTennis()
        "badminton" -> badminton()
        "baseball" -> baseball()
        "polo" -> polo()
        "cricket" -> cricket()
        "snooker" -> snooker()
        "elections" -> elections()
        "pickleball" -> pickleball()
        "fifa" -> fifa()
        "mk" -> mk()
        "polybet" -> polybet()
        "ufc" -> ufc()
        "filter" -> sportFilter()
        else -> fallbackBall()
    }
}

private const val BallR = 7.25f
private const val Cx = 12f
private const val Cy = 12f

private fun football() = PremiumIconBuilder.make("premium.sport.football") {
    stroke(PremiumIconBuilder.SportStroke) {
        circle(Cx, Cy, BallR)
        // pentagon + seams — classic football, same optical box as other balls
        moveTo(12f, 9.15f)
        lineTo(14.05f, 10.6f)
        lineTo(13.25f, 13.05f)
        lineTo(10.75f, 13.05f)
        lineTo(9.95f, 10.6f)
        close()
        moveTo(12f, 9.15f)
        lineTo(12f, 4.75f)
        moveTo(14.05f, 10.6f)
        lineTo(18.7f, 8.7f)
        moveTo(13.25f, 13.05f)
        lineTo(16.55f, 17.85f)
        moveTo(10.75f, 13.05f)
        lineTo(7.45f, 17.85f)
        moveTo(9.95f, 10.6f)
        lineTo(5.3f, 8.7f)
    }
}

private fun tennis() = PremiumIconBuilder.make("premium.sport.tennis") {
    stroke(PremiumIconBuilder.SportStroke) {
        circle(Cx, Cy, BallR)
        moveTo(5.05f, 8.15f)
        curveTo(8.8f, 9.6f, 10.6f, 10.4f, 12f, 12f)
        curveTo(13.4f, 13.6f, 15.2f, 14.4f, 18.95f, 15.85f)
        moveTo(5.05f, 15.85f)
        curveTo(8.8f, 14.4f, 10.6f, 13.6f, 12f, 12f)
        curveTo(13.4f, 10.4f, 15.2f, 9.6f, 18.95f, 8.15f)
    }
}

private fun basketball() = PremiumIconBuilder.make("premium.sport.basketball") {
    stroke(PremiumIconBuilder.SportStroke) {
        circle(Cx, Cy, BallR)
        moveTo(12f, 4.75f)
        lineTo(12f, 19.25f)
        moveTo(4.75f, 12f)
        lineTo(19.25f, 12f)
        moveTo(6.15f, 6.15f)
        curveTo(9.4f, 8.4f, 10.4f, 10.2f, 10.4f, 12f)
        curveTo(10.4f, 13.8f, 9.4f, 15.6f, 6.15f, 17.85f)
        moveTo(17.85f, 6.15f)
        curveTo(14.6f, 8.4f, 13.6f, 10.2f, 13.6f, 12f)
        curveTo(13.6f, 13.8f, 14.6f, 15.6f, 17.85f, 17.85f)
    }
}

private fun volleyball() = PremiumIconBuilder.make("premium.sport.volleyball") {
    stroke(PremiumIconBuilder.SportStroke) {
        circle(Cx, Cy, BallR)
        moveTo(12f, 4.75f)
        curveTo(10.1f, 8.4f, 9.4f, 11.4f, 10.2f, 19.25f)
        moveTo(19.05f, 8.2f)
        curveTo(15.2f, 9.6f, 12.4f, 12.2f, 11.4f, 16.8f)
        curveTo(10.8f, 19f, 10.8f, 19.25f, 10.8f, 19.25f)
        moveTo(4.95f, 9.1f)
        curveTo(8.4f, 11.6f, 12.6f, 13.1f, 19.2f, 12.6f)
    }
}

private fun hockey() = PremiumIconBuilder.make("premium.sport.hockey") {
    stroke(PremiumIconBuilder.SportStroke) {
        // stick — padded so it doesn't optically overpower ball icons
        moveTo(7.2f, 5.8f)
        lineTo(15.4f, 14.4f)
        curveTo(16.2f, 15.2f, 17.4f, 15.4f, 18.4f, 14.6f)
        curveTo(19.4f, 13.8f, 19.6f, 12.4f, 18.6f, 11.5f)
        moveTo(7.2f, 5.8f)
        curveTo(6.4f, 6.4f, 6.3f, 7.6f, 7.1f, 8.3f)
        lineTo(8.4f, 7.1f)
        // puck
        moveTo(5.6f, 17.2f)
        curveTo(5.6f, 16.1f, 7.3f, 15.2f, 9.4f, 15.2f)
        curveTo(11.5f, 15.2f, 13.2f, 16.1f, 13.2f, 17.2f)
        curveTo(13.2f, 18.3f, 11.5f, 19.2f, 9.4f, 19.2f)
        curveTo(7.3f, 19.2f, 5.6f, 18.3f, 5.6f, 17.2f)
        close()
    }
}

private fun esports() = PremiumIconBuilder.make("premium.sport.esports") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(7.6f, 8.8f)
        curveTo(8.4f, 7.8f, 9.8f, 7.2f, 12f, 7.2f)
        curveTo(14.2f, 7.2f, 15.6f, 7.8f, 16.4f, 8.8f)
        curveTo(18.6f, 9.1f, 20.2f, 10.6f, 20.2f, 12.7f)
        curveTo(20.2f, 15f, 18.4f, 16.8f, 16.3f, 16.8f)
        curveTo(15.5f, 16.8f, 14.8f, 16.5f, 14.3f, 16f)
        lineTo(9.7f, 16f)
        curveTo(9.2f, 16.5f, 8.5f, 16.8f, 7.7f, 16.8f)
        curveTo(5.6f, 16.8f, 3.8f, 15f, 3.8f, 12.7f)
        curveTo(3.8f, 10.6f, 5.4f, 9.1f, 7.6f, 8.8f)
        close()
        moveTo(8.1f, 11.4f)
        lineTo(8.1f, 14.2f)
        moveTo(6.7f, 12.8f)
        lineTo(9.5f, 12.8f)
        moveTo(14.5f, 12.1f)
        circle(14.5f, 12.1f, 0.55f)
        moveTo(16.6f, 13.7f)
        circle(16.6f, 13.7f, 0.55f)
    }
}

private fun allSports() = PremiumIconBuilder.make("premium.sport.all") {
    stroke(PremiumIconBuilder.SportStroke) {
        roundedRect(4.8f, 4.8f, 11.1f, 11.1f, 1.6f)
        roundedRect(12.9f, 4.8f, 19.2f, 11.1f, 1.6f)
        roundedRect(4.8f, 12.9f, 11.1f, 19.2f, 1.6f)
        roundedRect(12.9f, 12.9f, 19.2f, 19.2f, 1.6f)
    }
}

private fun tableTennis() = PremiumIconBuilder.make("premium.sport.table-tennis") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(6.4f, 16.8f)
        lineTo(9.2f, 11.6f)
        curveTo(10.8f, 8.4f, 14.4f, 7.6f, 17f, 9.6f)
        curveTo(19.6f, 11.6f, 19.4f, 15.4f, 16.6f, 17.2f)
        curveTo(13.8f, 19f, 10.2f, 17.6f, 9.2f, 14.6f)
        close()
        moveTo(6.4f, 16.8f)
        lineTo(4.8f, 19.2f)
        moveTo(7.6f, 7.2f)
        circle(7.6f, 7.2f, 1.7f)
    }
}

private fun badminton() = PremiumIconBuilder.make("premium.sport.badminton") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(12f, 16.6f)
        lineTo(12f, 19.2f)
        moveTo(12f, 16.6f)
        curveTo(9.2f, 16.6f, 6.8f, 14.2f, 6.8f, 10.6f)
        curveTo(6.8f, 7.8f, 9.1f, 5.2f, 12f, 5.2f)
        curveTo(14.9f, 5.2f, 17.2f, 7.8f, 17.2f, 10.6f)
        curveTo(17.2f, 14.2f, 14.8f, 16.6f, 12f, 16.6f)
        close()
        moveTo(8.4f, 8.4f)
        lineTo(15.6f, 12.6f)
        moveTo(8.4f, 12.6f)
        lineTo(15.6f, 8.4f)
        moveTo(12f, 6.2f)
        lineTo(12f, 14.8f)
    }
}

private fun baseball() = PremiumIconBuilder.make("premium.sport.baseball") {
    stroke(PremiumIconBuilder.SportStroke) {
        circle(Cx, Cy, BallR)
        moveTo(7.1f, 6.4f)
        curveTo(9.6f, 8.6f, 9.6f, 15.4f, 7.1f, 17.6f)
        moveTo(16.9f, 6.4f)
        curveTo(14.4f, 8.6f, 14.4f, 15.4f, 16.9f, 17.6f)
        moveTo(7.8f, 8.6f)
        lineTo(8.8f, 8.1f)
        moveTo(7.6f, 10.6f)
        lineTo(8.7f, 10.2f)
        moveTo(7.6f, 13.4f)
        lineTo(8.7f, 13.8f)
        moveTo(7.8f, 15.4f)
        lineTo(8.8f, 15.9f)
        moveTo(16.2f, 8.6f)
        lineTo(15.2f, 8.1f)
        moveTo(16.4f, 10.6f)
        lineTo(15.3f, 10.2f)
        moveTo(16.4f, 13.4f)
        lineTo(15.3f, 13.8f)
        moveTo(16.2f, 15.4f)
        lineTo(15.2f, 15.9f)
    }
}

private fun polo() = PremiumIconBuilder.make("premium.sport.polo") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(6.4f, 18.4f)
        lineTo(8.2f, 8.2f)
        curveTo(8.6f, 6.6f, 10.2f, 5.6f, 11.8f, 6.2f)
        lineTo(14.6f, 7.4f)
        moveTo(8.2f, 11.2f)
        lineTo(16.8f, 14.6f)
        curveTo(18.2f, 15.2f, 18.4f, 17f, 17.2f, 18f)
        lineTo(16.2f, 18.6f)
        moveTo(16.6f, 7.2f)
        circle(16.6f, 7.2f, 1.7f)
    }
}

private fun cricket() = PremiumIconBuilder.make("premium.sport.cricket") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(7.4f, 18.6f)
        lineTo(9.2f, 7.4f)
        curveTo(9.5f, 5.8f, 11.2f, 5.2f, 12.4f, 6.2f)
        curveTo(13.4f, 7f, 13.4f, 8.6f, 12.4f, 9.6f)
        lineTo(8.8f, 13.6f)
        moveTo(16.4f, 8.4f)
        circle(16.4f, 8.4f, 2.1f)
        moveTo(15.2f, 7.4f)
        curveTo(16f, 8.1f, 16.8f, 8.6f, 17.6f, 9.2f)
    }
}

private fun snooker() = PremiumIconBuilder.make("premium.sport.snooker") {
    stroke(PremiumIconBuilder.SportStroke) {
        circle(12f, 9.2f, 2.15f)
        circle(9.6f, 13.4f, 2.15f)
        circle(14.4f, 13.4f, 2.15f)
        moveTo(6.2f, 18.4f)
        lineTo(18.4f, 7.2f)
    }
}

private fun elections() = PremiumIconBuilder.make("premium.sport.elections") {
    stroke(PremiumIconBuilder.SportStroke) {
        roundedRect(6.2f, 8.4f, 17.8f, 18.8f, 1.8f)
        moveTo(9.2f, 8.4f)
        lineTo(9.2f, 6.4f)
        lineTo(14.8f, 6.4f)
        lineTo(14.8f, 8.4f)
        moveTo(9.4f, 12.8f)
        lineTo(11.2f, 14.6f)
        lineTo(14.8f, 10.8f)
    }
}

private fun pickleball() = PremiumIconBuilder.make("premium.sport.pickleball") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(6.2f, 17.2f)
        lineTo(8.8f, 11.6f)
        curveTo(10.4f, 8.2f, 14.6f, 7.8f, 16.8f, 10.6f)
        curveTo(18.8f, 13.2f, 17.6f, 17.2f, 14.4f, 18.2f)
        curveTo(11.6f, 19.1f, 8.6f, 17.4f, 8f, 14.6f)
        close()
        circle(7.2f, 7.1f, 1.7f)
        moveTo(7.2f, 6.3f)
        lineTo(7.2f, 7.9f)
        moveTo(6.4f, 7.1f)
        lineTo(8f, 7.1f)
    }
}

private fun fifa() = PremiumIconBuilder.make("premium.sport.fifa") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(7.8f, 9.2f)
        curveTo(8.6f, 8.2f, 10f, 7.6f, 12f, 7.6f)
        curveTo(14f, 7.6f, 15.4f, 8.2f, 16.2f, 9.2f)
        curveTo(18.2f, 9.5f, 19.8f, 10.9f, 19.8f, 12.9f)
        curveTo(19.8f, 15f, 18.1f, 16.8f, 16.1f, 16.8f)
        curveTo(15.3f, 16.8f, 14.7f, 16.5f, 14.2f, 16f)
        lineTo(9.8f, 16f)
        curveTo(9.3f, 16.5f, 8.7f, 16.8f, 7.9f, 16.8f)
        curveTo(5.9f, 16.8f, 4.2f, 15f, 4.2f, 12.9f)
        curveTo(4.2f, 10.9f, 5.8f, 9.5f, 7.8f, 9.2f)
        close()
        circle(12f, 11.6f, 1.5f)
        moveTo(12f, 10.5f)
        lineTo(12.9f, 11.2f)
        lineTo(12.5f, 12.3f)
        lineTo(11.5f, 12.3f)
        lineTo(11.1f, 11.2f)
        close()
    }
}

private fun mk() = PremiumIconBuilder.make("premium.sport.mk") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(7.4f, 16.8f)
        curveTo(5.6f, 15.2f, 5.2f, 12.4f, 6.8f, 10.4f)
        curveTo(8.4f, 8.4f, 11.2f, 8.2f, 12.8f, 9.8f)
        moveTo(16.6f, 16.8f)
        curveTo(18.4f, 15.2f, 18.8f, 12.4f, 17.2f, 10.4f)
        curveTo(15.6f, 8.4f, 12.8f, 8.2f, 11.2f, 9.8f)
        circle(8.2f, 7.4f, 1.7f)
        circle(15.8f, 7.4f, 1.7f)
        moveTo(10.4f, 14.8f)
        lineTo(13.6f, 14.8f)
    }
}

private fun polybet() = PremiumIconBuilder.make("premium.sport.polybet") {
    stroke(PremiumIconBuilder.SportStroke) {
        roundedRect(5.2f, 8.6f, 16.4f, 16.8f, 1.6f)
        roundedRect(7.6f, 6.2f, 18.8f, 14.4f, 1.6f)
        moveTo(10.2f, 10.2f)
        lineTo(16.2f, 10.2f)
        moveTo(10.2f, 12.4f)
        lineTo(14.8f, 12.4f)
    }
}

private fun ufc() = PremiumIconBuilder.make("premium.sport.ufc") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(8.6f, 5.4f)
        lineTo(15.4f, 5.4f)
        lineTo(19.2f, 9.2f)
        lineTo(19.2f, 14.8f)
        lineTo(15.4f, 18.6f)
        lineTo(8.6f, 18.6f)
        lineTo(4.8f, 14.8f)
        lineTo(4.8f, 9.2f)
        close()
        moveTo(9.2f, 12f)
        lineTo(14.8f, 12f)
        moveTo(12f, 9.2f)
        lineTo(12f, 14.8f)
    }
}

private fun sportFilter() = PremiumIconBuilder.make("premium.sport.filter") {
    stroke(PremiumIconBuilder.SportStroke) {
        moveTo(5.4f, 6.4f)
        lineTo(18.6f, 6.4f)
        lineTo(13.8f, 12.4f)
        lineTo(13.8f, 18.2f)
        lineTo(10.2f, 16.6f)
        lineTo(10.2f, 12.4f)
        close()
    }
}

private fun fallbackBall() = PremiumIconBuilder.make("premium.sport.default") {
    stroke(PremiumIconBuilder.SportStroke) {
        circle(Cx, Cy, BallR)
        moveTo(12f, 8.2f)
        lineTo(14.1f, 10.1f)
        lineTo(13.3f, 12.8f)
        lineTo(10.7f, 12.8f)
        lineTo(9.9f, 10.1f)
        close()
    }
}
