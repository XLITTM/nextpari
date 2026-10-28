package com.nextpari.app.feature.games.web

import com.nextpari.app.core.network.session.PlayerCookieNames
import okhttp3.Cookie

interface WebCookieStore {
    fun set(url: String, line: String)
    fun flush()
}

object WebSessionBridge {
    @Volatile
    var store: WebCookieStore = NoopWebCookieStore

    fun install(cookieStore: WebCookieStore) {
        store = cookieStore
    }

    fun clear() {
        PlayerCookieNames.sessionCookies.forEach { name ->
            store.set(GameWebPolicy.ORIGIN, expiredLine(name))
        }
        store.flush()
    }

    fun handoff(
        cookies: List<Cookie>,
        authenticated: Boolean,
        playerPublicId: String,
        walletCurrency: String,
    ): WebSessionHandoff {
        if (!authenticated || playerPublicId.isBlank() || walletCurrency.isBlank()) {
            return WebSessionHandoff(false, "Сессия не подтверждена", emptyList())
        }
        val lines = cookies.mapNotNull(::sessionLine)
        val names = lines.map { it.substringBefore('=') }
        if (PlayerCookieNames.ACCESS !in names && PlayerCookieNames.REFRESH !in names) {
            return WebSessionHandoff(false, "Сессия не подтверждена", emptyList())
        }
        clear()
        lines.forEach { line -> store.set(GameWebPolicy.ORIGIN, line) }
        store.flush()
        return WebSessionHandoff(true, "", names)
    }
}

data class WebSessionHandoff(
    val accepted: Boolean,
    val reason: String,
    val cookieNames: List<String>,
)

private object NoopWebCookieStore : WebCookieStore {
    override fun set(url: String, line: String) = Unit
    override fun flush() = Unit
}

internal fun sessionLine(cookie: Cookie): String? {
    if (cookie.name !in PlayerCookieNames.sessionCookies) return null
    if (!cookie.secure || !cookie.httpOnly) return null
    if (!cookie.domain.equals(GameWebPolicy.HOST, ignoreCase = true)) return null
    if (cookie.path != "/") return null
    if (cookie.value.isBlank() || cookie.value.any { it == ';' || it == '\n' || it == '\r' || it.isWhitespace() }) return null
    val maxAge = ((cookie.expiresAt - System.currentTimeMillis()) / 1000L).coerceAtLeast(0L)
    return "${cookie.name}=${cookie.value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=$maxAge"
}

private fun expiredLine(name: String): String =
    "$name=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"
