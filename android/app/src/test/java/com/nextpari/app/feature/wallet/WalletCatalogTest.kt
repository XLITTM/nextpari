package com.nextpari.app.feature.wallet

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.navigation.Destinations
import org.junit.Test
import java.io.File

class WalletCatalogTest {
    @Test
    fun productionTitleBalanceActionsAndMethods() {
        assertThat(WalletCatalog.TITLE).isEqualTo("Управление счётом")
        assertThat(WalletCatalog.AVAILABLE_BALANCE).isEqualTo("Доступный баланс")
        assertThat(WalletCatalog.DEPOSIT).isEqualTo("Пополнить")
        assertThat(WalletCatalog.WITHDRAW).isEqualTo("Вывести")
        assertThat(WalletCatalog.methods.map { it.label }).containsExactly(
            "Crypto / Web3",
            "Электронный кошелёк",
            "Наличные (Mobcash)",
        ).inOrder()
        assertThat(WalletCatalog.methods.map { it.id }).containsExactly("crypto", "ewallet", "cash").inOrder()
        assertThat(WalletCatalog.MIN_CASH).isEqualTo(40.00)
        assertThat(WalletCatalog.minCashLabel()).isEqualTo("40.00")
        assertThat(WalletCatalog.historyTabs.map { it.label }).containsExactly(
            "Заявки на вывод",
            "Пополнения",
        ).inOrder()
        assertThat(WalletCatalog.CASHIER_PROPORTION_REJECTION).isEqualTo(
            "Вывод отклонён. Сумма вывода должна быть пропорциональна сумме пополнений через выбранную кассу. Для дополнительной информации обратитесь в поддержку.",
        )
    }

    @Test
    fun withdrawalStatusesAndPinRules() {
        assertThat(WalletCatalog.statuses.map { it.id }).containsExactly(
            "pending", "approved", "paid", "rejected", "cancelled", "expired",
        ).inOrder()
        assertThat(WalletCatalog.statuses.map { it.label }).containsExactly(
            "В обработке", "Одобрено", "Выплачено", "Отклонено", "Отменено", "Истекло",
        ).inOrder()
        val pendingPin = sample(status = WithdrawalStatus.PENDING, pin = "1234567", notice = null)
        assertThat(WalletCatalog.showsPin(pendingPin)).isTrue()
        val underReview = sample(status = WithdrawalStatus.PENDING, pin = "9999999", notice = WalletCatalog.NOTICE_UNDER_REVIEW)
        assertThat(WalletCatalog.showsPin(underReview)).isFalse()
        assertThat(WalletCatalog.showsUnderReview(underReview)).isTrue()
        val rejected = sample(
            status = WithdrawalStatus.REJECTED,
            pin = null,
            notice = WalletCatalog.NOTICE_CASHIER_PROPORTION,
        )
        assertThat(WalletCatalog.rejectionCopy(rejected)).isEqualTo(WalletCatalog.CASHIER_PROPORTION_REJECTION)
        assertThat(WalletCatalog.showsPin(sample(status = WithdrawalStatus.PAID, pin = "111", notice = null))).isFalse()
    }

    @Test
    fun runtimeRepositoryHasNoFakeMoneyHistoryOrCashiers() {
        val repo = FakeWalletRepository()
        assertThat(repo.snapshot().displayBalance).isEqualTo("—")
        assertThat(repo.snapshot().currency).isEqualTo("TMTM")
        assertThat(WalletCatalog.balanceText(repo.snapshot().displayBalance, repo.snapshot().currency)).isEqualTo("— TMTM")
        assertThat(repo.availableAmount()).isNull()
        assertThat(repo.publicId()).isEmpty()
        assertThat(repo.profileComplete()).isFalse()
        assertThat(repo.withdrawals()).isEmpty()
        assertThat(repo.payoutDestinations()).isEmpty()
        assertThat(repo.quoteTargets()).isEmpty()
        assertThat(WalletCatalog.cashDestinationsReady(true, false, "", repo.payoutDestinations())).isFalse()
        assertThat(
            WalletCatalog.cashReady(
                WalletWithdrawMethod.CASH, "40", null, "", "", emptyList(), true, false, "",
            ),
        ).isFalse()
    }

    @Test
    fun cashSubmitStaysFailClosedWithoutServerDestination() {
        val destinations = listOf(PayoutDestinationUiModel("desk-1", "Ашхабад", "Касса 1"))
        assertThat(
            WalletCatalog.cashReady(
                WalletWithdrawMethod.CASH, "40", 100.0, "Ашхабад", "desk-1", destinations, true, false, "",
            ),
        ).isTrue()
        assertThat(
            WalletCatalog.cashReady(
                WalletWithdrawMethod.CASH, "39.99", 100.0, "Ашхабад", "desk-1", destinations, true, false, "",
            ),
        ).isFalse()
        assertThat(
            WalletCatalog.cashReady(
                WalletWithdrawMethod.CASH, "40", 100.0, "Ашхабад", "desk-1", emptyList(), true, false, "",
            ),
        ).isFalse()
        val vm = WalletViewModel(FakeWalletRepository())
        vm.openWithdraw()
        vm.selectWithdrawMethod(WalletWithdrawMethod.CASH)
        vm.updateAmount("50")
        vm.submitWithdraw()
        assertThat(vm.uiState.value.withdrawals).isEmpty()
        assertThat(vm.uiState.value.notice).isEqualTo(WalletCatalog.NO_CASHIERS)
        assertThat(vm.uiState.value.cashDestinations).isEmpty()
    }

    @Test
    fun localValidationAndNoProductionNetworking() {
        val incomplete = WalletUiState(
            balanceLabel = "— TMTM",
            currency = "TMTM",
            publicId = "",
            available = null,
            profileComplete = false,
            loading = false,
            withdrawMethod = WalletWithdrawMethod.CRYPTO,
            amount = "10",
            detail = "TXabc",
        )
        assertThat(WalletActions.validateWithdraw(incomplete)).isNull()
        val vm = WalletViewModel(FakeWalletRepository())
        vm.openWithdraw()
        vm.updateAmount("10")
        vm.updateDetail("TXabc")
        vm.submitWithdraw()
        assertThat(vm.uiState.value.restrictionOpen).isTrue()
        assertThat(vm.uiState.value.withdrawals).isEmpty()
        vm.closeRestriction()
        assertThat(Destinations.PERSONAL_DATA).isEqualTo("personal-data")

        val sources = listOf(
            "src/main/java/com/nextpari/app/feature/wallet/WalletScreen.kt",
            "src/main/java/com/nextpari/app/feature/wallet/WalletViewModel.kt",
            "src/main/java/com/nextpari/app/feature/wallet/WalletRepository.kt",
            "src/main/java/com/nextpari/app/feature/wallet/WalletModels.kt",
        ).joinToString("\n") { moduleFile(it).readText() }
        assertThat(sources).doesNotContain("Supabase")
        assertThat(sources).doesNotContain("service_role")
        assertThat(sources).doesNotContain("wallet_ledger")
        assertThat(sources).doesNotContain("createWithdrawalRequest")
        assertThat(sources).doesNotContain("playerCreateCashPayout")
        assertThat(sources).doesNotContain("MOBCASH_PICKUP_POINTS")
        assertThat(sources).doesNotContain("/api/player/payout-destinations")
        assertThat(WalletCatalog.TITLE).isNotEqualTo("Кошелёк")
        assertThat(sources).doesNotContain("Основной счёт")
        assertThat(sources).doesNotContain("История операций")
        assertThat(sources).doesNotContain("Выберите способ пополнения")
        assertThat(sources).doesNotContain("Оформите заявку на вывод")
        assertThat(sources).contains("Управление счётом")
        assertThat(moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText())
            .contains("onBack = { navController.popBackStack() }")
    }

    @Test
    fun depositModalUsesMaterialBottomSheetAndSystemInsets() {
        val screen = moduleFile("src/main/java/com/nextpari/app/feature/wallet/WalletScreen.kt").readText()
        val deposit = screen.substringAfter("private fun DepositModal").substringBefore("private fun RestrictionModal")
        assertThat(deposit).contains("ModalBottomSheet(")
        assertThat(deposit).contains("rememberModalBottomSheetState(skipPartiallyExpanded = true)")
        assertThat(deposit).contains("verticalScroll(rememberScrollState())")
        assertThat(deposit).contains("contentWindowInsets")
        assertThat(deposit).contains("WindowInsets.navigationBars.union(WindowInsets.ime)")
        assertThat(deposit).contains("windowInsetsBottomHeight")
        assertThat(deposit).contains("WalletCatalog.OPEN_WALLET")
        assertThat(deposit.indexOf("verticalScroll")).isLessThan(deposit.lastIndexOf("WalletCatalog.OPEN_WALLET"))
        assertThat(deposit.lastIndexOf("WalletCatalog.OPEN_WALLET")).isLessThan(deposit.indexOf("windowInsetsBottomHeight"))
        assertThat(deposit).doesNotContain("Dialog(")
        assertThat(deposit).doesNotContain("BoxWithConstraints")
        assertThat(deposit).doesNotContain("offset(")
        assertThat(deposit).doesNotContain("padding(bottom = 48")
        assertThat(deposit).doesNotContain("padding(bottom = 32")
        val restriction = screen.substringAfter("private fun RestrictionModal")
        assertThat(restriction).contains("ModalBottomSheet(")
        assertThat(restriction).contains("windowInsetsBottomHeight")
        assertThat(restriction).doesNotContain("Dialog(")
    }

    private fun sample(
        status: WithdrawalStatus,
        pin: String?,
        notice: String?,
    ): WithdrawalUiModel = WithdrawalUiModel(
        id = "w1",
        method = "cash",
        methodLabel = "Наличные (Mobcash)",
        amount = 40.0,
        status = status,
        createdAt = "01.01.2026, 12:00",
        pinCode = pin,
        playerNoticeCode = notice,
    )

    private fun moduleFile(relative: String): File {
        val candidates = listOf(
            File(relative),
            File("app/$relative"),
            File("android/app/$relative"),
        )
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
