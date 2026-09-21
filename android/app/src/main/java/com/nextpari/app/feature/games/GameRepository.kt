package com.nextpari.app.feature.games

data class PlayerGameRound(
    val ok: Boolean,
    val isDuplicate: Boolean,
    val roundId: String,
    val gameCode: String,
    val state: String,
    val stake: Double,
    val totalStake: Double,
    val payout: Double,
    val balanceAfter: Double,
    val serverSeedHash: String,
    val serverSeed: String?,
    val nonce: Long,
    val sessionId: String?,
    val mathVersion: String?,
    val publicResult: Map<String, String>,
    val allowedActions: List<String>,
    val createdAt: String?,
    val settledAt: String?,
)

class PlayerGameException(
    val code: String,
    val status: Int,
) : Exception(code)

interface GameRepository {
    suspend fun startGame(
        gameCode: String,
        stake: Double,
        idempotencyKey: String = newGameIdempotencyKey(),
        options: Map<String, String> = emptyMap(),
    ): PlayerGameRound

    suspend fun gameAction(
        roundId: String,
        action: String,
        idempotencyKey: String = newGameIdempotencyKey(),
        options: Map<String, String> = emptyMap(),
    ): PlayerGameRound

    suspend fun getGameRound(roundId: String): PlayerGameRound

    suspend fun getAviatorSession(): Map<String, String>
}

fun newGameIdempotencyKey(): String = java.util.UUID.randomUUID().toString()
