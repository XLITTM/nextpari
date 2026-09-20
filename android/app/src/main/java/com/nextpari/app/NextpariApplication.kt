package com.nextpari.app

import android.app.Application
import com.nextpari.app.core.AppGraph

class NextpariApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppGraph.bindFromApplication(this)
    }
}
