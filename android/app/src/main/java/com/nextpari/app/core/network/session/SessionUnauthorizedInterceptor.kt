package com.nextpari.app.core.network.session

import okhttp3.Interceptor
import okhttp3.Response

fun interface SessionUnauthorizedHandler {
    fun onUnauthorized()
}

class SessionUnauthorizedInterceptor(
    private val handler: SessionUnauthorizedHandler,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        val path = response.request.url.encodedPath
        if ((response.code == 401 || response.code == 403) && !isAuthAttempt(path)) {
            handler.onUnauthorized()
        }
        return response
    }

    private fun isAuthAttempt(path: String): Boolean {
        return path.endsWith("/api/player/auth/login") ||
            path.endsWith("/api/player/auth/register") ||
            path.contains("/api/player/password-recovery/")
    }
}
