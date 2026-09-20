package com.nextpari.app.core.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

val NextpariShapes = Shapes(
    extraSmall = RoundedCornerShape(12.dp),
    small = RoundedCornerShape(NpRadiusControl),
    medium = RoundedCornerShape(NpRadiusCard),
    large = RoundedCornerShape(NpRadiusPanel),
    extraLarge = RoundedCornerShape(32.dp),
)
