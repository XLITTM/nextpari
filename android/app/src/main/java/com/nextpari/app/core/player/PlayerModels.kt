package com.nextpari.app.core.player

data class PlayerWalletSnapshot(
    val balance: Double,
    val currency: String,
    val status: String,
    val migrationState: String?,
)

data class PlayerProfileSnapshot(
    val firstName: String = "",
    val lastName: String = "",
    val middleName: String = "",
    val birthDate: String = "",
    val passport: String = "",
    val phone: String = "",
    val email: String = "",
    val phoneVerified: Boolean = false,
    val emailVerified: Boolean = false,
)

data class PlayerMeSnapshot(
    val playerPublicId: String,
    val email: String,
    val wallet: PlayerWalletSnapshot,
    val profile: PlayerProfileSnapshot,
)

fun playerDisplayName(profile: PlayerProfileSnapshot): String {
    val first = profile.firstName.trim()
    val last = profile.lastName.trim()
    return if (first.isNotEmpty() && last.isNotEmpty()) "$first $last" else "Новый игрок"
}

fun isPlayerProfileComplete(profile: PlayerProfileSnapshot): Boolean =
    profile.firstName.trim().isNotEmpty() &&
        profile.lastName.trim().isNotEmpty() &&
        profile.middleName.trim().isNotEmpty() &&
        profile.birthDate.trim().isNotEmpty() &&
        profile.phone.trim().isNotEmpty() &&
        profile.email.trim().isNotEmpty() &&
        profile.passport.trim().isNotEmpty()

fun displayPlayerCurrency(code: String?): String {
    val raw = code.orEmpty().trim().uppercase()
    if (raw == "TMTM" || raw == "TMT") return "TMT"
    if (raw in DISPLAY_CURRENCIES) return raw
    return raw.ifBlank { "TMT" }
}

fun formatServerBalance(value: Double): String {
    if (!value.isFinite()) return "—"
    val asLong = value.toLong()
    return if (value == asLong.toDouble()) asLong.toString() else String.format(java.util.Locale.US, "%.2f", value)
}

private val DISPLAY_CURRENCIES = setOf("TMT", "USD", "TRY", "UZS", "RUB", "KZT")
