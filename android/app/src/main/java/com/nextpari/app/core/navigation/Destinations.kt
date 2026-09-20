package com.nextpari.app.core.navigation

object Destinations {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val REGISTER_EMAIL = "register/email"
    const val REGISTER_PHONE = "register/phone"
    const val REGISTER_ONE_CLICK = "register/one-click"

    const val HOME = "home"
    const val WALLET = "wallet"
    const val HISTORY = "history"
    const val PROFILE = "profile"
    const val SETTINGS = "settings"

    val unauthenticated = listOf(
        LOGIN,
        REGISTER,
        REGISTER_EMAIL,
        REGISTER_PHONE,
        REGISTER_ONE_CLICK,
    )

    val authenticatedTabs = listOf(HOME, WALLET, HISTORY, PROFILE)

    val authenticated = authenticatedTabs + SETTINGS

    fun isUnauthenticated(route: String): Boolean = unauthenticated.contains(route)

    fun isAuthenticatedTab(route: String): Boolean = authenticatedTabs.contains(route)
}
