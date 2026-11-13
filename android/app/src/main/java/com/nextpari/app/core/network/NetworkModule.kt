package com.nextpari.app.core.network

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.nextpari.app.BuildConfig
import com.nextpari.app.core.network.session.SafeHttpLogger
import com.nextpari.app.core.network.session.SecureCookieJar
import com.nextpari.app.core.network.session.SessionUnauthorizedHandler
import com.nextpari.app.core.network.session.SessionUnauthorizedInterceptor
import com.nextpari.app.core.network.session.WalletResponseScope
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

object NetworkModule {
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
        encodeDefaults = true
    }

    fun okHttpClient(
        cookieJar: SecureCookieJar? = null,
        unauthorizedHandler: SessionUnauthorizedHandler? = null,
    ): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .addInterceptor { chain ->
                val request = chain.request()
                val url = request.url
                val footballFeed = url.encodedPath == "/api/player/sports/football-feed"
                val isFootballList = footballFeed && url.queryParameter("eventId").isNullOrBlank() &&
                    "oddsFor" !in url.queryParameterNames
                // The list waits for the server's 35-second coverage window. Odds stay on their own budget.
                val timed = when {
                    isFootballList -> chain.withReadTimeout(FOOTBALL_LIST_READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    footballFeed && "oddsFor" in url.queryParameterNames -> chain.withReadTimeout(35, TimeUnit.SECONDS)
                    else -> chain
                }
                timed.proceed(request)
            }
        if (cookieJar != null) {
            builder.cookieJar(cookieJar)
            builder.addNetworkInterceptor { chain ->
                val request = chain.request()
                val response = chain.proceed(request)
                val scope = request.tag(WalletResponseScope::class.java)
                if (scope?.isCurrent() == false) response.newBuilder().removeHeader("Set-Cookie").build() else response
            }
        }
        if (unauthorizedHandler != null) {
            builder.addInterceptor(SessionUnauthorizedInterceptor(unauthorizedHandler))
        }
        builder.addInterceptor(SafeHttpLogger(BuildConfig.DEBUG))
        return builder.build()
    }

    fun retrofit(
        client: OkHttpClient = okHttpClient(),
        baseUrl: String = NextpariConfig.API_BASE_URL,
    ): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }

    fun playerApi(
        client: OkHttpClient,
        baseUrl: String = NextpariConfig.API_BASE_URL,
    ): PlayerApi = retrofit(client, baseUrl).create(PlayerApi::class.java)

    fun apiClient(): NextpariApiClient = RetrofitNextpariApiClient(NextpariConfig.API_BASE_URL)
}

internal const val FOOTBALL_LIST_READ_TIMEOUT_SECONDS = 45
