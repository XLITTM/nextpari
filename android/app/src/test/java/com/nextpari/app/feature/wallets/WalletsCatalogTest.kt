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
        assertThat(WalletsCatalog.ADD_CURRENCY_MENU).isEqualTo("+ Добавить валюту")
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
    fun canonicalDisplayNamesIgnoreServerMojibake() {
        assertThat(WalletsCatalog.displayNameRu("TMT")).isEqualTo("Манат")
        assertThat(WalletsCatalog.displayNameRu("TMTM")).isEqualTo("Манат")
        assertThat(WalletsCatalog.displayNameRu("USD")).isEqualTo("Доллар США")
        assertThat(WalletsCatalog.displayNameRu("TRY")).isEqualTo("Турецкая лира")
        assertThat(WalletsCatalog.displayNameRu("UZS")).isEqualTo("Узбекский сум")
        assertThat(WalletsCatalog.displayNameRu("RUB")).isEqualTo("Российский рубль")
        assertThat(WalletsCatalog.displayNameRu("KZT")).isEqualTo("Казахстанский тенге")
        val mapped = com.nextpari.app.core.player.mappedWalletsToRows(
            listOf(
                com.nextpari.app.core.player.MappedWalletRow(
                    walletId = "w-tmt",
                    currency = "TMTM",
                    availableBalance = 10.38,
                    lockedBalance = 0.0,
                    isActive = true,
                    displayNameRu = "ÐœÐ°Ð½Ð°Ñ‚",
                ),
            ),
        )
        assertThat(mapped).hasSize(1)
        assertThat(mapped[0].displayNameRu).isEqualTo("Манат")
        assertThat(mapped[0].displayNameRu).isNotEqualTo("ÐœÐ°Ð½Ð°Ñ‚")
        assertThat(mapped[0].walletId).isEqualTo("w-tmt")
        assertThat(mapped[0].availableBalance).isEqualTo("10.38")
        assertThat(mapped[0].isActive).isTrue()
        assertThat(mapped[0].currency).isEqualTo("TMT")
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
        assertThat(vm.activate("TMT")).isFalse()

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
        val switcher = moduleFile("src/main/java/com/nextpari/app/core/ui/components/HeaderWalletSwitcher.kt").readText()
        assertThat(switcher).doesNotContain("/api/player/wallets")
        assertThat(switcher).doesNotContain("fetchPlayerWallets")
        assertThat(switcher).doesNotContain("Supabase")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
