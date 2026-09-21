package com.nextpari.app.core.network.session

import kotlinx.serialization.Serializable
import okhttp3.Cookie

@Serializable
internal data class PersistedCookie(
    val name: String,
    val value: String,
    val expiresAt: Long,
    val domain: String,
    val path: String,
    val secure: Boolean,
    val httpOnly: Boolean,
    val hostOnly: Boolean,
    val persistent: Boolean,
) {
    fun toCookie(): Cookie? = try {
        val builder = Cookie.Builder()
            .name(name)
            .value(value)
            .expiresAt(expiresAt)
            .path(path)
        if (hostOnly) builder.hostOnlyDomain(domain) else builder.domain(domain)
        if (secure) builder.secure()
        if (httpOnly) builder.httpOnly()
        builder.build()
    } catch (_: IllegalArgumentException) {
        null
    }

    companion object {
        fun from(cookie: Cookie): PersistedCookie = PersistedCookie(
            name = cookie.name,
            value = cookie.value,
            expiresAt = cookie.expiresAt,
            domain = cookie.domain,
            path = cookie.path,
            secure = cookie.secure,
            httpOnly = cookie.httpOnly,
            hostOnly = cookie.hostOnly,
            persistent = cookie.persistent,
        )
    }
}
