package com.nextpari.app.feature.wallet

import com.nextpari.app.core.player.PlayerStateStore
import com.nextpari.app.core.player.formatServerBalance
import com.nextpari.app.core.player.isPlayerProfileComplete

class RemoteWalletRepository(
    private val store: PlayerStateStore,
) : WalletRepository {
    override fun snapshot(): WalletSnapshot {
        val me = store.me()
        if (me == null) {
            return WalletSnapshot(
                displayBalance = WalletCatalog.UNAVAILABLE_BALANCE,
                currency = WalletCatalog.CURRENCY,
            )
        }
        return WalletSnapshot(
            displayBalance = formatServerBalance(me.wallet.balance),
            currency = me.wallet.currency,
        )
    }

    override fun publicId(): String = store.me()?.playerPublicId.orEmpty()

    override fun availableAmount(): Double? = store.me()?.wallet?.balance

    override fun profileComplete(): Boolean {
        val profile = store.me()?.profile ?: return false
        return isPlayerProfileComplete(profile)
    }

    override fun withdrawals(): List<WithdrawalUiModel> = emptyList()

    override fun payoutDestinations(): List<PayoutDestinationUiModel> = emptyList()

    override fun quoteTargets(): List<UsdtQuoteTarget> = emptyList()
}
