package com.nextpari.app.feature.sportsbook

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.feature.home.HomeCatalogRepository
import com.nextpari.app.feature.home.MatchCardModel
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
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
) {
    val selectedKeys: Set<String> get() = selections.mapTo(mutableSetOf()) { it.identity }
}

class SportsbookViewModel(
    private val catalog: HomeCatalogRepository,
    private val football: FootballRepository? = null,
    private val onBetAccepted: () -> Unit = {},
    private val sessions: StateFlow<AuthSession>? = null,
) : ViewModel() {
    private val ui = MutableStateFlow(SportsbookUiState())
    val state = ui.asStateFlow()
    private var playerId: String? = null
    private var feedJob: Job? = null
    private var detailJob: Job? = null
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
        feedJob?.cancel()
        detailJob?.cancel()
        placeJob?.cancel()
        pending = null
        selectedMode = "live"
        ui.value = SportsbookUiState()
    }

    private fun hasCurrentPlayer(): Boolean {
        val id = playerId ?: return false
        val session = sessions?.value ?: return true
        return session.isAuthenticated && session.playerPublicId == id
    }

    fun refreshFeed() {
        val repository = football ?: return
        if (!hasCurrentPlayer() || feedJob?.isActive == true) return
        ui.update { it.copy(loading = true) }
        feedJob = viewModelScope.launch {
            val feed = read(repository, null, ui.value.feed)
            ui.update { it.copy(feed = feed, loading = false) }
        }
    }

    fun loadEvent(id: String) {
        val repository = football ?: return
        if (!hasCurrentPlayer() || !footballEventId.matches(id)) return
        if (ui.value.detailId == id && detailJob?.isActive == true) return
        detailJob?.cancel()
        val previous = ui.value.detail.takeIf { ui.value.detailId == id } ?: FootballSnapshot()
        ui.update { it.copy(detailId = id, detail = previous, detailLoading = true) }
        detailJob = viewModelScope.launch {
            val detail = read(repository, id, previous)
            ui.update { state ->
                val current = detail.fixtures.firstOrNull { it.match.id == id }
                val feed = state.feed.copy(fixtures = state.feed.fixtures.mapNotNull { fixture ->
                    if (fixture.match.id != id) fixture else current ?: detail.notice?.let { fixture.locked() }
                })
                state.copy(feed = feed, detail = detail, detailLoading = false)
            }
        }
    }

    fun rememberMode(mode: String): String {
        selectedMode = if (mode == "line") "line" else "live"
        return selectedMode
    }

    fun live(): List<MatchCardModel> = matches(true)
    fun line(): List<MatchCardModel> = matches(false)
    fun pool(mode: String): List<MatchCardModel> = SportsbookCatalog.pool(mode, live(), line())
    fun sportRows(tab: String): List<SportListRow> = SportsListCatalog.rows(tab, live(), line())
    fun championships(sport: String, mode: String): List<CountryGroup> =
        CountryGrouping.groupByCountry(pool(mode).filter { it.sport == sport })
    fun leagueMatches(leagueId: String, mode: String): List<MatchCardModel> =
        LeagueMatches.filter(pool(mode), leagueId)

    fun matchById(id: String): MatchCardModel? {
        val current = ui.value
        val detailMatch = detailFixture(id)?.match
        if (current.detailId == id && !current.detailLoading && current.detail.notice == null) return detailMatch
        return detailMatch ?: current.feed.fixtures.firstOrNull { it.match.id == id }?.match
    }
    fun marketsFor(id: String): List<MarketGroup> = detailFixture(id)?.markets.orEmpty()

    fun toggle(selection: SportsBetSelection) {
        if (!hasCurrentPlayer() || ui.value.placing || pending != null) return
        // Accept a tap only while the exact displayed quote remains in a current snapshot.
        val current = listOfNotNull(detailFixture(selection.fixtureId),
            ui.value.feed.fixtures.firstOrNull { it.match.id == selection.fixtureId })
        if (current.none { fixture -> fixture.markets.any { group -> group.outcomes.any { it.selection == selection } } }) return
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
        val request = previous?.request ?: sportsBetRequest(state.stakeText, state.selections, UUID.randomUUID().toString())
        if (request == null) {
            ui.update { it.copy(couponNotice = "Введите сумму ставки") }
            return
        }
        pending = PendingBet(walletId, request)
        ui.update { it.copy(placing = true, couponNotice = null) }
        placeJob = viewModelScope.launch {
            when (val response = repository.place(request)) {
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
        return current + if (live) catalog.esportsLiveMatches() else catalog.esportsLineMatches()
    }

    private fun detailFixture(id: String): FootballFixture? =
        ui.value.detail.fixtures.firstOrNull { it.match.id == id }

    private suspend fun read(repository: FootballRepository, id: String?, previous: FootballSnapshot): FootballSnapshot =
        try {
            repository.read(id)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            previous.locked(footballReadMessage(error))
        }

    private data class PendingBet(val walletId: String, val request: SportsBetRequest)

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return SportsbookViewModel(
                    AppGraph.homeCatalogRepository, AppGraph.footballRepository, AppGraph::refreshPlayerState,
                    AppGraph.sessionRepository.session,
                ) as T
            }
        }
    }
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
