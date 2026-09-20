package com.nextpari.app.feature.history

data class HistoryBetRow(val id: String, val title: String)
data class HistoryTxRow(val id: String, val title: String, val amount: String)

interface HistoryRepository {
    fun bets(): List<HistoryBetRow>
    fun transactions(): List<HistoryTxRow>
}

class FakeHistoryRepository : HistoryRepository {
    override fun bets(): List<HistoryBetRow> = emptyList()
    override fun transactions(): List<HistoryTxRow> = emptyList()
}
