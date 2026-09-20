package com.nextpari.app.core.ui.components

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.nextpari.app.core.ui.icons.NextpariGlyph
import com.nextpari.app.core.ui.icons.NextpariIconPalette
import com.nextpari.app.core.ui.theme.NextpariTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NextpariTopBar(
    title: String,
    navigationIcon: ImageVector? = null,
    onNavigationClick: (() -> Unit)? = null,
) {
    val colors = NextpariTheme.colors
    TopAppBar(
        title = { Text(title) },
        navigationIcon = {
            if (navigationIcon != null && onNavigationClick != null) {
                IconButton(onClick = onNavigationClick) {
                    NextpariGlyph(
                        imageVector = navigationIcon,
                        contentDescription = "Назад",
                        tint = NextpariIconPalette.Action.Chevron,
                        size = 24.dp,
                    )
                }
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = colors.bg,
            titleContentColor = colors.text,
            navigationIconContentColor = colors.text,
        ),
    )
}
