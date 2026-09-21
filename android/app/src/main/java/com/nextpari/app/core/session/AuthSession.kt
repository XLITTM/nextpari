package com.nextpari.app.core.session

data class AuthSession(
    val playerPublicId: String,
    val displayName: String,
    val loginMethod: String,
    val isAuthenticated: Boolean,
    val email: String = "",
) {
    companion object {
        val Anonymous = AuthSession(
            playerPublicId = "",
            displayName = "",
            loginMethod = "",
            isAuthenticated = false,
            email = "",
        )
    }
}
