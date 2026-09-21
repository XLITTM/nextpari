package com.nextpari.app.core.network.session

object PlayerCookieNames {
    const val ACCESS = "nextpari_player_access"
    const val REFRESH = "nextpari_player_refresh"
    const val DEVICE = "nextpari_player_device"

    val sessionCookies: Set<String> = setOf(ACCESS, REFRESH, DEVICE)
}
