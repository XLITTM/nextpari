package com.nextpari.app.core.network.session

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

class SecureCookieJar(
    private val persistence: CookiePersistence,
) : CookieJar {
    private val lock = Any()
    private val store = LinkedHashMap<String, Cookie>()

    init {
        synchronized(lock) {
            persistence.load().forEach { cookie ->
                if (!isExpired(cookie)) store[key(cookie)] = cookie
            }
        }
    }

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        synchronized(lock) {
            cookies.forEach { cookie ->
                val cookieKey = key(cookie)
                if (isExpired(cookie) || cookie.value.isEmpty()) {
                    store.remove(cookieKey)
                } else {
                    store[cookieKey] = cookie
                }
            }
            persistLocked()
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        synchronized(lock) {
            val now = System.currentTimeMillis()
            val expired = store.values.filter { it.expiresAt < now }.map { key(it) }
            expired.forEach(store::remove)
            if (expired.isNotEmpty()) persistLocked()
            return store.values.filter { it.matches(url) }
        }
    }

    fun clear() {
        synchronized(lock) {
            store.clear()
            persistence.clear()
        }
    }

    fun hasPlayerSessionCookies(): Boolean {
        synchronized(lock) {
            val now = System.currentTimeMillis()
            return store.values.any { cookie ->
                cookie.name in PlayerCookieNames.sessionCookies && cookie.expiresAt >= now && cookie.value.isNotBlank()
            }
        }
    }

    fun snapshotNames(): Set<String> {
        synchronized(lock) {
            return store.values.map { it.name }.toSet()
        }
    }

    private fun persistLocked() {
        persistence.save(store.values.toList())
    }

    private fun key(cookie: Cookie): String = "${cookie.domain}|${cookie.path}|${cookie.name}"

    private fun isExpired(cookie: Cookie): Boolean = cookie.expiresAt < System.currentTimeMillis()
}
