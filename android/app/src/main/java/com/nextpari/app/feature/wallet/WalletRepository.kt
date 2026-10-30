package com.nextpari.app.feature.wallet

data class WithdrawalSubmission(
    val method: String,
    val methodLabel: String,
    val amount: Double,
    val destinationRef: String,
    val city: String,
    val point: String,
    val payoutDestinationId: String,
    val idempotencyKey: String,
)

data class WalletFinancials(
    val withdrawals: List<WithdrawalUiModel> = emptyList(),
    val destinations: List<PayoutDestinationUiModel> = emptyList(),
    val quoteTargets: List<UsdtQuoteTarget> = emptyList(),
    val destinationsError: String = "",
    val withdrawalsError: String = "",
)

interface WalletRepository {
    fun snapshot(): WalletSnapshot
    fun publicId(): String
    fun availableAmount(): Double?
    fun profileComplete(): Boolean
    fun withdrawals(): List<WithdrawalUiModel>
    fun payoutDestinations(): List<PayoutDestinationUiModel>
    fun quoteTargets(): List<UsdtQuoteTarget>
    suspend fun loadFinancials(): WalletFinancials
    suspend fun submitWithdrawal(submission: WithdrawalSubmission): Result<WithdrawalUiModel>
    suspend fun quoteUsdt(sourceAmount: String, walletId: String): Result<String>
}

class FakeWalletRepository : WalletRepository {
    override fun snapshot(): WalletSnapshot = WalletSnapshot(
        displayBalance = WalletCatalog.UNAVAILABLE_BALANCE,
        currency = WalletCatalog.CURRENCY,
    )

    override fun publicId(): String = ""

    override fun availableAmount(): Double? = null

    override fun profileComplete(): Boolean = false

    override fun withdrawals(): List<WithdrawalUiModel> = emptyList()

    override fun payoutDestinations(): List<PayoutDestinationUiModel> = emptyList()

    override fun quoteTargets(): List<UsdtQuoteTarget> = emptyList()

    override suspend fun loadFinancials(): WalletFinancials = WalletFinancials()

    override suspend fun submitWithdrawal(submission: WithdrawalSubmission): Result<WithdrawalUiModel> =
        Result.failure(IllegalStateException(WalletCatalog.SESSION_UNAVAILABLE))

    override suspend fun quoteUsdt(sourceAmount: String, walletId: String): Result<String> =
        Result.failure(IllegalStateException(WalletCatalog.SESSION_UNAVAILABLE))
}
