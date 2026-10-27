package com.nextpari.app.feature.games

import com.nextpari.app.R

internal fun gemArt(kind: String): Int = when (kind) {
    "cyan" -> R.drawable.game_gem_cyan
    "blue" -> R.drawable.game_gem_blue
    "red" -> R.drawable.game_gem_red
    "purple" -> R.drawable.game_gem_purple
    "orange" -> R.drawable.game_gem_orange
    "coin" -> R.drawable.game_gem_coin
    else -> R.drawable.game_gem_green
}

internal fun pharaohArt(id: String): Int = when (id) {
    "cat" -> R.drawable.game_pharaoh_cat
    "scroll" -> R.drawable.game_pharaoh_scroll
    "nemes" -> R.drawable.game_pharaoh_nemes
    "pyramid" -> R.drawable.game_pharaoh_pyramid
    "ring" -> R.drawable.game_pharaoh_ring
    "ankh" -> R.drawable.game_pharaoh_ankh
    "canopic" -> R.drawable.game_pharaoh_canopic
    "lotus" -> R.drawable.game_pharaoh_lotus
    "cylinder" -> R.drawable.game_pharaoh_cylinder
    "harp" -> R.drawable.game_pharaoh_harp
    else -> R.drawable.game_pharaoh_sistrum
}

internal fun formatMultiplierLabel(raw: String): String {
    val value = raw.toDoubleOrNull() ?: return "x$raw"
    return if (value >= 100.0) "x${value.toInt()}" else "x${String.format(java.util.Locale.US, "%.2f", value)}"
}

internal fun adjustedStake(raw: String, op: String, min: Double, available: Double?, add: Double = 0.0): String {
    val current = parseStake(raw).takeIf { it > 0.0 } ?: min
    val next = when (op) {
        "min" -> min
        "x2" -> current * 2.0
        "half" -> current / 2.0
        "max" -> available ?: return raw
        "add" -> current + add
        else -> current
    }
    val limited = if (available != null && available > 0.0) kotlin.math.min(next, available) else next
    val floored = kotlin.math.max(min, kotlin.math.round(limited * 100.0) / 100.0)
    val rounded = kotlin.math.round(floored * 100.0) / 100.0
    return if (rounded % 1.0 == 0.0) rounded.toInt().toString() else String.format(java.util.Locale.US, "%.2f", rounded)
}
