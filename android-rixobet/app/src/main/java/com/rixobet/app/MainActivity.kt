package com.rixobet.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.rixobet.app.domain.FixtureMode
import com.rixobet.app.domain.LocalPrefsRepository
import com.rixobet.app.domain.ThemeMode
import com.rixobet.app.ui.RixoRoot
import java.io.File

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val repository = LocalPrefsRepository(File(filesDir, "rixo_prefs.txt"))
        val startKey = if (BuildConfig.DEBUG) intent?.getStringExtra("screen") else null
        val startTheme = if (BuildConfig.DEBUG) {
            when (intent?.getStringExtra("theme")) {
                "light" -> ThemeMode.WhiteEmerald
                "dark" -> ThemeMode.DarkVip
                else -> null
            }
        } else {
            null
        }
        val mode = if (BuildConfig.DEBUG) FixtureMode.Demo else FixtureMode.Unavailable
        setContent {
            RixoRoot(
                repository = repository,
                mode = mode,
                startKey = startKey,
                startTheme = startTheme,
            )
        }
    }
}
