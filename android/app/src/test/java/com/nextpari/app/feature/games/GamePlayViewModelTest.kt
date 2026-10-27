package com.nextpari.app.feature.games

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GamePlayViewModelTest {
    private val applied = mutableListOf<Double>()

    @Before
    fun mainDispatcher() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun resetDispatcher() {
        Dispatchers.resetMain()
    }

    @Test
    fun playSendsOneStartAndAppliesTheServerBalance() = runTest {
        val games = RecordingGames(settled("dice", 4.0, 20.0))
        val viewModel = viewModel(GameSpecs.dice, games, available = 50.0)

        viewModel.play()

        assertThat(games.starts).hasSize(1)
        assertThat(games.starts.single().gameCode).isEqualTo("dice")
        assertThat(games.starts.single().stake).isEqualTo(12.0)
        assertThat(applied).containsExactly(20.0)
        assertThat(viewModel.uiState.value.round?.state).isEqualTo("settled")
        assertThat(viewModel.uiState.value.balanceLabel).isEqualTo("20 TMT")
    }

    @Test
    fun repeatedTapDoesNotCreateASecondRound() = runTest {
        val gate = CompletableDeferred<Unit>()
        val games = RecordingGames(open("blackjack"), hold = gate)
        val viewModel = viewModel(GameSpecs.blackjack, games, available = 50.0)

        viewModel.play()
        viewModel.play()
        assertThat(games.starts).hasSize(1)
        gate.complete(Unit)

        assertThat(games.starts).hasSize(1)
    }

    @Test
    fun failedStartReusesTheIdempotencyKey() = runTest {
        val games = RecordingGames(settled("crystal", 0.0, 10.0), fail = PlayerGameException("GAME_RPC_FAILED", 500))
        val viewModel = viewModel(GameSpecs.crystal, games, available = 50.0)

        viewModel.play()
        games.fail = null
        viewModel.play()

        assertThat(games.starts).hasSize(2)
        assertThat(games.starts[0].key).isEqualTo(games.starts[1].key)
        assertThat(viewModel.uiState.value.round?.balanceAfter).isEqualTo(10.0)
    }

    @Test
    fun lowStakeAndMissingAgeStyleBalanceDoNotCallTheServer() = runTest {
        val games = RecordingGames(settled("pharaoh", 0.0, 1.0))
        val viewModel = viewModel(GameSpecs.pharaoh, games, available = 5.0)
        viewModel.setStake("1")
        viewModel.play()
        viewModel.setStake("100")
        viewModel.play()

        assertThat(games.starts).isEmpty()
        assertThat(viewModel.uiState.value.error).isEqualTo("Недостаточно средств")
        assertThat(viewModel.uiState.value.round).isNull()
    }

    @Test
    fun disabledGameStaysBlockedWithoutAResult() = runTest {
        val games = RecordingGames(settled("aviator", 0.0, 1.0), fail = PlayerGameException("GAME_DISABLED", 409))
        val viewModel = viewModel(GameSpecs.aviator, games, available = 50.0)

        viewModel.play()
        viewModel.play()

        assertThat(games.starts).hasSize(1)
        assertThat(viewModel.uiState.value.blocked).isTrue()
        assertThat(viewModel.uiState.value.round).isNull()
        assertThat(viewModel.uiState.value.error).isEqualTo("Игра временно недоступна")
    }

    @Test
    fun blackjackAndApplesSendOnlyAllowedServerActions() = runTest {
        val games = RecordingGames(
            open("blackjack", allowed = listOf("hit", "stand")),
        )
        val viewModel = viewModel(GameSpecs.blackjack, games, available = 50.0)
        viewModel.play()
        viewModel.act("stand")
        viewModel.act("cashout")

        assertThat(games.actions.map { it.action }).containsExactly("stand")
        val apples = RecordingGames(open("apples", allowed = listOf("pick", "cashout")))
        val appleModel = viewModel(GameSpecs.apples, apples, available = 50.0)
        appleModel.play()
        appleModel.act("pick", mapOf("col" to "2"))
        assertThat(apples.actions.single().options).containsEntry("col", "2")
    }

    @Test
    fun describeRoundUsesServerFieldsOnly() {
        val dice = settled("dice", 12.0, 30.0).copy(
            publicResult = mapOf("playerDice" to "[6,5]", "rivalDice" to "[1,2]", "outcome" to "win"),
        )
        assertThat(describeRound("dice", dice)).contains("6 + 5")
        assertThat(describeRound("dice", dice)).contains("Исход: win")
        val cards = open("blackjack").copy(
            publicResult = mapOf(
                "playerHand" to """[{"rank":"A","suit":"♠","isHidden":false}]""",
                "dealerHand" to """[{"rank":"K","suit":"♥","isHidden":true}]""",
            ),
        )
        val text = describeRound("blackjack", cards)
        assertThat(text).contains("A♠")
        assertThat(text).contains("??")
        assertThat(text).doesNotContain("Вы выиграли")
    }

    private fun viewModel(spec: GameSpec, games: RecordingGames, available: Double): GamePlayViewModel {
        var balance = available
        return GamePlayViewModel(
            spec = spec,
            games = games,
            readBalance = { balance to "TMT" },
            applyBalance = {
                balance = it
                applied += it
            },
        )
    }

    private fun settled(code: String, payout: Double, balance: Double) = round(code, "settled", payout, balance, emptyList())

    private fun open(code: String, allowed: List<String> = emptyList()) = round(code, "open", 0.0, 40.0, allowed)

    private fun round(
        code: String,
        state: String,
        payout: Double,
        balance: Double,
        allowed: List<String>,
    ) = PlayerGameRound(
        ok = true,
        isDuplicate = false,
        roundId = "round-1",
        gameCode = code,
        state = state,
        stake = 12.0,
        totalStake = 12.0,
        payout = payout,
        balanceAfter = balance,
        serverSeedHash = "hash",
        serverSeed = null,
        nonce = 1,
        sessionId = null,
        mathVersion = null,
        publicResult = emptyMap(),
        allowedActions = allowed,
        createdAt = null,
        settledAt = null,
    )

    private class RecordingGames(
        private val round: PlayerGameRound,
        var fail: Exception? = null,
        private val hold: CompletableDeferred<Unit>? = null,
    ) : GameRepository {
        val starts = mutableListOf<Start>()
        val actions = mutableListOf<Act>()

        override suspend fun startGame(
            gameCode: String,
            stake: Double,
            idempotencyKey: String,
            options: Map<String, String>,
        ): PlayerGameRound {
            starts += Start(gameCode, stake, idempotencyKey)
            hold?.await()
            fail?.let { throw it }
            return round
        }

        override suspend fun gameAction(
            roundId: String,
            action: String,
            idempotencyKey: String,
            options: Map<String, String>,
        ): PlayerGameRound {
            actions += Act(action, options)
            fail?.let { throw it }
            return round.copy(state = "settled", allowedActions = emptyList())
        }

        override suspend fun getGameRound(roundId: String): PlayerGameRound = round

        override suspend fun getAviatorSession(): Map<String, String> = emptyMap()
    }

    private data class Start(val gameCode: String, val stake: Double, val key: String)
    private data class Act(val action: String, val options: Map<String, String>)
}
