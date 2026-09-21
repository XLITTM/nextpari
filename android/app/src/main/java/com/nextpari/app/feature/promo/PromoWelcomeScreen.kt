package com.nextpari.app.feature.promo

import androidx.compose.runtime.Composable

@Composable
fun PromoWelcomeScreen(onBack: () -> Unit) {
    PromoArticleHost(PromoCatalog.welcome, onBack)
}
