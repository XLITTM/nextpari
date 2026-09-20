package com.nextpari.app.feature.wallets

interface WalletsRepository {
    fun ownedWallets(): List<PlayerWalletRow>
    fun addWallet(currency: String): Result<Unit>
    fun setActiveWallet(currency: String): Result<Unit>
}

class FakeWalletsRepository : WalletsRepository {
    override fun ownedWallets(): List<PlayerWalletRow> = emptyList()

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
