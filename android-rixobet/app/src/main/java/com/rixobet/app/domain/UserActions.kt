package com.rixobet.app.domain

sealed interface Attempt {
    data class Invalid(val reason: String) : Attempt
    data class Unavailable(val message: String) : Attempt
}

object UserActions {
    private const val offline =
        "Сервис RIXO BET не подключён. Действие не выполнено, деньги и аккаунт не изменялись."

    fun login(identifier: String, password: String): Attempt {
        if (identifier.isBlank() || password.isBlank()) {
            return Attempt.Invalid("Введите e-mail, телефон и пароль")
        }
        if (password.length < 6) {
            return Attempt.Invalid("Пароль должен быть не короче 6 символов")
        }
        return Attempt.Unavailable("Вход недоступен. $offline")
    }

    fun registerEmail(email: String, password: String, confirm: String, accepted: Boolean): Attempt {
        if (!email.contains("@") || email.substringBefore("@").isBlank() || !email.contains(".")) {
            return Attempt.Invalid("Введите корректный e-mail")
        }
        return registerSecrets(password, confirm, accepted)
    }

    fun registerPhone(phone: String, password: String, confirm: String, accepted: Boolean): Attempt {
        val digits = phone.filter { it.isDigit() }
        if (digits.length < 8) return Attempt.Invalid("Введите номер телефона")
        return registerSecrets(password, confirm, accepted)
    }

    fun registerOneClick(accepted: Boolean): Attempt {
        if (!accepted) return Attempt.Invalid("Подтвердите, что вам есть 18 лет, и примите правила")
        return Attempt.Unavailable("Регистрация в один клик недоступна. $offline")
    }

    fun confirmEmail(code: String): Attempt {
        if (code.length != 6 || code.any { !it.isDigit() }) {
            return Attempt.Invalid("Введите 6 цифр кода")
        }
        return Attempt.Unavailable("Код не проверен. Письмо не отправлялось. $offline")
    }

    fun resendCode(): Attempt = Attempt.Unavailable("Повторная отправка недоступна. $offline")

    fun social(provider: String): Attempt =
        Attempt.Unavailable("Вход через $provider недоступен. $offline")

    fun forgotPassword(): Attempt = Attempt.Unavailable("Восстановление пароля недоступно. $offline")

    fun deposit(): Attempt = Attempt.Unavailable("Пополнение недоступно. Платёжный сервис не подключён.")

    fun placeBet(): Attempt = Attempt.Unavailable("Ставка недоступна. Линия и кошелёк не подключены.")

    fun launchGame(name: String): Attempt =
        Attempt.Unavailable("«$name» недоступна. Игровой провайдер не подключён.")

    fun claimPromo(name: String): Attempt =
        Attempt.Unavailable("Акция «$name» недоступна. Бонус не начислен.")

    fun changePassword(current: String, next: String, confirm: String): Attempt {
        if (current.isBlank() || next.isBlank()) return Attempt.Invalid("Заполните все поля пароля")
        if (next.length < 6) return Attempt.Invalid("Новый пароль должен быть не короче 6 символов")
        if (next != confirm) return Attempt.Invalid("Пароли не совпадают")
        return Attempt.Unavailable("Смена пароля недоступна. $offline")
    }

    private fun registerSecrets(password: String, confirm: String, accepted: Boolean): Attempt {
        if (password.length < 6) return Attempt.Invalid("Пароль должен быть не короче 6 символов")
        if (password != confirm) return Attempt.Invalid("Пароли не совпадают")
        if (!accepted) return Attempt.Invalid("Подтвердите, что вам есть 18 лет, и примите правила")
        return Attempt.Unavailable("Регистрация недоступна. Аккаунт не создан. $offline")
    }
}
