package com.nextpari.app.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.icons.NextpariIcons
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun PlaceholderScreen(
    title: String,
    onBack: (() -> Unit)? = null,
    message: String = "Этот раздел скоро откроется.",
) {
    val colors = NextpariTheme.colors
    Column(Modifier.fillMaxSize().background(colors.bg)) {
        NextpariTopBar(title, if (onBack != null) NextpariIcons.Back else null, onBack)
        Text(message, color = colors.textMuted, modifier = Modifier.padding(20.dp))
    }
}
