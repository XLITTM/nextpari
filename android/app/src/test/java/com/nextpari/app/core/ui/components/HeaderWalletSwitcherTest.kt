package com.nextpari.app.core.ui.components

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.feature.wallets.PlayerWalletRow
import com.nextpari.app.feature.wallets.WalletsCatalog
import com.nextpari.app.feature.wallets.WalletsUiState
import com.nextpari.app.feature.wallets.WalletsViewModel
import org.junit.Test
import java.io.File

class HeaderWalletSwitcherTest {
    @Test
    fun plusAndBalancePillAreIndependentActions() {
        val header = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariHeader.kt").readText()
        val switcher = moduleFile("src/main/java/com/nextpari/app/core/ui/components/HeaderWalletSwitcher.kt").readText()
        val root = moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText()
        assertThat(header).contains("onDeposit: () -> Unit")
        assertThat(header).contains("clickable(onClick = onDeposit)")
        assertThat(header).contains("HeaderWalletSwitcher(")
        assertThat(header).doesNotContain("onWallet")
        assertThat(switcher).doesNotContain("Destinations.WALLET")
        assertThat(switcher).doesNotContain("navigateTo")
        assertThat(switcher).doesNotContain("DepositModal")
        assertThat(root).contains("onDeposit = { navController.navigateTo(Destinations.WALLET) }")
        assertThat(root).doesNotContain("onWallet")
        assertThat(switcher).contains("DropdownMenu(")
        assertThat(switcher).contains("if (next) onRefresh()")
        assertThat(switcher).contains("if (onSelect(row.currency)) open = false")
        assertThat(switcher).contains("if (onAdd(option.value)) open = false")
        assertThat(switcher).contains("LaunchedEffect(closeKey) { open = false }")
    }

    @Test
    fun dropdownCopyOwnedEmptyAndAddListMatchProduction() {
        assertThat(WalletsCatalog.MY_CURRENCIES).isEqualTo("Мои валюты")
        assertThat(WalletsCatalog.EMPTY_WALLETS).isEqualTo("Нет доступных кошельков")
        assertThat(WalletsCatalog.ADD_CURRENCY_MENU).isEqualTo("+ Добавить валюту")
        val empty = WalletsUiState()
        assertThat(empty.owned).isEmpty()
        assertThat(empty.addable.map { it.value }).containsExactly("TMT", "USD", "TRY", "UZS", "RUB", "KZT").inOrder()
        val ownedTmt = listOf(
            PlayerWalletRow("1", "TMTM", "Манат", "10.38", isActive = true),
            PlayerWalletRow("2", "USD", "Доллар США", "25.00", isActive = false),
        )
        assertThat(WalletsCatalog.rowLabel(ownedTmt[0])).isEqualTo("✓ TMT")
        assertThat(WalletsCatalog.rowLabel(ownedTmt[1])).isEqualTo("  USD")
        assertThat(WalletsCatalog.displayCurrency("TMTM")).isEqualTo("TMT")
        assertThat(WalletsCatalog.addable(ownedTmt).map { it.value }).containsExactly("TRY", "UZS", "RUB", "KZT").inOrder()
        assertThat(WalletsCatalog.addable(ownedTmt).map { it.label }).doesNotContain("TMT — Манат")
        assertThat(WalletsCatalog.addable(ownedTmt).map { it.label }).doesNotContain("USD — Доллар США")
    }

    @Test
    fun headerBalanceUsesActiveOwnedWalletWithoutFabricating() {
        val fallback = "— TMTM"
        val empty = WalletsUiState()
        assertThat(WalletsCatalog.headerBalanceLabel(fallback, empty)).isEqualTo(fallback)
        val state = WalletsUiState(
            owned = listOf(
                PlayerWalletRow("1", "USD", "Доллар США", "25.00", isActive = false),
                PlayerWalletRow("2", "TMTM", "Манат", "10.38", isActive = true),
            ),
        )
        assertThat(WalletsCatalog.headerBalanceLabel(fallback, state)).isEqualTo("10.38 TMT")
    }

    @Test
    fun openRefreshAndSuccessfulMutationsCloseMenuContract() {
        val repo = RecordingWalletsRepository()
        val vm = WalletsViewModel(repo)
        val readsBefore = repo.ownedReads
        vm.refresh()
        assertThat(repo.ownedReads).isGreaterThan(readsBefore)
        assertThat(vm.activate("TMT")).isFalse()
        assertThat(vm.uiState.value.notice).isEqualTo(WalletsCatalog.SESSION_UNAVAILABLE)
        vm.consumeNotice()

        val live = RecordingWalletsRepository(failClosed = false)
        live.rows += PlayerWalletRow("1", "TMTM", "Манат", "10.38", isActive = false)
        val successVm = WalletsViewModel(live)
        assertThat(successVm.activate("TMT")).isTrue()
        assertThat(successVm.uiState.value.notice).isNull()
        assertThat(successVm.uiState.value.owned.single().isActive).isTrue()
        assertThat(successVm.addCurrency("USD")).isTrue()
        assertThat(successVm.uiState.value.owned.map { WalletsCatalog.displayCurrency(it.currency) })
            .containsExactly("TMT", "USD")
        assertThat(successVm.uiState.value.addable.map { it.value }).doesNotContain("TMT")
        assertThat(successVm.uiState.value.addable.map { it.value }).doesNotContain("USD")
    }

    @Test
    fun sharedShellViewModelIsPassedToHeaderAndWalletsScreen() {
        val root = moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText()
        assertThat(root).contains("val walletsViewModel: WalletsViewModel = viewModel(factory = WalletsViewModel.Factory)")
        assertThat(root).contains("walletsState = walletsState")
        assertThat(root).contains("onRefreshWallets = walletsViewModel::refresh")
        assertThat(root).contains("onSelectWallet = walletsViewModel::activate")
        assertThat(root).contains("onAddWallet = walletsViewModel::addCurrency")
        assertThat(root).contains("viewModel = walletsViewModel")
        assertThat(root).contains("WalletsCatalog.headerBalanceLabel")
        assertThat(Destinations.WALLET).isEqualTo("wallet")
    }

    private class RecordingWalletsRepository(
        private val failClosed: Boolean = true,
    ) : com.nextpari.app.feature.wallets.WalletsRepository {
        val rows = mutableListOf<PlayerWalletRow>()
        var ownedReads = 0
        override fun ownedWallets(): List<PlayerWalletRow> {
            ownedReads++
            return rows.toList()
        }

        override fun addWallet(currency: String): Result<Unit> {
            if (failClosed) return Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
            val display = WalletsCatalog.displayCurrency(currency)
            if (rows.none { WalletsCatalog.displayCurrency(it.currency) == display }) {
                rows += PlayerWalletRow("w-${rows.size}", currency, display, "0", isActive = false)
            }
            return Result.success(Unit)
        }

        override fun setActiveWallet(currency: String): Result<Unit> {
            if (failClosed) return Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
            val display = WalletsCatalog.displayCurrency(currency)
            rows.replaceAll { it.copy(isActive = WalletsCatalog.displayCurrency(it.currency) == display) }
            return Result.success(Unit)
        }
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
