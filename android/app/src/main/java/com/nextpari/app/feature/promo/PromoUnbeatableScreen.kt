package com.nextpari.app.feature.promo

import androidx.compose.runtime.Composable

@Composable
fun PromoUnbeatableScreen(onBack: () -> Unit) {
    PromoArticleHost(PromoCatalog.unbeatable, onBack)
}
