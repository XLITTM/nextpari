package com.nextpari.app.feature.account

import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.PlayerCallResult
import com.nextpari.app.core.network.isSessionCode
import com.nextpari.app.core.network.playerCall
import com.nextpari.app.core.player.str
import com.nextpari.app.feature.settings.AccountSecurity
import com.nextpari.app.feature.settings.AccountSecurityResult
import com.nextpari.app.feature.settings.SettingsCatalog
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

interface PlayerAccountGateway {
    suspend fun changePassword(currentPassword: String, newPassword: String, confirmPassword: String): AccountSecurityResult
    suspend fun startEmail(email: String): AccountSecurityResult
    suspend fun verifyEmail(code: String): AccountSecurityResult
    suspend fun startRecovery(identifier: String): AccountSecurityResult
    suspend fun verifyRecovery(challengeId: String, code: String): AccountSecurityResult
    suspend fun resetPassword(resetTicket: String, newPassword: String, confirmPassword: String): AccountSecurityResult
}

class UnavailableAccountGateway : PlayerAccountGateway {
    override suspend fun changePassword(currentPassword: String, newPassword: String, confirmPassword: String): AccountSecurityResult =
        AccountSecurity.changePassword(currentPassword, newPassword, confirmPassword).ifReady(SettingsCatalog.SESSION_REQUIRED)

    override suspend fun startEmail(email: String): AccountSecurityResult =
        AccountSecurity.startEmailBinding(email).ifReady(SettingsCatalog.SESSION_REQUIRED)

    override suspend fun verifyEmail(code: String): AccountSecurityResult =
        AccountSecurity.verifyEmailCode(code).ifReady(SettingsCatalog.SESSION_REQUIRED)

    override suspend fun startRecovery(identifier: String): AccountSecurityResult =
        if (identifier.trim().isEmpty()) AccountSecurityResult.Invalid("Укажите email или ID")
        else AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)

    override suspend fun verifyRecovery(challengeId: String, code: String): AccountSecurityResult {
        if (!code.matches(Regex("^\\d{6}$")) || challengeId.isBlank()) {
            return AccountSecurityResult.Invalid("Неверный или истёкший код.")
        }
        return AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)
    }

    override suspend fun resetPassword(resetTicket: String, newPassword: String, confirmPassword: String): AccountSecurityResult {
        if (newPassword != confirmPassword) return AccountSecurityResult.Invalid(SettingsCatalog.PASSWORD_MISMATCH)
        if (newPassword.length < SettingsCatalog.PASSWORD_MIN_LENGTH) return AccountSecurityResult.Invalid(SettingsCatalog.PASSWORD_POLICY)
        if (resetTicket.isBlank()) return AccountSecurityResult.Invalid("Неверный или истёкший код.")
        return AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)
    }
}

class RemoteAccountGateway(
    private val api: PlayerApi,
    private val json: Json,
    private val hasSession: () -> Boolean,
) : PlayerAccountGateway {
    override suspend fun changePassword(currentPassword: String, newPassword: String, confirmPassword: String): AccountSecurityResult {
        val local = AccountSecurity.changePassword(currentPassword, newPassword, confirmPassword)
        if (local !is AccountSecurityResult.Ready) return local
        if (!hasSession()) return AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)
        return post(buildJsonObject {
            put("currentPassword", currentPassword)
            put("newPassword", newPassword)
        }, api::changePassword) { AccountMessages.PASSWORD_CHANGED }
    }

    override suspend fun startEmail(email: String): AccountSecurityResult {
        val local = AccountSecurity.startEmailBinding(email)
        if (local !is AccountSecurityResult.Ready) return local
        if (!hasSession()) return AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)
        val normalized = email.trim().lowercase()
        return post(buildJsonObject { put("email", normalized) }, api::startEmail) { body ->
            val masked = body.str("maskedEmail")
            if (masked.isBlank()) "Код отправлен" else "Код отправлен на $masked"
        }
    }

    override suspend fun verifyEmail(code: String): AccountSecurityResult {
        val local = AccountSecurity.verifyEmailCode(code)
        if (local !is AccountSecurityResult.Ready) return local
        if (!hasSession()) return AccountSecurityResult.Unavailable(SettingsCatalog.SESSION_REQUIRED)
        return post(buildJsonObject { put("code", code) }, api::verifyEmail) { AccountMessages.EMAIL_VERIFIED }
    }

    override suspend fun startRecovery(identifier: String): AccountSecurityResult {
        if (identifier.trim().isEmpty()) return AccountSecurityResult.Invalid("Укажите email или ID")
        return post(buildJsonObject { put("identifier", identifier.trim()) }, api::startPasswordRecovery) { body ->
            val message = body.str("message").ifBlank { AccountMessages.RECOVERY_STARTED }
            val challengeId = body.str("challengeId")
            if (challengeId.isBlank()) AccountSecurityResult.Unavailable(AccountMessages.RECOVERY_FAILED)
            else AccountSecurityResult.Accepted(message, challengeId)
        }
    }

    override suspend fun verifyRecovery(challengeId: String, code: String): AccountSecurityResult {
        if (!code.matches(Regex("^\\d{6}$")) || challengeId.isBlank()) {
            return AccountSecurityResult.Invalid("Неверный или истёкший код.")
        }
        return post(
            buildJsonObject {
                put("challengeId", challengeId)
                put("code", code)
            },
            api::verifyPasswordRecovery,
        ) { body ->
            val ticket = body.str("resetTicket")
            if (ticket.isBlank()) AccountSecurityResult.Invalid("Неверный или истёкший код.")
            else AccountSecurityResult.Accepted("Код принят", ticket)
        }
    }

    override suspend fun resetPassword(resetTicket: String, newPassword: String, confirmPassword: String): AccountSecurityResult {
        if (newPassword != confirmPassword) return AccountSecurityResult.Invalid(SettingsCatalog.PASSWORD_MISMATCH)
        if (newPassword.length < SettingsCatalog.PASSWORD_MIN_LENGTH) return AccountSecurityResult.Invalid(SettingsCatalog.PASSWORD_POLICY)
        if (resetTicket.isBlank()) return AccountSecurityResult.Invalid("Неверный или истёкший код.")
        return post(buildJsonObject {
            put("resetTicket", resetTicket)
            put("newPassword", newPassword)
            put("confirmPassword", confirmPassword)
        }, api::resetPassword) { body ->
            body.str("message").ifBlank { AccountMessages.RECOVERY_DONE }
        }
    }

    private suspend fun post(
        body: JsonObject,
        call: suspend (JsonObject) -> retrofit2.Response<JsonObject>,
        success: (JsonObject) -> Any,
    ): AccountSecurityResult {
        return when (val result = playerCall(json) { call(body) }) {
            is PlayerCallResult.Ok -> when (val mapped = success(result.body)) {
                is AccountSecurityResult -> mapped
                is String -> AccountSecurityResult.Accepted(mapped)
                else -> AccountSecurityResult.Unavailable(AccountMessages.REQUEST_FAILED)
            }
            is PlayerCallResult.Rejected -> AccountSecurityResult.Unavailable(AccountMessages.of(result.code, result.transport))
        }
    }
}

object AccountMessages {
    const val PASSWORD_CHANGED = "Пароль успешно изменён. Войдите с новым паролем."
    const val EMAIL_VERIFIED = "Почта подтверждена"
    const val RECOVERY_STARTED = "Если аккаунт с подтверждённой почтой существует, код отправлен."
    const val RECOVERY_DONE = "Пароль изменён. Войдите с новым паролем."
    const val RECOVERY_FAILED = "Не удалось изменить пароль. Попробуйте ещё раз."
    const val REQUEST_FAILED = "Не удалось выполнить запрос. Попробуйте ещё раз."
    const val SESSION = "Требуется вход в аккаунт"

    fun of(code: String, transport: String?): String {
        if (!transport.isNullOrBlank()) return transport
        if (isSessionCode(code)) return SESSION
        return when (code) {
            "CURRENT_PASSWORD_INVALID" -> SettingsCatalog.CURRENT_PASSWORD_INVALID
            "PASSWORD_CONFIRMATION_MISMATCH" -> SettingsCatalog.PASSWORD_MISMATCH
            "PASSWORD_SAME_AS_CURRENT" -> SettingsCatalog.PASSWORD_SAME_AS_CURRENT
            "PASSWORD_POLICY_INVALID", "INVALID_PASSWORD" -> SettingsCatalog.PASSWORD_POLICY
            "INVALID_EMAIL" -> SettingsCatalog.INVALID_EMAIL
            "EMAIL_UNAVAILABLE" -> "Не удалось привязать этот адрес. Попробуйте другой."
            "EMAIL_RESEND_COOLDOWN" -> "Подождите минуту перед повторной отправкой кода"
            "EMAIL_SEND_RATE_LIMITED" -> "Слишком много попыток. Попробуйте позже."
            "EMAIL_PROVIDER_NOT_CONFIGURED", "EMAIL_DELIVERY_FAILED" -> "Не удалось отправить код. Попробуйте ещё раз."
            "INVALID_CODE", "EMAIL_CODE_INVALID", "RECOVERY_CODE_INVALID" -> "Неверный или истёкший код."
            "EMAIL_CODE_EXPIRED" -> "Срок действия кода истёк"
            "EMAIL_CODE_LOCKED" -> "Слишком много неверных попыток. Запросите новый код."
            "EMAIL_CODE_CONSUMED", "EMAIL_CHALLENGE_NOT_FOUND" -> "Запросите новый код подтверждения"
            "RESET_TICKET_INVALID" -> "Срок действия кода истёк. Запросите восстановление заново."
            "PASSWORD_RESET_SESSION_REVOCATION_FAILED" ->
                "Пароль обновлён, но не удалось завершить выход на других устройствах. Войдите с новым паролем."
            else -> REQUEST_FAILED
        }
    }
}

private fun AccountSecurityResult.ifReady(message: String): AccountSecurityResult =
    if (this is AccountSecurityResult.Ready) AccountSecurityResult.Unavailable(message) else this
