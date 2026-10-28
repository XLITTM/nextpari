package com.nextpari.app.core.network

import com.nextpari.app.core.player.bool
import com.nextpari.app.core.player.str
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import retrofit2.Response

internal sealed class PlayerCallResult {
    data class Ok(val body: JsonObject) : PlayerCallResult()
    data class Rejected(val code: String, val transport: String? = null) : PlayerCallResult()
}

internal suspend fun playerCall(
    json: Json,
    block: suspend () -> Response<JsonObject>,
): PlayerCallResult {
    val response = try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Exception) {
        return PlayerCallResult.Rejected(code = "", transport = ApiErrorMapper.fromThrowable(error).userMessage())
    }
    val body = response.parsedJson(json)
    val code = body?.str("error").orEmpty()
    if (response.code() == 401 || response.code() == 403 || isSessionCode(code)) {
        return PlayerCallResult.Rejected(code.ifBlank { "SESSION_REQUIRED" })
    }
    if (!response.isSuccessful || body == null || body.bool("ok") == false) {
        return PlayerCallResult.Rejected(code.ifBlank { "REQUEST_FAILED" })
    }
    return PlayerCallResult.Ok(body)
}

internal fun isSessionCode(code: String): Boolean = code in SESSION_CODES

private val SESSION_CODES = setOf(
    "JWT_REQUIRED",
    "JWT_INVALID",
    "SESSION_EXPIRED",
    "SESSION_REQUIRED",
    "AUTH_REQUIRED",
    "STAFF_ACCOUNT",
    "PLAYER_ACCOUNT_REQUIRED",
)

private fun Response<JsonObject>.parsedJson(json: Json): JsonObject? {
    body()?.let { return it }
    val raw = errorBody()?.string().orEmpty()
    if (raw.isBlank()) return null
    return runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull()
}
