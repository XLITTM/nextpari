package com.nextpari.app.feature.promo

import androidx.compose.runtime.Composable

@Composable
fun PromoMarathonScreen(onBack: () -> Unit) {
    PromoArticleHost(PromoCatalog.marathon, onBack)
}
