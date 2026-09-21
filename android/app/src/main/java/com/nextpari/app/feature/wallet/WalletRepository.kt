package com.nextpari.app.feature.wallet

data class WalletSnapshot(
    val displayBalance: String,
    val currency: String,
    val note: String,
)

data class MockTransaction(
    val id: String,
    val title: String,
    val amount: String,
    val status: String,
)

interface WalletRepository {
    fun snapshot(): WalletSnapshot
    fun mockTransactions(): List<MockTransaction>
}

class FakeWalletRepository : WalletRepository {
    override fun snapshot(): WalletSnapshot = WalletSnapshot(
        displayBalance = "—",
        currency = "TMTM",
        note = "Баланс придёт с Nextpari backend. Клиент не считает деньги.",
    )

    override fun mockTransactions(): List<MockTransaction> = listOf(
        MockTransaction("m1", "Пополнение (mock)", "+100.00", "placeholder"),
        MockTransaction("m2", "Вывод (mock)", "−40.00", "placeholder"),
    )
}
