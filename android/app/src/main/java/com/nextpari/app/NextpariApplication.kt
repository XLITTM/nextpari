package com.nextpari.app

import android.app.Application
import com.nextpari.app.core.AppGraph
import com.nextpari.app.feature.games.web.AndroidWebCookieStore
import com.nextpari.app.feature.games.web.WebSessionBridge

class NextpariApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        WebSessionBridge.install(AndroidWebCookieStore())
        AppGraph.bindFromApplication(this)
    }
}
