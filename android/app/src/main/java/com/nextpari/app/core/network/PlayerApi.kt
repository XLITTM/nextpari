package com.nextpari.app.core.network

import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface PlayerApi {
    @POST("api/player/auth/login")
    suspend fun login(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/auth/logout")
    suspend fun logout(): Response<JsonObject>

    @GET("api/player/me")
    suspend fun me(): Response<JsonObject>

    @GET("api/player/profile")
    suspend fun profile(): Response<JsonObject>

    @GET("api/player/wallet")
    suspend fun wallet(): Response<JsonObject>

    @GET("api/player/wallets")
    suspend fun wallets(): Response<JsonObject>

    @POST("api/player/games/start")
    suspend fun startGame(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/games/{roundId}/action")
    suspend fun gameAction(
        @Path("roundId") roundId: String,
        @Body body: JsonObject,
    ): Response<JsonObject>

    @GET("api/player/games/{roundId}")
    suspend fun getGameRound(@Path("roundId") roundId: String): Response<JsonObject>

    @GET("api/player/games/session/aviator")
    suspend fun getAviatorSession(): Response<JsonObject>
}
