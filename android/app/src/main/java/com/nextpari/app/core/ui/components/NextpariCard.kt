package com.nextpari.app.core.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.theme.NextpariTheme
import com.nextpari.app.core.ui.theme.NpRadiusCard

@Composable
fun NextpariCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = NextpariTheme.colors
    val cardColors = CardDefaults.cardColors(containerColor = colors.surface, contentColor = colors.text)
    val elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    val shape = RoundedCornerShape(NpRadiusCard)
    val inner: @Composable ColumnScope.() -> Unit = {
        Column(Modifier.padding(16.dp), content = content)
    }
    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier.fillMaxWidth(),
            colors = cardColors,
            elevation = elevation,
            shape = shape,
            content = inner,
        )
    } else {
        Card(
            modifier = modifier.fillMaxWidth(),
            colors = cardColors,
            elevation = elevation,
            shape = shape,
            content = inner,
        )
    }
}
