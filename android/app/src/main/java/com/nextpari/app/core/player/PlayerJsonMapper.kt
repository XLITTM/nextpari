package com.nextpari.app.core.player

import com.nextpari.app.core.network.NetworkError
import com.nextpari.app.feature.wallets.WalletsCatalog
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

object PlayerJsonMapper {
    fun snapshotFromBody(body: JsonObject): PlayerMeSnapshot? {
        if (body.bool("authenticated") != true) return null
        val player = body.obj("player") ?: return null
        val wallet = body.obj("wallet") ?: return null
        val balance = wallet.num("balance")?.takeIf { it.isFinite() && it >= 0.0 } ?: return null
        val playerId = parsePublicPlayerId(player.str("publicId")).takeIf { it.isNotEmpty() } ?: return null
        val currency = WalletsCatalog.storageCurrency(wallet.str("currency")) ?: return null
        val email = sanitizePublicEmail(player.str("email"))
        val profile = body.obj("profile") ?: JsonObject(emptyMap())
        return PlayerMeSnapshot(
            playerPublicId = playerId,
            email = email,
            wallet = PlayerWalletSnapshot(
                balance = balance,
                currency = displayPlayerCurrency(currency),
                status = wallet.str("status").ifBlank { "active" },
                migrationState = wallet.optionalStr("migrationState"),
            ),
            profile = profileFromBody(profile, email),
        )
    }

    fun profileFromBody(profile: JsonObject, fallbackEmail: String = ""): PlayerProfileSnapshot {
        return PlayerProfileSnapshot(
            firstName = profile.str("firstName", "first_name"),
            lastName = profile.str("lastName", "last_name"),
            middleName = profile.str("middleName", "middle_name"),
            birthDate = profile.str("birthDate", "birth_date"),
            passport = profile.str("passport"),
            phone = profile.str("phone"),
            email = sanitizePublicEmail(profile.str("email").ifBlank { fallbackEmail }),
            phoneVerified = profile.bool("phoneVerified") == true || profile.bool("phone_verified") == true,
            emailVerified = profile.bool("emailVerified") == true || profile.bool("email_verified") == true,
        )
    }

    fun walletsFromBody(body: JsonObject, playerId: String): List<MappedWalletRow>? {
        if (body.bool("ok") != true) return null
        val owner = body.optionalStr("playerPublicId") ?: body.obj("player")?.optionalStr("publicId")
        if (owner != null && parsePublicPlayerId(owner) != playerId) return null
        val rows = body["wallets"] as? JsonArray ?: return null
        val ids = HashSet<String>()
        val currencies = HashSet<String>()
        val mapped = rows.map { element ->
            val row = element as? JsonObject ?: return null
            val id = row.str("walletId", "wallet_id")
            val currency = WalletsCatalog.storageCurrency(row.str("currency")) ?: return null
            if (id.isBlank() || !ids.add(id) || !currencies.add(currency)) return null
            val active = row.bool("isActive") ?: row.bool("is_active") ?: return null
            val available = row.num("availableBalance", "available_balance")?.takeIf { it.isFinite() && it >= 0.0 } ?: return null
            val locked = row.num("lockedBalance", "locked_balance")?.takeIf { it.isFinite() && it >= 0.0 } ?: return null
            MappedWalletRow(id, currency, available, locked, active, row.str("displayNameRu", "display_name_ru"))
        }
        val active = mapped.filter { it.isActive }
        val pointer = body["activeWalletId"] ?: body["active_wallet_id"]
        val activeId = body.optionalStr("activeWalletId") ?: body.optionalStr("active_wallet_id")
        if (active.size > 1 || (mapped.isNotEmpty() && active.isEmpty() && pointer != JsonNull)) return null
        if (pointer != null && activeId != active.singleOrNull()?.walletId) return null
        return mapped
    }

    fun errorCode(body: JsonObject?): String = body?.str("error").orEmpty()

    fun parsePublicPlayerId(value: String): String {
        val trimmed = value.trim()
        return if (trimmed.matches(Regex("^[0-9]{6}$"))) trimmed else ""
    }

    fun sanitizePublicEmail(email: String): String {
        val value = email.trim()
        val domain = value.substringAfter("@", "")
        if (value.isEmpty() || domain.endsWith(".invalid", ignoreCase = true)) return ""
        return value
    }

    fun mapAuthError(code: String, fallback: NetworkError = NetworkError.Unknown("Неверный логин или пароль")): NetworkError {
        return when (code) {
            "AUTH_FAILED" -> NetworkError.Unknown("Неверный логин или пароль")
            "AUTH_RATE_LIMITED" -> NetworkError.Unknown("Слишком много попыток. Попробуйте позже.")
            "INVALID_PASSWORD" -> NetworkError.Unknown("Пароль слишком короткий")
            "INVALID_EMAIL" -> NetworkError.Unknown("Неверный email")
            "INVALID_PHONE" -> NetworkError.Unknown("Неверный номер телефона")
            "AGE_REQUIRED" -> NetworkError.Unknown("Подтвердите, что вам есть 18 лет")
            "REGISTRATION_CURRENCY_REQUIRED", "CURRENCY_UNSUPPORTED" -> NetworkError.Unknown("Выберите валюту счёта")
            "EMAIL_CONFIRMATION_REQUIRED" -> NetworkError.Unknown("Подтвердите Email, затем войдите.")
            "REGISTRATION_FAILED", "REGISTRATION_UNAVAILABLE" ->
                NetworkError.Unknown("Не удалось зарегистрироваться с этими данными.")
            "JWT_REQUIRED", "JWT_INVALID", "SESSION_EXPIRED", "SESSION_REQUIRED", "AUTH_REQUIRED" ->
                NetworkError.Unauthorized
            "WALLET_UNAVAILABLE" -> NetworkError.Unknown("Кошелёк недоступен")
            "INSUFFICIENT_AVAILABLE_BALANCE" -> NetworkError.Unknown("Недостаточно средств")
            "GAME_RPC_FAILED" -> NetworkError.Unknown("Не удалось выполнить действие")
            else -> if (code.isBlank()) fallback else NetworkError.Unknown(fallbackMessage(code, fallback))
        }
    }

    private fun fallbackMessage(code: String, fallback: NetworkError): String =
        if (fallback is NetworkError.Unknown) fallback.message else code
}

data class MappedWalletRow(
    val walletId: String,
    val currency: String,
    val availableBalance: Double,
    val lockedBalance: Double,
    val isActive: Boolean,
    val displayNameRu: String,
)

fun JsonObject.obj(key: String): JsonObject? = (this[key] as? JsonObject)

fun JsonObject.str(vararg keys: String): String {
    keys.forEach { key ->
        val value = this[key]?.jsonPrimitiveOrNull()?.contentOrNull
        if (!value.isNullOrBlank()) return value
    }
    return ""
}

fun JsonObject.optionalStr(key: String): String? {
    val element = this[key] ?: return null
    if (element is JsonNull) return null
    return element.jsonPrimitiveOrNull()?.contentOrNull
}

fun JsonObject.bool(key: String): Boolean? = this[key]?.jsonPrimitiveOrNull()?.booleanOrNull

fun JsonObject.num(vararg keys: String): Double? {
    keys.forEach { key ->
        val primitive = this[key]?.jsonPrimitiveOrNull() ?: return@forEach
        primitive.doubleOrNull?.let { return it }
        primitive.contentOrNull?.toDoubleOrNull()?.let { return it }
    }
    return null
}

private fun JsonElement.jsonPrimitiveOrNull(): JsonPrimitive? = this as? JsonPrimitive
