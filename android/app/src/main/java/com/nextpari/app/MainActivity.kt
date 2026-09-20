package com.nextpari.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.nextpari.app.core.navigation.NextpariRoot
import com.nextpari.app.core.ui.theme.NextpariTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NextpariTheme {
                NextpariRoot()
            }
        }
    }
}
