package com.nextpari.app.feature.wallets

import com.nextpari.app.core.player.PlayerStateStore

class RemoteWalletsRepository(
    private val store: PlayerStateStore,
) : WalletsRepository {
    override fun ownedWallets(): List<PlayerWalletRow> = store.wallets()

    override fun addWallet(currency: String): Result<Unit> {
        if (WalletsCatalog.storageCurrency(currency) == null) {
            return Result.failure(IllegalArgumentException("Некорректная валюта"))
        }
        return Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
    }

    override fun setActiveWallet(currency: String): Result<Unit> {
        if (WalletsCatalog.storageCurrency(currency) == null) {
            return Result.failure(IllegalArgumentException("Некорректная валюта"))
        }
        return Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
    }
}
