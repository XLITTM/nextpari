package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.MatchCardModel

internal data class BadgeHit(
    val drawable: Int?,
    val source: String,
)

internal data class FootballLogoAuditRow(
    val sport: String,
    val country: String,
    val competitionId: String?,
    val competitionName: String,
    val homeParticipantId: String?,
    val awayParticipantId: String?,
    val homeTeam: String,
    val awayTeam: String,
    val homeBadge: Int?,
    val awayBadge: Int?,
    val competitionBadge: Int?,
    val homeSource: String,
    val awaySource: String,
    val competitionSource: String,
)

internal data class FootballLogoAuditReport(
    val matches: Int,
    val teamSlots: Int,
    val resolvedTeams: Int,
    val missingTeams: Int,
    val competitionSlots: Int,
    val resolvedCompetitions: Int,
    val missingCompetitions: Int,
    val withheld: Int,
    val rows: List<FootballLogoAuditRow>,
) {
    val unresolvedTeams: List<FootballLogoAuditRow>
        get() = rows.filter { it.homeBadge == null || it.awayBadge == null }
}

internal object FootballLogoCoverage {
    fun audit(matches: List<MatchCardModel>): FootballLogoAuditReport {
        val football = matches.filter { it.sport == "football" }
        val rows = football.map { match ->
            val home = FootballLogoRegistry.teamHit(match, match.team1, home = true)
            val away = FootballLogoRegistry.teamHit(match, match.team2, home = false)
            val competition = FootballLogoRegistry.competitionHit(match)
            FootballLogoAuditRow(
                sport = match.sport,
                country = match.country,
                competitionId = match.competitionId,
                competitionName = match.league,
                homeParticipantId = match.homeParticipantId,
                awayParticipantId = match.awayParticipantId,
                homeTeam = match.team1,
                awayTeam = match.team2,
                homeBadge = home.drawable,
                awayBadge = away.drawable,
                competitionBadge = competition.drawable,
                homeSource = home.source,
                awaySource = away.source,
                competitionSource = competition.source,
            )
        }
        val withheld = rows.count { row ->
            listOf(row.homeSource, row.awaySource, row.competitionSource).any { it == "ambiguous" || it == "restricted" }
        }
        return FootballLogoAuditReport(
            matches = rows.size,
            teamSlots = rows.size * 2,
            resolvedTeams = rows.count { it.homeBadge != null } + rows.count { it.awayBadge != null },
            missingTeams = rows.count { it.homeBadge == null } + rows.count { it.awayBadge == null },
            competitionSlots = rows.size,
            resolvedCompetitions = rows.count { it.competitionBadge != null },
            missingCompetitions = rows.count { it.competitionBadge == null },
            withheld = withheld,
            rows = rows,
        )
    }
}
