package com.nextpari.app.feature.wallets

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class WalletsCatalogTest {
    @Test
    fun currenciesMatchProductionOrderAndLabels() {
        assertThat(WalletsCatalog.displayCodes).containsExactly("TMT", "USD", "TRY", "UZS", "RUB", "KZT").inOrder()
        assertThat(WalletsCatalog.displayCurrencies.map { it.label }).containsExactly(
            "TMT — Манат",
            "USD — Доллар США",
            "TRY — Турецкая лира",
            "UZS — Узбекский сум",
            "RUB — Российский рубль",
            "KZT — Казахстанский тенге",
        ).inOrder()
        assertThat(WalletsCatalog.TITLE).isEqualTo("Кошелёк и валюты")
        assertThat(WalletsCatalog.ADD_CURRENCY).isEqualTo("Добавить валюту")
    }

    @Test
    fun tmtMapsToTmtmStorageAndBack() {
        assertThat(WalletsCatalog.displayCurrency("TMTM")).isEqualTo("TMT")
        assertThat(WalletsCatalog.displayCurrency("TMT")).isEqualTo("TMT")
        assertThat(WalletsCatalog.storageCurrency("TMT")).isEqualTo("TMTM")
        assertThat(WalletsCatalog.storageCurrency("TMTM")).isEqualTo("TMTM")
        assertThat(WalletsCatalog.storageCurrency("USD")).isEqualTo("USD")
        assertThat(WalletsCatalog.storageCurrency("EUR")).isNull()
    }

    @Test
    fun emptyRuntimeHasNoFakeBalancesOrProductionNetworking() {
        val repo = FakeWalletsRepository()
        assertThat(repo.ownedWallets()).isEmpty()
        val vm = WalletsViewModel(repo)
        assertThat(vm.uiState.value.owned).isEmpty()
        assertThat(vm.uiState.value.addable.map { it.value }).containsExactly("TMT", "USD", "TRY", "UZS", "RUB", "KZT").inOrder()
        vm.addCurrency("USD")
        assertThat(vm.uiState.value.owned).isEmpty()
        assertThat(vm.uiState.value.notice).isEqualTo(WalletsCatalog.SESSION_UNAVAILABLE)
        vm.consumeNotice()
        vm.activate("TMT")
        assertThat(vm.uiState.value.notice).isEqualTo(WalletsCatalog.SESSION_UNAVAILABLE)

        val sources = listOf(
            "src/main/java/com/nextpari/app/feature/wallets/WalletsScreen.kt",
            "src/main/java/com/nextpari/app/feature/wallets/WalletsViewModel.kt",
            "src/main/java/com/nextpari/app/feature/wallets/WalletsRepository.kt",
            "src/main/java/com/nextpari/app/feature/wallets/WalletsModels.kt",
        ).joinToString("\n") { moduleFile(it).readText() }
        assertThat(sources).doesNotContain("fetchPlayerWallets")
        assertThat(sources).doesNotContain("addPlayerWallet")
        assertThat(sources).doesNotContain("setActivePlayerWallet")
        assertThat(sources).doesNotContain("Supabase")
        assertThat(sources).doesNotContain("service_role")
        assertThat(sources).doesNotContain("1000")
        assertThat(sources).doesNotContain("availableBalance = \"1")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
