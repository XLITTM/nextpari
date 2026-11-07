package com.rixobet.app.domain

data class LocalPrefs(
    val theme: ThemeMode = ThemeMode.DarkVip,
    val themeChosen: Boolean = false,
    val currency: String = "TMT",
    val notificationsEnabled: Boolean = true,
    val rememberedIdentifier: String = "",
) {
    fun withTheme(mode: ThemeMode, chosen: Boolean = themeChosen): LocalPrefs =
        copy(theme = mode, themeChosen = chosen)
}

class LocalPrefsRepository(private val file: java.io.File) {
    fun read(): LocalPrefs {
        if (!file.exists()) return LocalPrefs()
        val map = file.readLines()
            .mapNotNull { line ->
                val index = line.indexOf('=')
                if (index <= 0) null else line.substring(0, index) to line.substring(index + 1)
            }
            .toMap()
        val currency = map["currency"]?.takeIf { it in AllowedCurrencies } ?: "TMT"
        return LocalPrefs(
            theme = ThemeMode.fromKey(map["theme"]),
            themeChosen = map["themeChosen"] == "true",
            currency = currency,
            notificationsEnabled = map["notifications"] != "false",
            rememberedIdentifier = map["rememberedIdentifier"].orEmpty().take(120),
        )
    }

    fun write(prefs: LocalPrefs) {
        file.parentFile?.mkdirs()
        val safeId = prefs.rememberedIdentifier.replace("\n", " ").replace("=", " ").take(120)
        val currency = prefs.currency.takeIf { it in AllowedCurrencies } ?: "TMT"
        file.writeText(
            listOf(
                "theme=${prefs.theme.key}",
                "themeChosen=${prefs.themeChosen}",
                "currency=$currency",
                "notifications=${prefs.notificationsEnabled}",
                "rememberedIdentifier=$safeId",
            ).joinToString("\n"),
        )
    }

    companion object {
        val AllowedCurrencies = setOf("TMT", "USD", "EUR")
    }
}
