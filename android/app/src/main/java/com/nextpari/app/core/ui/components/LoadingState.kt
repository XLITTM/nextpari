package com.nextpari.app.core.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NpAccent
import com.nextpari.app.core.ui.theme.NpTextSecondary

@Composable
fun LoadingState(
    message: String = "Загрузка...",
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.layout.Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = NpAccent)
            Text(
                text = message,
                color = NpTextSecondary,
                modifier = Modifier.padding(top = 12.dp),
            )
        }
    }
}
