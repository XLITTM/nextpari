package com.nextpari.app.feature.games.web

import android.webkit.CookieManager

class AndroidWebCookieStore : WebCookieStore {
    override fun set(url: String, line: String) {
        if (!url.startsWith("https://nextpari.net")) return
        val manager = CookieManager.getInstance()
        manager.setAcceptCookie(true)
        manager.setCookie(url, line)
    }

    override fun flush() {
        CookieManager.getInstance().flush()
    }
}
