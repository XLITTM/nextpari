package com.nextpari.app.feature.profile

import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.PlayerCallResult
import com.nextpari.app.core.network.playerCall
import com.nextpari.app.core.player.PlayerStateStore
import com.nextpari.app.core.player.bool
import com.nextpari.app.core.player.str
import com.nextpari.app.feature.account.AccountMessages
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class RemotePersonalDataRepository(
    private val store: PlayerStateStore,
    private val api: PlayerApi? = null,
    private val json: Json? = null,
    private val hasSession: () -> Boolean = { false },
) : PersonalDataRepository {
    override fun load(): PersonalDataQuestionnaire = store.profile()

    override suspend fun refresh(): Result<PersonalDataQuestionnaire> {
        val client = api
        val parser = json
        if (client == null || parser == null || !hasSession()) return Result.success(load())
        return when (val result = playerCall(parser) { client.personalData() }) {
            is PlayerCallResult.Ok -> Result.success(questionnaireOf(result.body))
            is PlayerCallResult.Rejected -> Result.failure(IllegalStateException(AccountMessages.of(result.code, result.transport)))
        }
    }

    override suspend fun save(fields: PersonalDataFields): Result<PersonalDataQuestionnaire> {
        PersonalDataCatalog.validate(fields)?.let { message ->
            return Result.failure(IllegalArgumentException(message))
        }
        val client = api
        val parser = json
        if (client == null || parser == null || !hasSession()) {
            return Result.failure(IllegalStateException(PersonalDataCatalog.SESSION_UNAVAILABLE))
        }
        return when (val result = playerCall(parser) { client.savePersonalData(payload(fields)) }) {
            is PlayerCallResult.Ok -> Result.success(questionnaireOf(result.body))
            is PlayerCallResult.Rejected -> Result.failure(
                IllegalStateException(personalDataMessage(result.code, result.transport)),
            )
        }
    }

    private fun payload(fields: PersonalDataFields): JsonObject = buildJsonObject {
        put("first_name", fields.firstName.trim())
        put("last_name", fields.lastName.trim())
        put("middle_name", fields.middleName.trim())
        put("date_of_birth", fields.dateOfBirth.trim())
        put("citizenship_country_code", fields.citizenshipCountryCode.trim())
        put("residence_country_code", fields.residenceCountryCode.trim())
        put("residence_city", fields.residenceCity.trim())
        put("address_line_1", fields.addressLine1.trim())
        put("address_line_2", fields.addressLine2.trim())
        put("postal_code", fields.postalCode.trim())
        put("document_type", fields.documentType.trim())
        put("document_issuing_country_code", fields.documentIssuingCountryCode.trim())
        put("document_series", fields.documentSeries.trim())
        put("document_number", fields.documentNumber.trim())
        put("document_issue_date", fields.documentIssueDate.trim())
        put("document_expiry_date", fields.documentExpiryDate.trim())
        put("document_issuing_authority", fields.documentIssuingAuthority.trim())
    }
}

internal fun questionnaireOf(body: JsonObject): PersonalDataQuestionnaire = PersonalDataQuestionnaire(
    hasRow = body.bool("hasRow") == true,
    identityLocked = body.bool("identityLocked") == true,
    verificationStatus = body.str("verificationStatus").ifBlank { null },
    questionnaireComplete = body.bool("questionnaireComplete") == true,
    questionnaireCompletedAt = body.str("questionnaireCompletedAt").ifBlank { null },
    firstName = body.str("firstName"),
    lastName = body.str("lastName"),
    middleName = body.str("middleName"),
    dateOfBirth = body.str("dateOfBirth"),
    citizenshipCountryCode = body.str("citizenshipCountryCode"),
    residenceCountryCode = body.str("residenceCountryCode"),
    residenceCity = body.str("residenceCity"),
    addressLine1 = body.str("addressLine1"),
    addressLine2 = body.str("addressLine2"),
    postalCode = body.str("postalCode"),
    documentType = body.str("documentType"),
    documentIssuingCountryCode = body.str("documentIssuingCountryCode"),
    documentSeries = body.str("documentSeries"),
    documentNumber = body.str("documentNumber"),
    documentIssueDate = body.str("documentIssueDate"),
    documentExpiryDate = body.str("documentExpiryDate"),
    documentIssuingAuthority = body.str("documentIssuingAuthority"),
    email = body.str("email"),
    emailVerified = body.bool("emailVerified") == true,
    phone = body.str("phone"),
    phoneVerified = body.bool("phoneVerified") == true,
    supportEmail = body.str("supportEmail").ifBlank { null },
    supportConfigured = body.bool("supportConfigured") == true,
    supportMailto = body.str("supportMailto").ifBlank { null },
)

private fun personalDataMessage(code: String, transport: String?): String {
    if (!transport.isNullOrBlank()) return transport
    return when (code) {
        "PERSONAL_DATA_IDENTITY_LOCKED" -> PersonalDataCatalog.IDENTITY_LOCKED_HELP
        else -> AccountMessages.of(code, null)
    }
}
