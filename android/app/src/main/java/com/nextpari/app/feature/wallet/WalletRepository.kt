package com.nextpari.app.feature.wallet

interface WalletRepository {
    fun snapshot(): WalletSnapshot
    fun publicId(): String
    fun availableAmount(): Double?
    fun profileComplete(): Boolean
    fun withdrawals(): List<WithdrawalUiModel>
    fun payoutDestinations(): List<PayoutDestinationUiModel>
    fun quoteTargets(): List<UsdtQuoteTarget>
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
}
