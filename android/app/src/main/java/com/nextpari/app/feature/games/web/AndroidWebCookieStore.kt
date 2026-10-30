package com.nextpari.app.feature.games.web

import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class AndroidWebCookieStore : WebCookieStore {
    private val main = Handler(Looper.getMainLooper())

    override fun set(url: String, line: String, onResult: (Boolean) -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            setOnMain(url, line, onResult)
        } else {
            main.post { setOnMain(url, line, onResult) }
        }
    }

    override fun flush() {
        val write = Runnable {
            try {
                CookieManager.getInstance().flush()
            } catch (_: RuntimeException) {
                // A failed flush must not crash the process. The in-memory cookie still gates loading.
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            write.run()
            return
        }
        val done = CountDownLatch(1)
        main.post {
            write.run()
            done.countDown()
        }
        done.await(5, TimeUnit.SECONDS)
    }

    private fun setOnMain(url: String, line: String, onResult: (Boolean) -> Unit) {
        try {
            if (!url.startsWith("https://nextpari.net")) {
                onResult(false)
                return
            }
            val manager = CookieManager.getInstance()
            manager.setAcceptCookie(true)
            manager.setCookie(url, line) { success -> onResult(success == true) }
        } catch (_: RuntimeException) {
            onResult(false)
        }
    }
}
