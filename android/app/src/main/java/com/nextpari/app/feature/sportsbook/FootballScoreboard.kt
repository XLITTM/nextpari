package com.nextpari.app.feature.sportsbook

import com.nextpari.app.feature.home.MatchCardModel

internal data class LiveScoreboard(
    val isLive: Boolean,
    val score: String?,
    val liveClock: FootballLiveClock?,
    val period: String?,
    val boardStale: Boolean,
    val scoreObservedAtEpochMs: Long?,
)

internal fun MatchCardModel.scoreboard(): LiveScoreboard =
    LiveScoreboard(isLive, score, liveClock, period, boardStale, scoreObservedAtEpochMs)

internal fun MatchCardModel.withScoreboard(board: LiveScoreboard): MatchCardModel = copy(
    isLive = board.isLive,
    score = board.score ?: score,
    liveClock = board.liveClock,
    period = board.period,
    boardStale = board.boardStale,
    scoreObservedAtEpochMs = board.scoreObservedAtEpochMs ?: scoreObservedAtEpochMs,
)

internal fun FootballFixture.withScoreboard(board: LiveScoreboard): FootballFixture =
    copy(match = match.withScoreboard(board))

internal fun boardStamp(match: MatchCardModel): Long {
    val clockAt = match.liveClock?.observedAtEpochMs ?: 0L
    if (clockAt > 0L) return clockAt
    return match.scoreObservedAtEpochMs ?: 0L
}

internal fun fresherScoreboard(
    current: MatchCardModel,
    incoming: MatchCardModel,
    preferIncoming: Boolean = false,
): LiveScoreboard {
    if (!incoming.isLive && current.isLive && incoming.score == null && incoming.liveClock == null) {
        return current.scoreboard()
    }
    fun pick(match: MatchCardModel): LiveScoreboard {
        val other = if (match === incoming) current else incoming
        return LiveScoreboard(
            isLive = match.isLive,
            score = match.score ?: other.score,
            liveClock = match.liveClock ?: other.liveClock,
            period = match.period ?: other.period,
            boardStale = match.boardStale,
            scoreObservedAtEpochMs = match.scoreObservedAtEpochMs ?: other.scoreObservedAtEpochMs,
        )
    }
    val currentAt = boardStamp(current)
    val incomingAt = boardStamp(incoming)
    if (currentAt > 0L && incomingAt > 0L) {
        if (incomingAt > currentAt) return pick(incoming)
        if (currentAt > incomingAt) return pick(current)
        return pick(if (preferIncoming) incoming else current)
    }
    // No verified timestamps: a newly received odds/catalog snapshot is not a newer score.
    if (incoming.liveClock == null && current.liveClock != null) return pick(current)
    if (incoming.liveClock != null && current.liveClock == null) return pick(incoming)
    if (incoming.score != null && current.score == null) return pick(incoming)
    if (current.score != null && incoming.score == null) return pick(current)
    return pick(if (preferIncoming) incoming else current)
}

internal fun applyLiveBoard(previous: List<FootballFixture>, live: List<FootballFixture>): List<FootballFixture> {
    val incoming = live.associateBy { it.match.eventId }
    return previous.map { fixture ->
        val next = incoming[fixture.match.eventId] ?: return@map fixture
        fixture.withScoreboard(fresherScoreboard(fixture.match, next.match, preferIncoming = true))
    }
}

internal fun mergeDetailScoreboard(listed: MatchCardModel?, detail: MatchCardModel?): MatchCardModel? {
    if (detail == null) return listed
    if (listed == null) return detail
    return detail.withScoreboard(fresherScoreboard(listed, detail, preferIncoming = false))
}

internal fun mergeListingIntoDetail(
    detail: FootballFixture,
    listed: FootballFixture,
    keepInsights: Boolean,
): FootballFixture {
    val board = fresherScoreboard(listed.match, detail.match, preferIncoming = false)
    val keepMarkets = detail.fullMarkets && detail.markets.size > listed.markets.size
    return if (keepMarkets) {
        detail.copy(
            match = detail.match.withScoreboard(board).copy(
                insights = if (keepInsights) detail.match.insights else null,
                outcomes = listed.match.outcomes,
                extraMarkets = detail.match.extraMarkets,
                priceNote = listed.match.priceNote,
            ),
        )
    } else {
        listed.copy(
            match = listed.match.withScoreboard(board).copy(
                insights = if (keepInsights) detail.match.insights else listed.match.insights,
            ),
        )
    }
}

internal fun markLiveBoardStale(fixtures: List<FootballFixture>): List<FootballFixture> =
    fixtures.map { fixture ->
        if (!fixture.match.isLive) fixture
        else fixture.copy(
            match = fixture.match.copy(
                boardStale = true,
                liveClock = fixture.match.liveClock?.asStale(),
            ),
        )
    }
