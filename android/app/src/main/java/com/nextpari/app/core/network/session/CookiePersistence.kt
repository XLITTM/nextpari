package com.nextpari.app.core.network.session

import okhttp3.Cookie

interface CookiePersistence {
    fun load(): List<Cookie>
    fun save(cookies: List<Cookie>)
    fun clear()
}
