package com.nextpari.app.feature.auth

import com.nextpari.app.core.network.NetworkError
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.feature.wallets.WalletsCatalog

data class RegistrationRequest(
    val method: String,
    val email: String = "",
    val phone: String = "",
    val password: String = "",
    val ageConfirmed: Boolean = false,
    val currency: String = "",
)

sealed class RegistrationResult {
    data class Authenticated(val session: AuthSession) : RegistrationResult()
    data object EmailConfirmationRequired : RegistrationResult()
    data class OneClickIssued(
        val playerId: String,
        val password: String,
        val canEnter: Boolean,
    ) : RegistrationResult()
    data class Failed(val error: NetworkError) : RegistrationResult()
}

sealed class OneClickContinue {
    data class Entered(val session: AuthSession) : OneClickContinue()
    data class NeedLogin(val notice: String) : OneClickContinue()
    data class Failed(val error: NetworkError) : OneClickContinue()
}

object RegistrationCopy {
    const val AGE = "Подтвердите, что вам есть 18 лет"
    const val CURRENCY = "Выберите валюту счёта"
    const val EMAIL = "Неверный email"
    const val PHONE = "Неверный номер телефона"
    const val PASSWORD = "Пароль слишком короткий"
    const val FAILED = "Не удалось зарегистрироваться с этими данными."
    const val CONFIRM_EMAIL = "Подтвердите Email, затем войдите."
    const val ONE_CLICK_LOGIN = "Аккаунт создан. Войдите по ID и сохранённому паролю."
    const val ONE_CLICK_TITLE = "Аккаунт создан"
    const val ONE_CLICK_HINT = "Сохраните эти данные сейчас. Пароль больше не будет показан."
    const val COPY_ALL = "Скопировать всё"
    const val COPIED = "Скопировано"

    private val emailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    private val phonePattern = Regex("^\\+?[0-9]{8,15}$")

    fun normalizeCurrency(value: String): String? {
        val code = value.trim().uppercase()
        if (code.isBlank() || code == "TMTM") return null
        return code.takeIf { it in WalletsCatalog.displayCodes }
    }

    fun compactPhone(value: String): String = value.replace(Regex("[\\s()-]"), "")

    fun clientError(request: RegistrationRequest): NetworkError? {
        if (!request.ageConfirmed) return NetworkError.Unknown(AGE)
        if (normalizeCurrency(request.currency) == null) return NetworkError.Unknown(CURRENCY)
        return when (request.method) {
            "email" -> {
                val email = request.email.trim()
                when {
                    email.isEmpty() || email.length > 254 || !emailPattern.matches(email) ->
                        NetworkError.Unknown(EMAIL)
                    request.password.length < 8 -> NetworkError.Unknown(PASSWORD)
                    else -> null
                }
            }
            "phone" -> {
                val phone = compactPhone(request.phone)
                when {
                    !phonePattern.matches(phone) -> NetworkError.Unknown(PHONE)
                    request.password.length < 8 -> NetworkError.Unknown(PASSWORD)
                    else -> null
                }
            }
            "one_click" -> null
            else -> NetworkError.Unknown(FAILED)
        }
    }

    fun copyAll(playerId: String, password: String): String = "ID игрока: $playerId\nПароль: $password"
}
