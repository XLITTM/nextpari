package com.nextpari.app.feature.settings

import android.content.Intent
import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import com.nextpari.app.feature.wallet.FakeWalletRepository
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.io.File

class SettingsCatalogTest {
    @Test
    fun rootSectionsMatchProductionOrder() {
        assertThat(SettingsCatalog.sections.map { it.title }).containsExactly(
            "Управление счётом",
            "Безопасность",
            "Настройки ставок",
            "Настройки приложения",
            "О приложении",
        ).inOrder()
        assertThat(SettingsCatalog.accountLabels).containsExactly("Пополнить", "Вывести").inOrder()
        assertThat(SettingsCatalog.securityLabels).containsExactly(
            "Электронная почта",
            "Привязать почту",
            "Сменить пароль",
        ).inOrder()
        assertThat(SettingsCatalog.bettingLabels).containsExactly("Провод ставки", "Ставка в 1 клик").inOrder()
        assertThat(SettingsCatalog.applicationLabels).containsExactly(
            "Тип коэффициентов",
            "Push",
            "Выбор языка",
        ).inOrder()
        assertThat(SettingsCatalog.aboutLabels).containsExactly("Поделиться", "Выйти").inOrder()
        assertThat(SettingsCatalog.ODDS_FORMAT_VALUE).isEqualTo("Десятичные")
        assertThat(SettingsCatalog.emailActionLabel("")).isEqualTo("Привязать почту")
        assertThat(SettingsCatalog.emailActionLabel("a@b.c")).isEqualTo("Изменить почту")
        assertThat(SettingsCatalog.emailStatus("")).isEqualTo("Почта не привязана")
    }

    @Test
    fun settingsScreenDropsOldThemeRowsAndDebugCopy() {
        val screen = moduleFile("src/main/java/com/nextpari/app/feature/settings/SettingsScreen.kt").readText()
        val catalog = moduleFile("src/main/java/com/nextpari/app/feature/settings/SettingsCatalog.kt").readText()
        val blob = screen + catalog
        assertThat(blob).doesNotContain("Тема")
        assertThat(blob).doesNotContain("Светлая")
        assertThat(blob).doesNotContain("Тёмная")
        assertThat(blob).doesNotContain("Предпросмотр спортбука")
        listOf("DEV", "mock", "A001", "A002", "A003", "A004", "debug", "repository", "API not connected").forEach { token ->
            assertThat(blob).doesNotContain(token)
        }
        assertThat(screen).contains("Управление счётом")
        assertThat(screen).contains("Безопасность")
        assertThat(screen).contains("Настройки ставок")
        assertThat(screen).contains("Настройки приложения")
        assertThat(screen).contains("О приложении")
        assertThat(screen).contains("Пополнить")
        assertThat(screen).contains("Вывести")
        assertThat(screen).contains("Электронная почта")
        assertThat(screen).contains("Сменить пароль")
        assertThat(screen).contains("Провод ставки")
        assertThat(screen).contains("Ставка в 1 клик")
        assertThat(screen).contains("Тип коэффициентов")
        assertThat(screen).contains("Push")
        assertThat(screen).contains("Выбор языка")
        assertThat(screen).contains("Поделиться")
        assertThat(screen).contains("Выйти")
        assertThat(screen).contains("Intent.ACTION_SEND")
        assertThat(screen).contains("text/plain")
        assertThat(screen).contains("SettingsCatalog.shareText")
        assertThat(SettingsCatalog.SHARE_URL).isEqualTo("https://nextpari.net/")
        assertThat(SettingsCatalog.shareText).contains("https://nextpari.net/")
        assertThat(screen).doesNotContain("localhost")
        assertThat(screen).contains("onLogout")
        assertThat(screen).contains("Destinations.WALLET")
    }

    @Test
    fun oddsPoliciesMatchProductionValuesAndOrder() {
        assertThat(OddsChangePolicy.ids).containsExactly("any", "increase", "none").inOrder()
        assertThat(SettingsCatalog.oddsPolicies.map { it.id }).containsExactly("any", "increase", "none").inOrder()
        assertThat(SettingsCatalog.oddsPolicies.map { it.label }).containsExactly(
            "Принимать любое изменение",
            "Принимать только повышение",
            "Не принимать изменения",
        ).inOrder()
        assertThat(SettingsCatalog.laterRows.map { it.label }).containsExactly(
            "Push-уведомления о ставках",
            "Очищать купон после ставки",
            "Быстрые суммы",
            "VIP-ставка",
        ).inOrder()
    }

    @Test
    fun oddsPolicyPersistsLocallyWithoutTokens() = runTest {
        val prefs = InMemoryPreferencesStorage()
        val repository = OddsChangePolicyRepository(prefs)
        assertThat(repository.read()).isEqualTo(OddsChangePolicy.INCREASE)
        repository.write(OddsChangePolicy.ANY)
        assertThat(repository.read()).isEqualTo(OddsChangePolicy.ANY)
        assertThat(prefs.getString(OddsChangePolicyRepository.KEY)).isEqualTo("any")
        repository.write(OddsChangePolicy.NONE)
        assertThat(repository.read()).isEqualTo(OddsChangePolicy.NONE)
        repository.write(OddsChangePolicy.INCREASE)
        assertThat(prefs.getString(OddsChangePolicyRepository.KEY)).isEqualTo("increase")
        assertThat(prefs.getString("access_token")).isNull()
        assertThat(prefs.getString("refresh_token")).isNull()
    }

    @Test
    fun accountSecurityNeverMutatesPasswordEmailOrMoney() {
        val valid = AccountSecurity.changePassword("current-pass", "new-password", "new-password")
        assertThat(valid).isInstanceOf(AccountSecurityResult.Unavailable::class.java)
        assertThat((valid as AccountSecurityResult.Unavailable).message).isEqualTo(SettingsCatalog.SESSION_REQUIRED)
        assertThat(AccountSecurity.changePassword("", "new-password", "new-password"))
            .isEqualTo(AccountSecurityResult.Invalid(SettingsCatalog.CURRENT_PASSWORD_INVALID))
        assertThat(AccountSecurity.changePassword("old-pass", "short", "short"))
            .isEqualTo(AccountSecurityResult.Invalid(SettingsCatalog.PASSWORD_POLICY))
        assertThat(AccountSecurity.changePassword("old-pass", "new-password", "other-password"))
            .isEqualTo(AccountSecurityResult.Invalid(SettingsCatalog.PASSWORD_MISMATCH))
        assertThat(AccountSecurity.startEmailBinding("player@nextpari.net"))
            .isInstanceOf(AccountSecurityResult.Unavailable::class.java)
        assertThat(AccountSecurity.startEmailBinding("not-an-email"))
            .isEqualTo(AccountSecurityResult.Invalid(SettingsCatalog.INVALID_EMAIL))
        assertThat(AccountSecurity.verifyEmailCode("123456"))
            .isInstanceOf(AccountSecurityResult.Unavailable::class.java)

        val sources = listOf(
            "src/main/java/com/nextpari/app/feature/settings/SettingsScreen.kt",
            "src/main/java/com/nextpari/app/feature/settings/AccountSecurity.kt",
            "src/main/java/com/nextpari/app/feature/settings/SettingsCatalog.kt",
            "src/main/java/com/nextpari/app/feature/settings/SettingsViewModel.kt",
            "src/main/java/com/nextpari/app/feature/settings/OddsChangePolicyRepository.kt",
        ).joinToString("\n") { moduleFile(it).readText() }
        assertThat(sources).doesNotContain("/api/player/auth/change-password")
        assertThat(sources).doesNotContain("/api/player/email/start")
        assertThat(sources).doesNotContain("OkHttpClient")
        assertThat(sources).doesNotContain("Retrofit")
        assertThat(sources).doesNotContain("WalletRepository")
        assertThat(sources).doesNotContain("sports_engine")
        assertThat(sources).doesNotContain("wallet_ledger")
        assertThat(FakeWalletRepository().snapshot().displayBalance).isNotEmpty()
        assertThat(Destinations.WALLET).isEqualTo("wallet")
        assertThat(SettingsCatalog.shareText).isEqualTo("Nextpari\nhttps://nextpari.net/")
        assertThat(Intent.ACTION_SEND).isEqualTo("android.intent.action.SEND")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(
            File(relative),
            File("app/$relative"),
            File("android/app/$relative"),
        )
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
