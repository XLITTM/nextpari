package com.nextpari.app.core.network.session

import okhttp3.Cookie

class InMemoryCookiePersistence : CookiePersistence {
    private val lock = Any()
    private var cookies: List<Cookie> = emptyList()

    override fun load(): List<Cookie> = synchronized(lock) { cookies.toList() }

    override fun save(cookies: List<Cookie>) {
        synchronized(lock) { this.cookies = cookies.toList() }
    }

    override fun clear() {
        synchronized(lock) { cookies = emptyList() }
    }
}
