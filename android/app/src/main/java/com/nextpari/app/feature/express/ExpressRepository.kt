package com.nextpari.app.feature.express

import com.nextpari.app.core.network.PlayerApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

interface ExpressRepository {
    suspend fun published(): List<ExpressOfDay>
    suspend fun validateForCoupon(id: String): Pair<ExpressOfDay?, String?>
}

class EmptyExpressRepository : ExpressRepository {
    override suspend fun published(): List<ExpressOfDay> = emptyList()
    override suspend fun validateForCoupon(id: String): Pair<ExpressOfDay?, String?> =
        null to "Экспресс недоступен."
}

class RemoteExpressRepository(
    private val api: PlayerApi,
    private val json: Json,
) : ExpressRepository {
    override suspend fun published(): List<ExpressOfDay> {
        val response = api.expressOfDay()
        val body = response.body() ?: return emptyList()
        if (!response.isSuccessful) return emptyList()
        return parseExpressList(body)
    }

    override suspend fun validateForCoupon(id: String): Pair<ExpressOfDay?, String?> {
        val response = api.validateExpressCoupon(id, JsonObject(emptyMap()))
        val body = response.body()
        if (response.code() == 409) {
            val error = body?.get("error")?.toString()?.trim('"') ?: "EXPRESS_INVALID"
            val message = when (error) {
                "ODDS_CHANGED" -> "Коэффициенты изменились. Исходы не добавлены в купон."
                "MARKET_SUSPENDED" -> "Рынок приостановлен. Исходы не добавлены в купон."
                "EVENT_UNAVAILABLE", "SELECTION_UNAVAILABLE", "MARKET_UNAVAILABLE" ->
                    "Исход недоступен. Исходы не добавлены в купон."
                "EXPRESS_EXPIRED" -> "Срок экспресса истёк."
                else -> "Нельзя добавить экспресс в купон."
            }
            return null to message
        }
        if (!response.isSuccessful || body == null) return null to "Нельзя добавить экспресс в купон."
        return parseExpress(body["data"] ?: body) to null
    }
}
