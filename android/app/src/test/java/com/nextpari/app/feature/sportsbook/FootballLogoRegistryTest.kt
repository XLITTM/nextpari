package com.nextpari.app.feature.sportsbook

import com.nextpari.app.R
import com.nextpari.app.feature.home.MatchCardModel
import java.io.File
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FootballLogoRegistryTest {
    @Test
    fun importedDrawablesExistAndPreserveTheThreeWorkingBadges() {
        val dir = File("src/main/res/drawable-nodpi")
        assertTrue(File(dir, "badge_premier_league.png").length() > 500)
        assertTrue(File(dir, "badge_arsenal.png").length() > 500)
        assertTrue(File(dir, "badge_manchester_city.png").length() > 500)
        for (name in listOf(
            "logo_fb_fulham.png", "logo_fb_manchester_united.png", "logo_fb_real_madrid.png",
            "logo_fb_barcelona.png", "logo_fb_aston_villa.png", "logo_fb_sunderland.png",
            "logo_fb_deportivo.png", "logo_comp_la_liga.png", "logo_comp_serie_a.png",
            "logo_comp_bundesliga.png", "logo_comp_championship.png",
            "logo_comp_champions_league.png", "logo_comp_europa_league.png",
        )) {
            val bytes = File(dir, name).readBytes()
            assertEquals(name, 0x89.toByte(), bytes[0])
            assertTrue(name, bytes.size > 500)
        }
        assertTrue(dir.listFiles { file -> file.name.startsWith("logo_fb_") && file.extension == "png" }!!.size >= 600)
    }

    @Test
    fun canonicalIdsAndEmptyProviderFieldsResolveIndependently() {
        val allEmpty = """{"competitionId":null,"competition":null,"home":null,"away":null}"""
        assertNull(FootballBadges.fromCatalog(Json.parseToJsonElement(allEmpty)))
        val live = fixture("Premier League", "England", "Manchester City", "Fulham FC", live = true)
        val line = live.copy(isLive = false, id = "line")
        assertEquals(R.drawable.badge_premier_league, BundledFootballBadges.competition(live))
        assertEquals(R.drawable.badge_manchester_city, BundledFootballBadges.team(live, live.team1, home = true))
        assertEquals(R.drawable.logo_fb_fulham, BundledFootballBadges.team(live, live.team2, home = false))
        assertEquals(R.drawable.badge_manchester_city, BundledFootballBadges.team(line, "Манчестер Сити", home = true))
        assertEquals(R.drawable.logo_fb_fulham, BundledFootballBadges.team(line, "Фулхэм", home = false))
        val identified = live.copy(
            competitionId = "football:eng:premier-league",
            homeParticipantId = "football:eng:arsenal",
            awayParticipantId = "football:es:real-madrid",
        )
        assertEquals(R.drawable.badge_arsenal, BundledFootballBadges.team(identified, "Manchester City", home = true))
        assertEquals(R.drawable.logo_fb_real_madrid, BundledFootballBadges.team(identified, "Fulham FC", home = false))
        assertNull(BundledFootballBadges.team(identified.copy(homeParticipantId = "unverified"), "Arsenal", home = true))
        assertNull(BundledFootballBadges.competition(identified.copy(competitionId = "football:lb:premier-league")))
    }

    @Test
    fun countryAndLeagueContextSeparatesSharedNames() {
        val england = fixture("Premier League", "England", "Arsenal", "Sunderland AFC")
        val lebanon = england.copy(country = "Lebanon")
        val russia = fixture("Premier League", "Russia", "Zenit", "Dynamo Moscow")
        assertEquals(R.drawable.badge_premier_league, BundledFootballBadges.competition(england))
        assertEquals(R.drawable.badge_arsenal, BundledFootballBadges.team(england, "Arsenal", home = true))
        assertEquals(R.drawable.logo_fb_sunderland, BundledFootballBadges.team(england, "Sunderland AFC", home = false))
        assertNull(BundledFootballBadges.competition(lebanon))
        assertNull(BundledFootballBadges.competition(england.copy(league = "Premier League 2")))
        assertNull(BundledFootballBadges.competition(russia))
        assertEquals(R.drawable.logo_fb_zenit, BundledFootballBadges.team(russia, "Zenit", home = true))
        assertEquals(R.drawable.logo_fb_dynamo_moscow, BundledFootballBadges.team(russia, "Dynamo Moscow", home = false))
        assertNull(BundledFootballBadges.team(russia, "Dynamo", home = true))
        assertEquals(R.drawable.logo_fb_dynamo_makhachkala, BundledFootballBadges.team(russia, "Dynamo Makhachkala", home = true))
        val italy = fixture("Serie A", "Italy", "Inter Milan", "AC Milan")
        val brazil = fixture("Serie A", "Brazil", "Flamengo", "Palmeiras")
        assertEquals(R.drawable.logo_comp_serie_a, BundledFootballBadges.competition(italy))
        assertEquals(R.drawable.logo_comp_brazil_serie_a, BundledFootballBadges.competition(brazil))
        assertEquals(R.drawable.logo_fb_inter, BundledFootballBadges.team(italy, "Inter Milan", home = true))
        assertEquals(R.drawable.logo_fb_milan, BundledFootballBadges.team(italy, "Милан", home = false))
        assertNotEquals(BundledFootballBadges.team(italy, "Milan", home = false), BundledFootballBadges.team(italy, "Inter", home = true))
    }

    @Test
    fun aliasesRejectRestrictedAndSimilarClubNames() {
        val spain = fixture("LaLiga", "Spain", "Real Madrid", "Barcelona")
        assertEquals(R.drawable.logo_comp_la_liga, BundledFootballBadges.competition(spain))
        assertEquals(R.drawable.logo_fb_real_madrid, BundledFootballBadges.team(spain, "Реал Мадрид", home = true))
        assertEquals(R.drawable.logo_fb_barcelona, BundledFootballBadges.team(spain, "Barcelona", home = false))
        assertEquals(R.drawable.logo_fb_deportivo, BundledFootballBadges.team(spain, "Deportivo Alaves", home = true))
        assertEquals(R.drawable.logo_fb_deportivo_la_coruna, BundledFootballBadges.team(spain, "RC Deportivo de A Coruna", home = false))
        assertNull(BundledFootballBadges.team(spain, "Arsenal Women", home = true))
        assertNull(BundledFootballBadges.team(spain, "Arsenal U19", home = true))
        assertNull(BundledFootballBadges.team(spain, "Barcelona SC", home = true))
        assertNull(BundledFootballBadges.team(spain, "Barcelona Women", home = false))
        assertNull(BundledFootballBadges.team(fixture("NBA", "USA", "Arsenal", "Barcelona", sport = "basketball"), "Arsenal", home = true))
        val nations = fixture("UEFA Nations League", "Europe", "Türkiye", "Belgium")
        assertNull(BundledFootballBadges.competition(nations))
        assertEquals(R.drawable.logo_fb_turkey_national_team, BundledFootballBadges.team(nations, "Türkiye", home = true))
        assertEquals(R.drawable.logo_fb_belgium_national_team, BundledFootballBadges.team(nations, "Belgium", home = false))
        assertNull(BundledFootballBadges.team(spain, "Spain", home = true))
        assertEquals(R.drawable.logo_comp_bundesliga, BundledFootballBadges.competition(fixture("Bundesliga", "Germany")))
        assertEquals(R.drawable.logo_comp_championship, BundledFootballBadges.competition(fixture("Championship", "England")))
        assertNull(BundledFootballBadges.competition(fixture("Championship", "South Africa")))
        assertEquals(R.drawable.logo_comp_ligue_1, BundledFootballBadges.competition(fixture("Ligue 1", "France")))
        assertNull(BundledFootballBadges.competition(fixture("Ligue 1", "Tunisia")))
        assertEquals(R.drawable.logo_fb_roma, BundledFootballBadges.team(fixture("Serie A", "Italy"), "AS Roma", home = true))
        assertEquals(R.drawable.logo_fb_real_betis, BundledFootballBadges.team(spain, "Real Betis Seville", home = true))
        assertEquals(R.drawable.logo_fb_nice, BundledFootballBadges.team(fixture("Ligue 1", "France"), "OGC Nice", home = false))
        assertNull(BundledFootballBadges.team(fixture("Primera Division Women", "Spain"), "SD Eibar", home = true))
        assertNull(BundledFootballBadges.team(fixture("Primera Divisio", "Andorra"), "FC Rangers", home = true))
        assertEquals(R.drawable.logo_fb_rangers, BundledFootballBadges.team(fixture("Premiership", "Scotland"), "Rangers", home = false))
        assertNull(BundledFootballBadges.team(fixture("Primavera 2", "Italy"), "Modena", home = true))
        assertEquals(R.drawable.logo_fb_estoril, BundledFootballBadges.team(fixture("Taca de Portugal", "Portugal"), "Estoril Praia", home = true))
        assertEquals(R.drawable.logo_fb_ascoli, BundledFootballBadges.team(fixture("Serie B", "Italy"), "Ascoli Calcio 1898", home = true))
        assertEquals(R.drawable.logo_fb_vicenza, BundledFootballBadges.team(fixture("Serie B", "Italy"), "L.R. Vicenza", home = false))
        assertNull(BundledFootballBadges.team(fixture("Regionalliga North", "Germany"), "Hannover 96 II", home = true))
        assertEquals(R.drawable.logo_comp_champions_league, BundledFootballBadges.competition(fixture("UEFA Champions League", "England")))
        assertEquals(R.drawable.logo_comp_europa_league, BundledFootballBadges.competition(fixture("UEFA Europa League", "Spain")))
        assertEquals(R.drawable.logo_fb_aston_villa, BundledFootballBadges.team(fixture("Premier League", "England"), "Aston Villa", home = true))
        assertEquals(R.drawable.logo_fb_manchester_united, BundledFootballBadges.team(fixture("Premier League", "England"), "Манчестер Юнайтед", home = false))
    }

    @Test
    fun livePrematchListsAndMatchDetailsUseTheSameArtworkHook() {
        val card = File("src/main/java/com/nextpari/app/feature/home/MatchCard.kt").readText()
        val artwork = card.substringAfter("fun MatchTeamArtwork")
        assertTrue(artwork.indexOf("logoRes != null") < artwork.indexOf("FootballBadge("))
        assertTrue(card.contains("MatchTeamArtwork"))
        assertTrue(File("src/main/java/com/nextpari/app/feature/home/HomeScreen.kt").readText().contains("MatchCarousel"))
        assertTrue(File("src/main/java/com/nextpari/app/feature/sportsbook/GameListScreen.kt").readText().contains("NextpariMatchCard"))
        assertTrue(File("src/main/java/com/nextpari/app/feature/sportsbook/MatchTracker.kt").readText().contains("MatchTeamArtwork"))
        assertTrue(File("src/main/java/com/nextpari/app/feature/sportsbook/ChampionshipsScreen.kt").readText().contains("CompetitionArtwork"))
    }

    private fun fixture(
        league: String,
        country: String,
        home: String = "Home",
        away: String = "Away",
        live: Boolean = false,
        sport: String = "football",
    ) = MatchCardModel("1", sport = sport, league = league, country = country, team1 = home, team2 = away, isLive = live)
}
