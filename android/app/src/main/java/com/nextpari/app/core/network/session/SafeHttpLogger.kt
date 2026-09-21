package com.nextpari.app.core.network.session

import android.util.Log
import okhttp3.Interceptor
import okhttp3.Response

/**
 * BASIC-equivalent logging that never prints Cookie / Set-Cookie values.
 */
class SafeHttpLogger(
    private val enabled: Boolean,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (enabled) {
            Log.d(TAG, "${request.method} ${request.url.encodedPath}")
        }
        val response = chain.proceed(request)
        if (enabled) {
            Log.d(TAG, "${response.code} ${request.url.encodedPath}")
        }
        return response
    }

    companion object {
        private const val TAG = "NextpariHttp"
    }
}
