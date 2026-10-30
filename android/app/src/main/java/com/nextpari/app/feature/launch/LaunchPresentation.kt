package com.nextpari.app.feature.launch

/**
 * Cold-start and signed-out return branding. This does not touch the player session.
 */
internal object LaunchPresentation {
    const val BRAND_MS = 850L

    fun holdSplashOnResume(authenticated: Boolean): Boolean = !authenticated
}
