package com.nextpari.app.feature.wallets

data class PlayerWalletRow(
    val walletId: String,
    val currency: String,
    val displayNameRu: String,
    val availableBalance: String,
    val isActive: Boolean,
)

data class CurrencyOption(
    val value: String,
    val label: String,
)

data class WalletsUiState(
    val owned: List<PlayerWalletRow> = emptyList(),
    val addable: List<CurrencyOption> = WalletsCatalog.displayCurrencies,
    val notice: String? = null,
    val busy: Boolean = false,
)

object WalletsCatalog {
    const val TITLE = "Кошелёк и валюты"
    const val ADD_CURRENCY = "Добавить валюту"
    const val SESSION_UNAVAILABLE =
        "Операция станет доступна после подключения безопасной сессии аккаунта."

    val displayCodes: List<String> = listOf("TMT", "USD", "TRY", "UZS", "RUB", "KZT")

    val displayCurrencies: List<CurrencyOption> = listOf(
        CurrencyOption("TMT", "TMT — Манат"),
        CurrencyOption("USD", "USD — Доллар США"),
        CurrencyOption("TRY", "TRY — Турецкая лира"),
        CurrencyOption("UZS", "UZS — Узбекский сум"),
        CurrencyOption("RUB", "RUB — Российский рубль"),
        CurrencyOption("KZT", "KZT — Казахстанский тенге"),
    )

    fun displayCurrency(code: String?): String {
        val raw = code.orEmpty().trim().uppercase()
        if (raw == "TMTM" || raw == "TMT") return "TMT"
        if (raw in displayCodes) return raw
        return raw.ifBlank { "TMT" }
    }

    fun storageCurrency(code: String?): String? {
        val raw = code.orEmpty().trim().uppercase()
        if (raw.isEmpty()) return null
        if (raw == "TMT" || raw == "TMTM") return "TMTM"
        if (raw == "USD" || raw == "TRY" || raw == "UZS" || raw == "RUB" || raw == "KZT") return raw
        return null
    }

    fun labelFor(code: String): String =
        displayCurrencies.firstOrNull { it.value == displayCurrency(code) }?.label ?: displayCurrency(code)

    fun addable(owned: List<PlayerWalletRow>): List<CurrencyOption> {
        val ownedDisplay = owned.map { displayCurrency(it.currency) }.toSet()
        return displayCurrencies.filter { it.value !in ownedDisplay }
    }
}
