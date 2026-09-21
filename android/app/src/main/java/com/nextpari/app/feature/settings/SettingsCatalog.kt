package com.nextpari.app.feature.settings

data class SettingsSection(
    val title: String,
)

data class OddsPolicyOption(
    val id: String,
    val label: String,
    val hint: String,
)

data class SettingsLaterRow(
    val label: String,
    val hint: String? = null,
)

object SettingsCatalog {
    const val TITLE = "Настройки"
    const val BET_SLIP_TITLE = "Провод ставки"
    const val ODDS_CHANGE_TITLE = "Изменение коэффициента"
    const val LATER_TITLE = "Позже"
    const val SHARE_TITLE = "Nextpari"
    const val SHARE_URL = "https://nextpari.net/"
    const val ODDS_FORMAT_VALUE = "Десятичные"
    const val EMAIL_UNBOUND = "Почта не привязана"
    const val EMAIL_VERIFIED_MARK = "Подтверждена ✓"
    const val BIND_EMAIL = "Привязать почту"
    const val CHANGE_EMAIL = "Изменить почту"
    const val SOON = "Скоро"
    const val SESSION_REQUIRED =
        "Операция станет доступна после подключения безопасной сессии аккаунта."
    const val PASSWORD_POLICY = "Пароль должен содержать не менее 8 символов"
    const val CURRENT_PASSWORD_INVALID = "Текущий пароль указан неверно"
    const val PASSWORD_MISMATCH = "Пароли не совпадают"
    const val PASSWORD_SAME_AS_CURRENT = "Новый пароль должен отличаться от текущего"
    const val INVALID_EMAIL = "Неверный email"
    const val PASSWORD_MIN_LENGTH = 8

    val shareText: String = "$SHARE_TITLE\n$SHARE_URL"

    val sections: List<SettingsSection> = listOf(
        SettingsSection("Управление счётом"),
        SettingsSection("Безопасность"),
        SettingsSection("Настройки ставок"),
        SettingsSection("Настройки приложения"),
        SettingsSection("О приложении"),
    )

    val accountLabels: List<String> = listOf("Пополнить", "Вывести")
    val securityLabels: List<String> = listOf("Электронная почта", "Привязать почту", "Сменить пароль")
    val bettingLabels: List<String> = listOf("Провод ставки", "Ставка в 1 клик")
    val applicationLabels: List<String> = listOf("Тип коэффициентов", "Push", "Выбор языка")
    val aboutLabels: List<String> = listOf("Поделиться", "Выйти")

    val oddsPolicies: List<OddsPolicyOption> = listOf(
        OddsPolicyOption("any", "Принимать любое изменение", "Ставка пройдёт при любом новом коэффициенте"),
        OddsPolicyOption("increase", "Принимать только повышение", "Ставка пройдёт, только если коэффициент вырос"),
        OddsPolicyOption("none", "Не принимать изменения", "Потребуется подтверждение при любом изменении"),
    )

    val laterRows: List<SettingsLaterRow> = listOf(
        SettingsLaterRow("Push-уведомления о ставках"),
        SettingsLaterRow("Очищать купон после ставки"),
        SettingsLaterRow("Быстрые суммы"),
        SettingsLaterRow("VIP-ставка", "Повышенные лимиты и приоритетное проведение пари"),
    )

    fun emailActionLabel(verifiedEmail: String): String =
        if (verifiedEmail.isNotBlank()) CHANGE_EMAIL else BIND_EMAIL

    fun emailStatus(verifiedEmail: String): String =
        if (verifiedEmail.isNotBlank()) verifiedEmail else EMAIL_UNBOUND
}
