package com.nextpari.app.core.network

import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface PlayerApi {
    @POST("api/player/auth/login")
    suspend fun login(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/auth/register")
    suspend fun register(@Body body: JsonObject): Response<JsonObject>

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

    @POST("api/player/wallets/add")
    suspend fun addWallet(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/wallets/active")
    suspend fun setActiveWallet(@Body body: JsonObject): Response<JsonObject>

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

    @PUT("api/player/profile")
    suspend fun updateProfile(@Body body: JsonObject): Response<JsonObject>

    @GET("api/player/personal-data")
    suspend fun personalData(): Response<JsonObject>

    @PUT("api/player/personal-data")
    suspend fun savePersonalData(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/auth/change-password")
    suspend fun changePassword(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/email/start")
    suspend fun startEmail(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/email/verify")
    suspend fun verifyEmail(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/password-recovery/start")
    suspend fun startPasswordRecovery(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/password-recovery/verify")
    suspend fun verifyPasswordRecovery(@Body body: JsonObject): Response<JsonObject>

    @POST("api/player/password-recovery/reset")
    suspend fun resetPassword(@Body body: JsonObject): Response<JsonObject>

    @GET("api/player/withdrawals")
    suspend fun withdrawals(): Response<JsonObject>

    @POST("api/player/withdrawals")
    suspend fun createWithdrawal(@Body body: JsonObject): Response<JsonObject>

    @GET("api/player/payout-destinations")
    suspend fun payoutDestinations(): Response<JsonObject>

    @GET("api/player/crypto/usdt-targets")
    suspend fun usdtTargets(): Response<JsonObject>

    @POST("api/player/crypto/usdt-quote")
    suspend fun usdtQuote(@Body body: JsonObject): Response<JsonObject>

    @GET("api/player/sports/bets")
    suspend fun sportsBets(): Response<JsonObject>
}
