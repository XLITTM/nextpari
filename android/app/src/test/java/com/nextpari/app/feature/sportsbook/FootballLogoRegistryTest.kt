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
        assertEquals(R.drawable.badge_arsenal, BundledFootballBadges.team(identified.copy(homeParticipantId = "unverified"), "Arsenal", home = true))
        assertEquals(R.drawable.badge_premier_league, BundledFootballBadges.competition(identified.copy(competitionId = "football:lb:premier-league")))
        assertNull(BundledFootballBadges.competition(identified.copy(competitionId = "football:lb:premier-league", league = "Lebanese Premier League", country = "Lebanon")))
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
    fun ownerScreenshotNamesResolveOnlyVerifiedAssets() {
        val premier = fixture("Premier League", "England", "Brighton & Hove Albion", "Liverpool FC")
        assertEquals(R.drawable.logo_fb_brighton, BundledFootballBadges.team(premier, "Brighton & Hove Albion", home = true))
        assertEquals(R.drawable.logo_fb_liverpool, BundledFootballBadges.team(premier, "Liverpool FC", home = false))
        assertEquals(R.drawable.logo_fb_manchester_united, BundledFootballBadges.team(premier, "Manchester United", home = true))
        val spain = fixture("LaLiga", "Spain", "Real Sociedad San Sebastian", "CA Osasuna")
        assertEquals(R.drawable.logo_fb_real_sociedad, BundledFootballBadges.team(spain, "Real Sociedad San Sebastian", home = true))
        assertEquals(R.drawable.logo_fb_osasuna, BundledFootballBadges.team(spain, "CA Osasuna", home = false))
        assertEquals(R.drawable.logo_fb_barcelona, BundledFootballBadges.team(spain, "FC Barcelona", home = true))
        assertEquals(R.drawable.logo_fb_villarreal, BundledFootballBadges.team(spain, "Villarreal CF", home = false))
        assertEquals(R.drawable.logo_fb_atletico_madrid, BundledFootballBadges.team(spain, "Atletico Madrid", home = true))
        assertEquals(R.drawable.logo_fb_getafe, BundledFootballBadges.team(spain, "Getafe CF", home = false))
        val segunda = fixture("La Liga 2", "Spain", "Racing Santander", "Malaga CF")
        assertEquals(R.drawable.logo_fb_racing, BundledFootballBadges.team(segunda, "Racing Santander", home = true))
        assertEquals(R.drawable.logo_fb_malaga, BundledFootballBadges.team(segunda, "Malaga CF", home = false))
        val championship = fixture("Championship", "England", "Hull City", "Sunderland")
        assertEquals(R.drawable.logo_fb_hull_city, BundledFootballBadges.team(championship, "Hull City", home = true))
        assertNull(BundledFootballBadges.team(spain, "Brighton Women", home = true))
        assertNull(BundledFootballBadges.team(premier, "Osasuna U19", home = true))
        assertNull(BundledFootballBadges.team(fixture("Primera Division", "Argentina"), "Racing Santander", home = true))
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

    @Test
    fun unmappedParticipantIdsFallBackToVerifiedNamesWithoutGuessing() {
        val premier = fixture("Premier League", "England", "Arsenal", "Chelsea").copy(homeParticipantId = "oddspapi-v5:unknown-arsenal")
        assertEquals(R.drawable.badge_arsenal, BundledFootballBadges.team(premier, "Arsenal", home = true))
        assertTrue(FootballLogoRegistry.teamHit(premier, "Arsenal", home = true).source in setOf("name-unique", "competition-membership"))
        val identified = premier.copy(homeParticipantId = "football:eng:arsenal", team1 = "Manchester City")
        assertEquals(R.drawable.badge_arsenal, BundledFootballBadges.team(identified, "Manchester City", home = true))
        assertEquals("canonical-id", FootballLogoRegistry.teamHit(identified, "Manchester City", home = true).source)
        assertNull(BundledFootballBadges.team(premier.copy(homeParticipantId = "football:eng:arsenal-women"), "Arsenal", home = true))
        assertNull(BundledFootballBadges.team(premier.copy(team1 = "Arsenal Women"), "Arsenal Women", home = true))
        assertNull(BundledFootballBadges.team(premier.copy(team1 = "Arsenal U21"), "Arsenal U21", home = true))
        val afc = fixture("AFC Champions League Elite", "International Clubs", "Al-Ittihad Club", "Pakhtakor")
            .copy(homeParticipantId = "oddspapi-v5:missing-ittihad", awayParticipantId = "oddspapi-v5:missing-pakhtakor")
        assertEquals(R.drawable.logo_fb_al_ittihad, BundledFootballBadges.team(afc, "Al-Ittihad Club", home = true))
        assertNull(BundledFootballBadges.team(afc, "Pakhtakor", home = false))
        assertNull(BundledFootballBadges.competition(afc))
        val turkey = fixture("Super Lig", "Turkey", "Istanbul Basaksehir", "Corum FK")
        assertEquals(R.drawable.logo_fb_basaksehir, BundledFootballBadges.team(turkey, "Istanbul Basaksehir", home = true))
        assertEquals(R.drawable.logo_fb_corum, BundledFootballBadges.team(turkey, "Corum FK", home = false))
    }

    @Test
    fun bundledLogoInventoryStaysMappedAndCoverageAuditCoversTopLeagues() {
        val nodpi = File("src/main/res/drawable-nodpi")
        val clubs = nodpi.listFiles { file -> file.name.startsWith("logo_fb_") && file.extension == "png" }!!
        val national = clubs.filter { it.name.contains("national_team") }
        val competitions = nodpi.listFiles { file ->
            file.extension == "png" && (file.name.startsWith("logo_comp_") || file.name.startsWith("badge_"))
        }!!
        assertTrue(clubs.size >= 600)
        assertTrue(national.size >= 20)
        assertTrue(competitions.size >= 14)
        val registry = File("src/main/java/com/nextpari/app/feature/sportsbook/FootballLogoRegistry.kt").readText()
        val teamEntries = Regex("\"[a-z0-9-]+\" to R\\.drawable\\.logo_fb_").findAll(registry).count()
        val canonicalEntries = Regex("\"football:[a-z0-9-]+:[a-z0-9-]+\" to R\\.drawable\\.").findAll(registry).count()
        val aliasEntries = Regex("\"[^\"]+\" to \"[a-z0-9-]+\"").findAll(
            registry.substringAfter("private val aliases = mapOf(").substringBefore("private val nationalAliases"),
        ).count()
        assertTrue(teamEntries >= 600)
        assertTrue(canonicalEntries >= 600)
        assertTrue(aliasEntries >= 80)
        val catalog = listOf(
            fixture("Premier League", "England", "Arsenal", "Chelsea"),
            fixture("Championship", "England", "Hull City", "Sunderland"),
            fixture("LaLiga", "Spain", "Real Madrid", "Barcelona"),
            fixture("Bundesliga", "Germany", "Bayern Munich", "Bayer Leverkusen"),
            fixture("Serie A", "Italy", "Inter Milan", "AC Milan"),
            fixture("Ligue 1", "France", "Paris Saint Germain", "OGC Nice"),
            fixture("UEFA Champions League", "Europe", "Real Madrid", "Manchester City"),
            fixture("UEFA Europa League", "Europe", "Roma", "Ajax"),
            fixture("UEFA Conference League", "Europe", "Fiorentina", "Chelsea"),
            fixture("UEFA Nations League", "Europe", "Türkiye", "Belgium"),
            fixture("AFC Champions League Elite", "International Clubs", "Al-Ittihad Club", "Al-Hilal"),
            fixture("Saudi Pro League", "Saudi Arabia", "Al-Nassr Club", "Al-Ittihad Club"),
            fixture("Super Lig", "Turkey", "Istanbul Basaksehir", "Galatasaray"),
            fixture("MLS", "USA", "Inter Miami", "Atlanta United"),
        )
        val report = FootballLogoCoverage.audit(catalog)
        assertEquals(14, report.matches)
        assertEquals(28, report.teamSlots)
        assertEquals(14, report.competitionSlots)
        assertTrue(report.resolvedTeams >= 22)
        assertTrue(report.resolvedCompetitions >= 10)
        val unresolved = report.unresolvedTeams.map { "${it.homeTeam} vs ${it.awayTeam} (${it.competitionName})" }
        assertTrue(unresolved.joinToString(), report.missingTeams <= 6)
        assertNull(BundledFootballBadges.team(fixture("MLS", "USA", "Inter Miami", "Atlanta United"), "Inter Miami", home = true))
        assertEquals(R.drawable.logo_comp_mls, BundledFootballBadges.competition(fixture("MLS", "USA")))
        assertEquals(R.drawable.logo_fb_al_hilal, BundledFootballBadges.team(fixture("AFC Champions League Elite", "International Clubs"), "Al-Hilal", home = true))
        assertEquals(R.drawable.logo_fb_al_nassr, BundledFootballBadges.team(fixture("Saudi Pro League", "Saudi Arabia"), "Al-Nassr Club", home = true))
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
