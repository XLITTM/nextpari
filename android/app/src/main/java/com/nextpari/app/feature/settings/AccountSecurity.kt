package com.nextpari.app.feature.settings

sealed class AccountSecurityResult {
    data class Invalid(val message: String) : AccountSecurityResult()
    data class Unavailable(val message: String) : AccountSecurityResult()
}

object AccountSecurity {
    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    fun changePassword(
        currentPassword: String,
        newPassword: String,
        confirmPassword: String,
    ): AccountSecurityResult {
        val invalid = validatePasswordChange(currentPassword, newPassword, confirmPassword)
        if (invalid != null) return AccountSecurityResult.Invalid(invalid)
        return AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)
    }

    fun startEmailBinding(email: String): AccountSecurityResult {
        if (!isValidEmail(email)) return AccountSecurityResult.Invalid(SettingsCatalog.INVALID_EMAIL)
        return AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)
    }

    fun verifyEmailCode(code: String): AccountSecurityResult {
        if (!code.matches(Regex("^\\d{6}$"))) {
            return AccountSecurityResult.Invalid("Неверный код подтверждения")
        }
        return AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)
    }

    fun validatePasswordChange(
        currentPassword: String,
        newPassword: String,
        confirmPassword: String,
    ): String? {
        if (currentPassword.isEmpty()) return SettingsCatalog.CURRENT_PASSWORD_INVALID
        if (newPassword.isEmpty() || newPassword.length < SettingsCatalog.PASSWORD_MIN_LENGTH) {
            return SettingsCatalog.PASSWORD_POLICY
        }
        if (newPassword != confirmPassword) return SettingsCatalog.PASSWORD_MISMATCH
        if (newPassword == currentPassword) return SettingsCatalog.PASSWORD_SAME_AS_CURRENT
        return null
    }

    fun isValidEmail(email: String): Boolean {
        val value = email.trim().lowercase()
        return value.isNotEmpty() && value.length <= 254 && emailPattern.matches(value)
    }
}
