package com.nextpari.app.core.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun ErrorState(
    message: String,
    modifier: Modifier = Modifier,
    retryLabel: String = "Повторить",
    onRetry: (() -> Unit)? = null,
) {
    val colors = NextpariTheme.colors
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = message, color = colors.danger, textAlign = TextAlign.Center)
        if (onRetry != null) {
            NextpariButton(text = retryLabel, onClick = onRetry, modifier = Modifier.padding(top = 12.dp))
        }
    }
}
