package com.nextpari.app.core.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun LoadingState(
    message: String = "Загрузка...",
    modifier: Modifier = Modifier,
) {
    val colors = NextpariTheme.colors
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = colors.accent)
            Text(text = message, color = colors.textSecondary, modifier = Modifier.padding(top = 12.dp))
        }
    }
}
