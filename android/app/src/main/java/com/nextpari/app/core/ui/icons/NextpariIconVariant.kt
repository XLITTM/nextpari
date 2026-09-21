package com.nextpari.app.core.ui.icons

/**
 * Reversible icon pack switch for the Android client.
 *
 * Default is Premium. To restore the previous Material/vector look without
 * reverting screens or product work, change [NextpariIconConfig.defaultVariant]
 * to [NextpariIconVariant.Legacy] in this file.
 *
 * One-line rollback:
 * `val defaultVariant = NextpariIconVariant.Legacy`
 */
enum class NextpariIconVariant {
    Legacy,
    Premium,
}

object NextpariIconConfig {
    val defaultVariant: NextpariIconVariant = NextpariIconVariant.Premium
}
