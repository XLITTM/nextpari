package com.nextpari.app.feature.games

import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.player.PlayerJsonMapper
import com.nextpari.app.core.player.bool
import com.nextpari.app.core.player.num
import com.nextpari.app.core.player.obj
import com.nextpari.app.core.player.optionalStr
import com.nextpari.app.core.player.str
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import retrofit2.Response

class RemoteGameRepository(
    private val api: PlayerApi,
    private val json: Json,
) : GameRepository {
    override suspend fun startGame(
        gameCode: String,
        stake: Double,
        idempotencyKey: String,
        options: Map<String, String>,
    ): PlayerGameRound {
        val response = api.startGame(
            buildJsonObject {
                put("gameCode", gameCode)
                put("stake", stake)
                put("idempotencyKey", idempotencyKey)
                putJsonObject("options") {
                    options.forEach { (key, value) -> put(key, value) }
                }
            },
        )
        return mapRound(response)
    }

    override suspend fun gameAction(
        roundId: String,
        action: String,
        idempotencyKey: String,
        options: Map<String, String>,
    ): PlayerGameRound {
        val response = api.gameAction(
            roundId,
            buildJsonObject {
                put("action", action)
                put("idempotencyKey", idempotencyKey)
                putJsonObject("options") {
                    options.forEach { (key, value) -> put(key, value) }
                }
            },
        )
        return mapRound(response)
    }

    override suspend fun getGameRound(roundId: String): PlayerGameRound {
        return mapRound(api.getGameRound(roundId))
    }

    override suspend fun getAviatorSession(): Map<String, String> {
        val response = api.getAviatorSession()
        val body = response.jsonBody(json)
        if (!response.isSuccessful || body?.bool("ok") == false) {
            throw PlayerGameException(PlayerJsonMapper.errorCode(body).ifBlank { "GAME_RPC_FAILED" }, response.code())
        }
        return body?.mapValues { (_, value) -> value.toString().trim('"') } ?: emptyMap()
    }

    private fun mapRound(response: Response<JsonObject>): PlayerGameRound {
        val body = response.jsonBody(json)
        if (!response.isSuccessful) {
            throw PlayerGameException(PlayerJsonMapper.errorCode(body).ifBlank { "GAME_RPC_FAILED" }, response.code())
        }
        val source = body ?: throw PlayerGameException("GAME_RPC_FAILED", response.code())
        val roundId = source.str("roundId", "round_id")
        val balanceAfter = source.num("balanceAfter", "balance_after")
        if (roundId.isBlank() || source.bool("ok") == false || balanceAfter == null) {
            throw PlayerGameException(PlayerJsonMapper.errorCode(source).ifBlank { "GAME_RPC_FAILED" }, 500)
        }
        val publicResult = source.obj("publicResult") ?: source.obj("public_result")
        return PlayerGameRound(
            ok = true,
            isDuplicate = source.bool("isDuplicate") == true || source.bool("is_duplicate") == true,
            roundId = roundId,
            gameCode = source.str("gameCode", "game_code"),
            state = source.str("state"),
            stake = source.num("stake") ?: 0.0,
            totalStake = source.num("totalStake", "total_stake") ?: 0.0,
            payout = source.num("payout") ?: 0.0,
            balanceAfter = balanceAfter,
            serverSeedHash = source.str("serverSeedHash", "server_seed_hash"),
            serverSeed = source.optionalStr("serverSeed") ?: source.optionalStr("server_seed"),
            nonce = source.num("nonce")?.toLong() ?: 0L,
            sessionId = source.optionalStr("sessionId") ?: source.optionalStr("session_id"),
            mathVersion = source.optionalStr("mathVersion") ?: source.optionalStr("math_version"),
            publicResult = publicResult?.mapValues { (_, value) ->
                value.jsonPrimitive.contentOrNull ?: value.toString()
            } ?: emptyMap(),
            allowedActions = ((source["allowedActions"] ?: source["allowed_actions"]) as? JsonArray)
                ?.map { it.jsonPrimitive.contentOrNull ?: it.toString() }
                ?: emptyList(),
            createdAt = source.optionalStr("createdAt") ?: source.optionalStr("created_at"),
            settledAt = source.optionalStr("settledAt") ?: source.optionalStr("settled_at"),
        )
    }
}

private fun Response<JsonObject>.jsonBody(json: Json): JsonObject? {
    body()?.let { return it }
    val raw = errorBody()?.string().orEmpty()
    if (raw.isBlank()) return null
    return runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull()
}
