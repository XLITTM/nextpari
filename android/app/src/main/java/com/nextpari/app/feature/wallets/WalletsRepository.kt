package com.nextpari.app.feature.wallets

interface WalletsRepository {
    fun ownedWallets(): List<PlayerWalletRow>
    suspend fun refresh(): Result<Unit> = Result.success(Unit)
    suspend fun addWallet(currency: String): Result<Unit>
    suspend fun setActiveWallet(currency: String): Result<Unit>
}

class FakeWalletsRepository : WalletsRepository {
    override fun ownedWallets(): List<PlayerWalletRow> = emptyList()

    override suspend fun addWallet(currency: String): Result<Unit> {
        if (WalletsCatalog.storageCurrency(currency) == null) {
            return Result.failure(IllegalArgumentException(WalletsCatalog.CURRENCY_INVALID))
        }
        return Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
    }

    override suspend fun setActiveWallet(currency: String): Result<Unit> {
        if (WalletsCatalog.storageCurrency(currency) == null) {
            return Result.failure(IllegalArgumentException(WalletsCatalog.CURRENCY_INVALID))
        }
        return Result.failure(IllegalStateException(WalletsCatalog.SESSION_UNAVAILABLE))
    }
}
