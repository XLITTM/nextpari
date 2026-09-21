package com.nextpari.app.feature.profile

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

data class PersonalDataQuestionnaire(
    val hasRow: Boolean = false,
    val identityLocked: Boolean = false,
    val verificationStatus: String? = null,
    val questionnaireComplete: Boolean = false,
    val questionnaireCompletedAt: String? = null,
    val firstName: String = "",
    val lastName: String = "",
    val middleName: String = "",
    val dateOfBirth: String = "",
    val citizenshipCountryCode: String = "",
    val residenceCountryCode: String = "",
    val residenceCity: String = "",
    val addressLine1: String = "",
    val addressLine2: String = "",
    val postalCode: String = "",
    val documentType: String = "",
    val documentIssuingCountryCode: String = "",
    val documentSeries: String = "",
    val documentNumber: String = "",
    val documentIssueDate: String = "",
    val documentExpiryDate: String = "",
    val documentIssuingAuthority: String = "",
    val email: String = "",
    val emailVerified: Boolean = false,
    val phone: String = "",
    val phoneVerified: Boolean = false,
    val supportEmail: String? = null,
    val supportConfigured: Boolean = false,
    val supportMailto: String? = null,
)

data class PersonalDataFields(
    val firstName: String = "",
    val lastName: String = "",
    val middleName: String = "",
    val dateOfBirth: String = "",
    val citizenshipCountryCode: String = "",
    val residenceCountryCode: String = "",
    val residenceCity: String = "",
    val addressLine1: String = "",
    val addressLine2: String = "",
    val postalCode: String = "",
    val documentType: String = "",
    val documentIssuingCountryCode: String = "",
    val documentSeries: String = "",
    val documentNumber: String = "",
    val documentIssueDate: String = "",
    val documentExpiryDate: String = "",
    val documentIssuingAuthority: String = "",
)

data class PersonalDataOption(
    val value: String,
    val label: String,
)

data class PersonalDataUiState(
    val questionnaire: PersonalDataQuestionnaire = PersonalDataCatalog.EMPTY,
    val fields: PersonalDataFields = PersonalDataFields(),
    val notice: String? = null,
    val saving: Boolean = false,
    val emailOpen: Boolean = false,
)

object PersonalDataCatalog {
    const val TITLE = "Личные данные"
    const val CARD_IDENTITY = "Личные данные"
    const val CARD_ADDRESS = "Адрес проживания"
    const val CARD_DOCUMENT = "Документ"
    const val CARD_PHONE = "Номер телефона"
    const val CARD_EMAIL = "Электронная почта"
    const val SAVE = "Сохранить данные"
    const val SAVING = "Сохранение..."
    const val BIND_EMAIL = "Привязать почту"
    const val CHANGE_EMAIL = "Изменить почту"
    const val PHONE_HELPER = "Телефон из аккаунта. Изменить его в этой анкете нельзя."
    const val EMAIL_HELPER = "Почта из аккаунта. Привязка выполняется отдельно и не через эту анкету."
    const val PHONE_PLACEHOLDER = "Указан при регистрации"
    const val EMAIL_PLACEHOLDER = "Почта не привязана"
    const val VERIFIED_BADGE = "Личность подтверждена"
    const val IDENTITY_LOCKED_HELP =
        "Для изменения подтверждённых идентификационных данных обратитесь в службу поддержки."
    const val SUPPORT_FALLBACK =
        "Свяжитесь со службой поддержки, чтобы изменить подтверждённые идентификационные данные."
    const val VERIFIED = "Подтверждён"
    const val SESSION_UNAVAILABLE =
        "Операция станет доступна после подключения безопасной сессии аккаунта."
    const val DOB_PAST = "Дата рождения должна быть в прошлом"
    const val ISSUE_NOT_FUTURE = "Дата выдачи не может быть в будущем"
    const val EXPIRY_AFTER_ISSUE = "Дата окончания действия должна быть позже даты выдачи"
    const val COUNTRY_ISO = "Страна должна быть из списка ISO"
    const val DOCUMENT_TYPE_INVALID = "Некорректный тип документа"
    const val INVALID_DATE = "Некорректная дата"

    const val FIELD_FIRST_NAME = "Имя"
    const val FIELD_LAST_NAME = "Фамилия"
    const val FIELD_MIDDLE_NAME = "Отчество / второе имя"
    const val FIELD_DOB = "Дата рождения"
    const val FIELD_CITIZENSHIP = "Гражданство"
    const val FIELD_RESIDENCE_COUNTRY = "Страна проживания"
    const val FIELD_CITY = "Город"
    const val FIELD_ADDRESS = "Адрес"
    const val FIELD_ADDRESS2 = "Дополнительная строка адреса"
    const val FIELD_POSTAL = "Почтовый индекс"
    const val FIELD_DOC_TYPE = "Тип документа"
    const val FIELD_DOC_COUNTRY = "Страна выдачи"
    const val FIELD_DOC_SERIES = "Серия (если применимо)"
    const val FIELD_DOC_NUMBER = "Номер документа"
    const val FIELD_ISSUE_DATE = "Дата выдачи"
    const val FIELD_EXPIRY = "Дата окончания действия (если применимо)"
    const val FIELD_ISSUED_BY = "Кем выдан"

    val EMPTY = PersonalDataQuestionnaire()

    val cardOrder: List<String> = listOf(CARD_IDENTITY, CARD_ADDRESS, CARD_DOCUMENT, CARD_PHONE, CARD_EMAIL)

    val identityFields: List<String> = listOf(
        FIELD_FIRST_NAME, FIELD_LAST_NAME, FIELD_MIDDLE_NAME, FIELD_DOB, FIELD_CITIZENSHIP,
    )
    val addressFields: List<String> = listOf(
        FIELD_RESIDENCE_COUNTRY, FIELD_CITY, FIELD_ADDRESS, FIELD_ADDRESS2, FIELD_POSTAL,
    )
    val documentFields: List<String> = listOf(
        FIELD_DOC_TYPE, FIELD_DOC_COUNTRY, FIELD_DOC_SERIES, FIELD_DOC_NUMBER,
        FIELD_ISSUE_DATE, FIELD_EXPIRY, FIELD_ISSUED_BY,
    )

    val documentTypes: List<PersonalDataOption> = listOf(
        PersonalDataOption("", "Не выбрано"),
        PersonalDataOption("passport", "Паспорт"),
        PersonalDataOption("national_id", "Национальное удостоверение"),
        PersonalDataOption("residence_permit", "Вид на жительство"),
        PersonalDataOption("driver_license", "Водительское удостоверение"),
        PersonalDataOption("other", "Другой документ"),
    )

    val documentTypeValues: List<String> = documentTypes.map { it.value }

    fun emailActionLabel(email: String, verified: Boolean): String =
        if (email.isNotBlank() && verified) CHANGE_EMAIL else BIND_EMAIL

    fun identityLockedHelp(supportConfigured: Boolean): String =
        if (supportConfigured) IDENTITY_LOCKED_HELP else SUPPORT_FALLBACK

    fun isIsoCountry(code: String): Boolean {
        if (code.isBlank()) return true
        return Iso3166Countries.countries.any { it.value == code }
    }

    fun isDocumentType(value: String): Boolean = documentTypeValues.contains(value)

    fun validate(fields: PersonalDataFields): String? {
        parseDate(fields.dateOfBirth)?.let { dob ->
            if (!dob.isBefore(LocalDate.now())) return DOB_PAST
        } ?: fields.dateOfBirth.takeIf { it.isNotBlank() }?.let { return INVALID_DATE }

        parseDate(fields.documentIssueDate)?.let { issue ->
            if (issue.isAfter(LocalDate.now())) return ISSUE_NOT_FUTURE
        } ?: fields.documentIssueDate.takeIf { it.isNotBlank() }?.let { return INVALID_DATE }

        val expiry = parseDate(fields.documentExpiryDate)
        if (fields.documentExpiryDate.isNotBlank() && expiry == null) return INVALID_DATE
        val issue = parseDate(fields.documentIssueDate)
        if (expiry != null && issue != null && !expiry.isAfter(issue)) return EXPIRY_AFTER_ISSUE

        if (!isIsoCountry(fields.citizenshipCountryCode)) return COUNTRY_ISO
        if (!isIsoCountry(fields.residenceCountryCode)) return COUNTRY_ISO
        if (!isIsoCountry(fields.documentIssuingCountryCode)) return COUNTRY_ISO
        if (!isDocumentType(fields.documentType)) return DOCUMENT_TYPE_INVALID
        return null
    }

    fun parseDate(value: String): LocalDate? {
        if (value.isBlank()) return null
        return try {
            LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE)
        } catch (_: DateTimeParseException) {
            null
        }
    }
}
