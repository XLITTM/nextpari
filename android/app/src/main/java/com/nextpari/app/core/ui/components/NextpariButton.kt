package com.nextpari.app.core.ui.components

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NpAccent
import com.nextpari.app.core.ui.theme.NpAccentInk

@Composable
fun NextpariButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .fillMaxWidth()
            .height(56.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = NpAccent,
            contentColor = NpAccentInk,
            disabledContainerColor = NpAccent.copy(alpha = 0.35f),
            disabledContentColor = NpAccentInk.copy(alpha = 0.6f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        Text(text = text, style = androidx.compose.material3.MaterialTheme.typography.labelLarge)
    }
}
