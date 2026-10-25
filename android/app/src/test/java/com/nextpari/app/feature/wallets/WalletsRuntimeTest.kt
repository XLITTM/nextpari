package com.nextpari.app.feature.wallets

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WalletsRuntimeTest {
    @Test
    fun duplicatePressesDoNotSubmitTwiceOrChangeBalances() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        try {
            val gate = CompletableDeferred<Result<Unit>>()
            var calls = 0
            val rows = mutableListOf(
                PlayerWalletRow("w-tmt", "TMT", "Манат", "10.38", isActive = true),
                PlayerWalletRow("w-usd", "USD", "Доллар США", "25", isActive = false),
            )
            val repository = object : WalletsRepository {
                override fun ownedWallets(): List<PlayerWalletRow> = rows.toList()

                override suspend fun addWallet(currency: String): Result<Unit> {
                    calls += 1
                    return gate.await()
                }

                override suspend fun setActiveWallet(currency: String): Result<Unit> {
                    calls += 1
                    return gate.await()
                }
            }
            val viewModel = WalletsViewModel(repository)

            assertThat(viewModel.addCurrency("TRY")).isFalse()
            assertThat(viewModel.addCurrency("TRY")).isFalse()
            assertThat(viewModel.activate("USD")).isFalse()
            assertThat(viewModel.uiState.value.busy).isTrue()
            advanceUntilIdle()
            assertThat(calls).isEqualTo(1)

            gate.complete(Result.failure(IllegalStateException("Нет соединения с сетью")))
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.busy).isFalse()
            assertThat(viewModel.uiState.value.notice).isEqualTo("Нет соединения с сетью")
            assertThat(viewModel.uiState.value.completedMutations).isEqualTo(0)
            assertThat(viewModel.uiState.value.owned.map { it.walletId }).containsExactly("w-tmt", "w-usd")
            assertThat(viewModel.uiState.value.owned.first { it.walletId == "w-tmt" }.availableBalance).isEqualTo("10.38")
            assertThat(viewModel.uiState.value.owned.first { it.walletId == "w-usd" }.availableBalance).isEqualTo("25")
        } finally {
            Dispatchers.resetMain()
        }
    }
}
