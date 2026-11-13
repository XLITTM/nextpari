package com.nextpari.app.feature.sportsbook

import android.os.SystemClock

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.feature.favorites.SportsFavoritesStore
import com.nextpari.app.feature.home.HomeCatalogRepository
import com.nextpari.app.feature.home.MatchCardModel
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SportsbookUiState(
    val feed: FootballSnapshot = FootballSnapshot(),
    val loading: Boolean = false,
    val detailId: String? = null,
    val detail: FootballSnapshot = FootballSnapshot(),
    val detailLoading: Boolean = false,
    val selections: List<SportsBetSelection> = emptyList(),
    val stakeText: String = "",
    val placing: Boolean = false,
    val retryRequired: Boolean = false,
    val couponNotice: String? = null,
    val acceptedBetId: String? = null,
    val favoriteMatchIds: Set<String> = emptySet(),
) {
    val selectedKeys: Set<String> get() = selections.mapTo(mutableSetOf()) { it.identity }
    val picksCurrent: Boolean get() = selections.isNotEmpty() && selections.all { pick ->
        fixtureFor(pick.fixtureId)?.markets?.any { group ->
            group.outcomes.any { outcome -> outcome.selection?.let { it.identity == pick.identity && it.price == pick.price } == true }
        } == true
    }

    internal fun fixtureFor(id: String): FootballFixture? = listOfNotNull(
        detail.fixtures.firstOrNull { it.match.eventId == id },
        feed.fixtures.firstOrNull { it.match.eventId == id },
    ).maxByOrNull { it.quoteOrder }
}

class SportsbookViewModel(
    private val catalog: HomeCatalogRepository,
    private val football: FootballRepository? = null,
    private val onBetAccepted: () -> Unit = {},
    private val sessions: StateFlow<AuthSession>? = null,
    private val now: () -> Long = SystemClock::elapsedRealtime,
    private val favoritesStore: SportsFavoritesStore? = null,
) : ViewModel() {
    private val ui = MutableStateFlow(SportsbookUiState())
    val state = ui.asStateFlow()
    private var playerId: String? = null
    private var feedJob: Job? = null
    private var detailJob: Job? = null
    private var oddsJob: Job? = null
    private var quoteWake: Job? = null
    private var expiryJob: Job? = null
    private var generation = 0L
    private var requestOrder = 0L
    private var nextBatchAt = Long.MIN_VALUE
    private val attemptedAt = mutableMapOf<String, Long>()
    private val viewports = linkedMapOf<Any, List<String>>()
    private var visibleDetail: String? = null
    private var placeJob: Job? = null
    private var pending: PendingBet? = null

    var selectedMode: String = "live"
        private set

    init {
        if (sessions != null) viewModelScope.launch {
            sessions.collect { session -> setPlayer(session.playerPublicId.takeIf { session.isAuthenticated && it.isNotBlank() }) }
        }
    }

    internal fun setPlayer(id: String?) {
        if (playerId == id) return
        playerId = id
        generation++
        feedJob?.cancel()
        detailJob?.cancel()
        oddsJob?.cancel()
        quoteWake?.cancel()
        expiryJob?.cancel()
        placeJob?.cancel()
        feedJob = null
        detailJob = null
        oddsJob = null
        quoteWake = null
        expiryJob = null
        visibleDetail = null
        viewports.clear()
        attemptedAt.clear()
        pending = null
        selectedMode = "live"
        ui.value = SportsbookUiState()
        if (id != null && favoritesStore != null) {
            val run = generation
            viewModelScope.launch {
                val favorites = favoritesStore.matchIds(id)
                if (current(run)) ui.update { it.copy(favoriteMatchIds = favorites) }
            }
        }
    }

    private fun hasCurrentPlayer(): Boolean {
        val id = playerId ?: return false
        val session = sessions?.value ?: return true
        return session.isAuthenticated && session.playerPublicId == id
    }

    private fun current(run: Long): Boolean = run == generation && hasCurrentPlayer()

    fun refreshFeed() {
        val repository = football ?: return
        if (!hasCurrentPlayer()) return
        expirePrices()
        if (feedJob?.isActive == true) return
        val run = generation
        val order = ++requestOrder
        val started = now()
        ui.update { it.copy(loading = true) }
        feedJob = viewModelScope.launch {
            val listed = read(repository, null, ui.value.feed)
            if (!current(run)) return@launch
            ui.update { state ->
                val feed = listed.copy(fixtures = listed.fixtures.map { fresh ->
                    val prior = state.fixtureFor(fresh.match.eventId)?.takeIf(fresh::sameEvent)
                    when {
                        prior != null && (prior.quoteOrder > order ||
                            (listed.notice == null && fresh.priceState == FootballPriceState.Unpriced)) ->
                            fresh.withPrices(prior)
                        else -> fresh.stamped(order, started)
                    }
                })
                val listedDetail = state.detailId?.let { id -> feed.fixtures.firstOrNull { it.match.eventId == id } }
                val detail = if (listedDetail != null) {
                    val previous = state.detail.fixtures.singleOrNull()?.takeIf(listedDetail::sameEvent)
                    val match = listedDetail.match.copy(insights = previous?.match?.insights.takeIf { feed.notice == null })
                    FootballSnapshot(listOf(listedDetail.copy(match = match)),
                        feed.notice ?: listedDetail.priceState.notice, feed.canPrice, feed.retryable)
                } else state.detail
                state.copy(feed = feed, detail = detail, loading = false)
            }
            val presentIds = ui.value.feed.fixtures.mapTo(mutableSetOf()) { attemptKey(it) }
            ui.value.detail.fixtures.forEach { presentIds += attemptKey(it) }
            attemptedAt.keys.retainAll(presentIds)
            scheduleExpiry()
            if (listed.canPrice) scheduleOdds(allowFallback = true)
        }
    }

    fun loadEvent(id: String) = loadEvent(id, refreshClock = false)

    fun loadEvent(id: String, refreshClock: Boolean) {
        val repository = football ?: return
        if (!hasCurrentPlayer() || !isSportsFeedEventId(id)) return
        expirePrices()
        visibleDetail = id
        if (ui.value.detailId != id) detailJob?.cancel()
        val state = ui.value
        val listed = state.feed.canPrice && state.feed.fixtures.any { it.match.eventId == id }
        val cached = state.fixtureFor(id)?.takeIf { footballEventId.matches(id) }?.takeIf {
            listed ||
                (state.detailId == id && state.detail.canPrice)
        }
        if (cached != null) {
            val previous = state.detail.fixtures.singleOrNull()?.takeIf(cached::sameEvent)
            val match = cached.match.copy(insights = previous?.match?.insights ?: cached.match.insights)
            ui.update { it.copy(detailId = id, detail = FootballSnapshot(listOf(cached.copy(match = match)),
                cached.priceState.notice), detailLoading = false) }
            scheduleOdds()
            if (!refreshClock) return
            // Only the detail route includes insights in the current server contract.
            if (state.feed.featuredLive == null) {
                if (!cached.match.isLive) return
                if (listed) {
                    refreshFeed()
                    return
                }
            }
        }
        if (ui.value.detailId == id && detailJob?.isActive == true) return
        val run = generation
        val order = ++requestOrder
        val started = now()
        if (cached == null) ui.update { it.copy(detailId = id, detail = FootballSnapshot(), detailLoading = true) }
        detailJob = viewModelScope.launch {
            val detail = read(repository, id, ui.value.detail)
            if (!current(run) || ui.value.detailId != id) return@launch
            ui.update { state ->
                val fixtures = detail.fixtures.map { fresh ->
                    val current = state.fixtureFor(id)?.takeIf { it.sameEvent(fresh) }
                    if (current != null && (current.quoteOrder > order ||
                            (detail.canPrice && fresh.priceState == FootballPriceState.Unpriced && current.hasPrice(now())))) {
                        fresh.withPrices(current)
                    } else fresh.stamped(order, started)
                }
                state.copy(detail = detail.copy(fixtures = fixtures,
                    notice = detail.notice ?: fixtures.singleOrNull()?.takeIf { footballEventId.matches(id) }?.priceState?.notice), detailLoading = false)
            }
            if (detail.fixtures.isNotEmpty()) scheduleOdds()
            scheduleExpiry()
        }
    }

    fun leaveEvent(id: String) {
        if (visibleDetail == id) {
            visibleDetail = null
            scheduleOdds()
        }
    }

    fun visibleMatches(source: Any, ids: List<String>) {
        if (ids.isNotEmpty()) expirePrices()
        if (ids.isEmpty()) viewports.remove(source) else viewports[source] = ids
        scheduleOdds()
    }

    private fun scheduleOdds(allowFallback: Boolean = false) {
        if (football == null || !hasCurrentPlayer() || oddsJob?.isActive == true) return
        quoteWake?.cancel()
        val run = generation
        quoteWake = viewModelScope.launch {
            // Let lazy layouts report their visible keys before using the initial feed order.
            delay(250)
            if (!current(run)) return@launch
            val state = ui.value
            val candidates = oddsCandidates(state, allowFallback)
            if (candidates.isEmpty()) return@launch
            val next = candidates.minOf { eligibleAt(it) }
            val due = maxOf(next, nextBatchAt)
            val remaining = now().let { if (due > it) due - it else 0 }
            delay(remaining)
            if (!current(run)) return@launch
            // Scrolling or a list refresh may have changed the candidates during the wait.
            val selected = oddsCandidates(ui.value, allowFallback).filter { eligibleAt(it) <= now() }.take(FOOTBALL_BATCH_SIZE)
            if (selected.isNotEmpty()) fetchOdds(selected, run)
        }
    }

    private fun oddsCandidates(state: SportsbookUiState, allowFallback: Boolean): List<FootballFixture> {
        val feed = state.feed.fixtures.takeIf { state.feed.canPrice }.orEmpty()
        val detail = visibleDetail?.takeIf { state.detail.canPrice }?.let(state::fixtureFor)
        return footballOddsCandidates(feed, viewports.values.flatten(), detail, allowFallback)
    }

    private fun eligibleAt(fixture: FootballFixture): Long {
        val attempted = attemptedAt[attemptKey(fixture)]?.plus(FOOTBALL_QUOTE_MAX_AGE_MS) ?: Long.MIN_VALUE
        val canReuse = fixture.match.eventId != visibleDetail || fixture.fullMarkets
        return maxOf(attempted, if (canReuse && fixture.priceState == FootballPriceState.Open) fixture.validUntil else Long.MIN_VALUE)
    }

    private fun fetchOdds(fixtures: List<FootballFixture>, run: Long) {
        val repository = football ?: return
        val started = now()
        val order = ++requestOrder
        nextBatchAt = started + FOOTBALL_ODDS_GAP_MS
        fixtures.forEach { attemptedAt[attemptKey(it)] = started }
        oddsJob = viewModelScope.launch {
            val batch = try {
                repository.readOdds(fixtures.map { it.match.eventId })
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                FootballOddsBatch(fallback = FootballPriceState.Upstream)
            }
            if (!current(run)) return@launch
            val backoff = batch.fallback.isThrottled || batch.quotes.values.any { it.availability.isThrottled }
            if (backoff) nextBatchAt = maxOf(nextBatchAt, now() + FOOTBALL_ODDS_BACKOFF_MS)
            fixtures.filter { batch.quotes[it.match.eventId]?.availability == FootballPriceState.Deferred }.forEach {
                attemptedAt[attemptKey(it)] = started - FOOTBALL_QUOTE_MAX_AGE_MS + FOOTBALL_ODDS_GAP_MS
            }
            val anchors = fixtures.associateBy { it.match.eventId }
            ui.update { state ->
                fun merge(fixture: FootballFixture): FootballFixture {
                    val id = fixture.match.eventId
                    val anchor = anchors[id] ?: return fixture
                    if (fixture.quoteOrder > order || !fixture.sameEvent(anchor)) return fixture
                    return fixture.withQuote(batch.quotes[id], batch.fallback, order, started + FOOTBALL_QUOTE_MAX_AGE_MS)
                        .let { if (it.priceState == FootballPriceState.Open && !it.hasPrice(now())) it.locked() else it }
                }
                val feed = state.feed.copy(fixtures = state.feed.fixtures.map(::merge))
                val detail = state.detail.copy(fixtures = state.detail.fixtures.map(::merge))
                val detailNotice = detail.fixtures.singleOrNull()?.priceState?.notice
                state.copy(feed = feed, detail = detail.copy(notice = if (detail.fixtures.isEmpty()) detail.notice else detailNotice))
            }
            oddsJob = null
            scheduleExpiry()
            if (viewports.isNotEmpty() || visibleDetail != null) scheduleOdds()
        }
    }

    private fun scheduleExpiry() {
        expiryJob?.cancel()
        val state = ui.value
        val until = (state.feed.fixtures + state.detail.fixtures).filter { it.priceState == FootballPriceState.Open }
            .minOfOrNull { it.validUntil } ?: return
        val run = generation
        expiryJob = viewModelScope.launch {
            delay((until - now()).coerceAtLeast(0))
            if (!current(run)) return@launch
            expirePrices()
            expiryJob = null
            scheduleExpiry()
        }
    }

    private fun expirePrices() {
        val at = now()
        fun expire(fixture: FootballFixture) =
            if (fixture.priceState == FootballPriceState.Open && !fixture.hasPrice(at)) fixture.locked() else fixture
        ui.update { prior ->
            val detail = prior.detail.copy(fixtures = prior.detail.fixtures.map(::expire))
            prior.copy(
                feed = prior.feed.copy(fixtures = prior.feed.fixtures.map(::expire)),
                detail = detail.copy(notice = detail.fixtures.singleOrNull()?.priceState?.notice ?: detail.notice),
            )
        }
    }

    private fun FootballFixture.stamped(order: Long, started: Long): FootballFixture {
        val fixture = copy(quoteOrder = order,
            validUntil = if (priceState == FootballPriceState.Open) started + FOOTBALL_QUOTE_MAX_AGE_MS else 0)
        return if (fixture.priceState == FootballPriceState.Open && !fixture.hasPrice(now())) fixture.locked() else fixture
    }

    fun rememberMode(mode: String): String {
        selectedMode = if (mode == "line") "line" else "live"
        return selectedMode
    }

    fun live(): List<MatchCardModel> = matches(true)
    fun line(): List<MatchCardModel> = matches(false)
    fun pool(mode: String): List<MatchCardModel> {
        val matches = if (mode == "line") line() else live()
        val real = orderedByIds(matches, ui.value.feed.schedule) ?: return matches
        return real + matches.filter(FeaturedSports::isEsports)
    }

    fun featured(live: Boolean, matches: List<MatchCardModel>, nowMs: Long): List<MatchCardModel> {
        val feed = ui.value.feed
        val order = if (live) feed.featuredLive else feed.featuredLine
        if (order == null) return if (live) FeaturedSports.popularLive(matches) else FeaturedSports.popularLine(matches, nowMs)
        return orderedByIds(matches, order).orEmpty()
    }

    private fun orderedByIds(matches: List<MatchCardModel>, ids: List<String>?): List<MatchCardModel>? {
        if (ids == null) return null
        val byId = matches.associateBy(MatchCardModel::eventId)
        return ids.mapNotNull(byId::get)
    }
    fun sportRows(tab: String): List<SportListRow> = SportsListCatalog.rows(tab, live(), line())
    fun championships(sport: String, mode: String): List<CountryGroup> =
        CountryGrouping.groupByCountry(pool(mode).filter { it.sport == sport })
    fun leagueMatches(leagueId: String, mode: String): List<MatchCardModel> =
        LeagueMatches.filter(pool(mode), leagueId)

    fun matchById(id: String): MatchCardModel? {
        val current = ui.value
        val detailMatch = detailFixture(id)?.match
        val match = detailMatch ?: current.feed.fixtures.firstOrNull { it.match.id == id }?.match
        return match?.copy(isFavorite = id in current.favoriteMatchIds)
    }
    fun marketsFor(id: String): List<MarketGroup> = detailFixture(id)?.markets.orEmpty()

    fun toggleMatchFavorite(id: String) {
        val owner = playerId ?: return
        if (!hasCurrentPlayer() || !isSportsFeedEventId(id)) return
        val store = favoritesStore ?: return
        val run = generation
        viewModelScope.launch {
            val favorites = store.toggleMatch(id, owner)
            if (current(run)) ui.update { it.copy(favoriteMatchIds = favorites) }
        }
    }

    fun toggle(selection: SportsBetSelection) {
        if (!hasCurrentPlayer() || ui.value.placing || pending != null) return
        val fixture = ui.value.fixtureFor(selection.fixtureId)
        if (fixture?.hasPrice(now()) != true || !fixture.markets.any { group ->
                group.outcomes.any { it.selection == selection }
            }) return
        ui.update { it.copy(selections = toggleSportsSelection(it.selections, selection), couponNotice = null, acceptedBetId = null) }
    }

    fun remove(selection: SportsBetSelection) {
        if (ui.value.placing || pending != null) return
        ui.update { it.copy(selections = it.selections.filterNot { pick -> pick.identity == selection.identity }) }
    }

    fun setStake(value: String) {
        if (ui.value.placing || pending != null || value.length > 18) return
        ui.update { it.copy(stakeText = value, couponNotice = null, acceptedBetId = null) }
    }

    fun submit(walletId: String?) {
        val repository = football ?: return
        if (!hasCurrentPlayer() || ui.value.placing || walletId.isNullOrBlank()) return
        val state = ui.value
        val previous = pending
        if (previous != null && previous.walletId != walletId) {
            ui.update { it.copy(couponNotice = "Для повтора выберите кошелёк первой попытки") }
            return
        }
        if (previous == null && (!state.picksCurrent || state.selections.any { state.fixtureFor(it.fixtureId)?.hasPrice(now()) != true })) {
            ui.update { it.copy(couponNotice = "Обновите коэффициенты и выберите исходы заново") }
            return
        }
        val request = previous?.request ?: sportsBetRequest(state.stakeText, state.selections, UUID.randomUUID().toString())
        if (request == null) {
            ui.update { it.copy(couponNotice = "Введите сумму ставки") }
            return
        }
        pending = PendingBet(walletId, request)
        ui.update { it.copy(placing = true, couponNotice = null) }
        val run = generation
        placeJob = viewModelScope.launch {
            val response = repository.place(request)
            if (!current(run)) return@launch
            when (response) {
                is SportsBetResult.Accepted -> {
                    pending = null
                    ui.update {
                        it.copy(placing = false, retryRequired = false, selections = emptyList(),
                            stakeText = "", acceptedBetId = response.betId)
                    }
                    onBetAccepted()
                }
                is SportsBetResult.Rejected -> {
                    pending = null
                    val reselect = response.code in codesRequiringNewOdds
                    ui.update {
                        it.copy(placing = false, retryRequired = false,
                            selections = if (reselect) emptyList() else it.selections,
                            couponNotice = sportsbookRejectionMessage(response.code))
                    }
                    if (reselect) {
                        refreshFeed()
                        ui.value.detailId?.let(::loadEvent)
                    }
                }
                SportsBetResult.Unconfirmed -> ui.update {
                    it.copy(placing = false, retryRequired = true,
                        couponNotice = "Сервер не подтвердил результат. Проверьте историю или повторите эту же отправку.")
                }
            }
        }
    }

    private fun matches(live: Boolean): List<MatchCardModel> {
        val current = ui.value.feed.fixtures.map(FootballFixture::match).filter { it.isLive == live }
        val supplemental = if (live) catalog.esportsLiveMatches() else catalog.esportsLineMatches()
        val favorites = ui.value.favoriteMatchIds
        return FeaturedSports.ordered((current + supplemental).distinctBy { it.id })
            .map { it.copy(isFavorite = it.id in favorites || it.isFavorite) }
    }

    private fun detailFixture(id: String): FootballFixture? =
        ui.value.detail.fixtures.firstOrNull { it.match.id == id }

    private suspend fun read(repository: FootballRepository, id: String?, previous: FootballSnapshot): FootballSnapshot =
        try {
            repository.read(id)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            previous.locked(footballReadMessage(error), (error as? FootballFeedHttpException)?.retryable ?: true)
        }

    private data class PendingBet(val walletId: String, val request: SportsBetRequest)

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return SportsbookViewModel(
                    AppGraph.homeCatalogRepository, AppGraph.footballRepository, AppGraph::refreshPlayerState,
                    AppGraph.sessionRepository.session,
                    favoritesStore = AppGraph.sportsFavorites,
                ) as T
            }
        }
    }
}

internal const val FOOTBALL_ODDS_GAP_MS = 15_000L
internal const val FOOTBALL_ODDS_BACKOFF_MS = 60_000L
internal const val FOOTBALL_QUOTE_MAX_AGE_MS = 30_000L

private val FootballPriceState.isThrottled: Boolean
    get() = this == FootballPriceState.RateLimited || this == FootballPriceState.Stale

private fun attemptKey(fixture: FootballFixture) = "${fixture.match.eventId}:${fixture.match.isLive}"

internal fun footballOddsCandidates(
    fixtures: List<FootballFixture>, visibleIds: List<String>, detail: FootballFixture?, allowFallback: Boolean,
): List<FootballFixture> {
    val footballOnly = fixtures.filter { it.match.sport == "football" && footballEventId.matches(it.match.eventId) }
    val byId = footballOnly.associateBy { it.match.eventId }
    val visible = visibleIds.distinct().mapNotNull(byId::get)
    val candidates = if (visible.isNotEmpty()) visible else if (allowFallback && detail == null) {
        footballOnly.filter { it.match.isLive }.take(6) + footballOnly.filterNot { it.match.isLive }.take(FOOTBALL_BATCH_SIZE)
    } else emptyList()
    return (listOfNotNull(detail?.takeIf { it.match.sport == "football" && footballEventId.matches(it.match.eventId) }) + candidates.filter { it.match.isLive } + candidates.filterNot { it.match.isLive })
        .distinctBy { it.match.eventId }
}

internal fun toggleSportsSelection(
    current: List<SportsBetSelection>, tapped: SportsBetSelection,
): List<SportsBetSelection> {
    if (current.any { it.identity == tapped.identity && it.price == tapped.price }) {
        return current.filterNot { it.identity == tapped.identity }
    }
    return current.filterNot { it.fixtureId == tapped.fixtureId } + tapped
}

internal fun sportsBetRequest(
    text: String, picks: List<SportsBetSelection>, idempotencyKey: String,
): SportsBetRequest? {
    val decimal = text.trim().replace(',', '.')
    if (!Regex("[0-9]+(?:\\.[0-9]+)?").matches(decimal)) return null
    val stake = decimal.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0 } ?: return null
    if (picks.isEmpty() || picks.map { it.fixtureId }.distinct().size != picks.size) return null
    return SportsBetRequest(stake, if (picks.size == 1) "single" else "express", idempotencyKey, picks)
}

private val codesRequiringNewOdds = setOf("ODDS_CHANGED", "FEED_STALE", "MARKET_SUSPENDED", "EVENT_UNAVAILABLE", "INVALID_PRICE")

private fun sportsbookRejectionMessage(code: String): String = when (code) {
    "ODDS_CHANGED" -> "Коэффициенты изменились. Выберите исходы заново."
    "FEED_STALE", "MARKET_SUSPENDED", "EVENT_UNAVAILABLE", "INVALID_PRICE" -> "Коэффициенты недоступны. Обновите линию и выберите исходы заново."
    "SPORTS_BET_DISABLED", "SPORTSBOOK_EMERGENCY_STOP", "SPORTS_PROVIDER_RETIRED" -> "Приём ставок временно выключен."
    "SPORTSBOOK_ACCOUNT_NOT_AUTHORIZED" -> "Приём ставок недоступен для этого аккаунта."
    "INSUFFICIENT_AVAILABLE_BALANCE" -> "Недостаточно средств на кошельке."
    "SPORTS_STAKE_LIMIT", "SPORTS_STAKE_BELOW_CURRENCY_MIN", "SPORTS_STAKE_ABOVE_CURRENCY_MAX",
    "CURRENCY_AMOUNT_SCALE_INVALID", "SPORTS_PAYOUT_LIMIT", "SPORTS_PAYOUT_ABOVE_CURRENCY_MAX" -> "Сумма не соответствует лимитам ставок."
    else -> "Ставка отклонена сервером."
}
