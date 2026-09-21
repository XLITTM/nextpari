package com.nextpari.app.core.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NpSurface
import com.nextpari.app.core.ui.theme.NpText

@Composable
fun NextpariCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = CardDefaults.cardColors(containerColor = NpSurface, contentColor = NpText)
    val elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    val inner: @Composable ColumnScope.() -> Unit = {
        Column(Modifier.padding(16.dp), content = content)
    }
    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier.fillMaxWidth(),
            colors = colors,
            elevation = elevation,
            content = inner,
        )
    } else {
        Card(
            modifier = modifier.fillMaxWidth(),
            colors = colors,
            elevation = elevation,
            content = inner,
        )
    }
}
