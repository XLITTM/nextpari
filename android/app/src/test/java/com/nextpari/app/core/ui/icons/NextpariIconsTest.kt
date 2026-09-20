package com.nextpari.app.core.ui.icons

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.R
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.feature.home.SportIconRes
import org.junit.Test
import java.io.File

class NextpariIconsTest {
    @Test
    fun defaultVariantIsPremiumAndLegacyStillExists() {
        assertThat(NextpariIconConfig.defaultVariant).isEqualTo(NextpariIconVariant.Premium)
        assertThat(NextpariIconVariant.entries).containsExactly(
            NextpariIconVariant.Legacy,
            NextpariIconVariant.Premium,
        ).inOrder()
        val config = moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariIconVariant.kt").readText()
        assertThat(config).contains("val defaultVariant: NextpariIconVariant = NextpariIconVariant.Premium")
        assertThat(config).contains("val defaultVariant = NextpariIconVariant.Legacy")
        assertThat(config).doesNotContain("Premium icons")
        assertThat(config).doesNotContain("Legacy icons")
    }

    @Test
    fun everySemanticKeyHasLegacyAndPremiumMappings() {
        NextpariIconKey.entries.forEach { key ->
            val legacy = NextpariIcons.vector(key, NextpariIconVariant.Legacy)
            val premium = NextpariIcons.vector(key, NextpariIconVariant.Premium)
            assertThat(legacy.name).isNotEmpty()
            assertThat(premium.name).isNotEmpty()
            assertThat(premium.name).startsWith("premium.")
            assertThat(legacy.name).doesNotContain("premium.")
        }
        assertThat(NextpariIcons.Home.name).isEqualTo(
            NextpariIcons.vector(NextpariIconKey.Home, NextpariIconVariant.Premium).name,
        )
        assertThat(NextpariIcons.vector(NextpariIconKey.Betslip, NextpariIconVariant.Premium).name)
            .isNotEqualTo(NextpariIcons.vector(NextpariIconKey.Betslip, NextpariIconVariant.Legacy).name)
    }

    @Test
    fun requiredSportsResolveInBothVariantsAndUnknownFallsBack() {
        NextpariSportIcons.requiredIds.forEach { id ->
            assertThat(NextpariSportIcons.resolves(id, NextpariIconVariant.Legacy)).isTrue()
            assertThat(NextpariSportIcons.resolves(id, NextpariIconVariant.Premium)).isTrue()
            assertThat(NextpariSportIcons.legacyDrawable(id)).isEqualTo(SportIconRes.drawable(id))
            assertThat(NextpariSportIcons.legacyDrawable(id)).isNotEqualTo(R.drawable.ic_sport_default)
            assertThat(NextpariSportIcons.vector(id).name).isNotEqualTo("premium.sport.default")
        }
        assertThat(NextpariSportIcons.legacyDrawable("unknown-sport")).isEqualTo(R.drawable.ic_sport_default)
        assertThat(NextpariSportIcons.vector("unknown-sport").name).isEqualTo("premium.sport.default")
        assertThat(NextpariSportIcons.canonicalId("futsal")).isEqualTo("football")
        assertThat(NextpariSportIcons.canonicalId("beach-volleyball")).isEqualTo("volleyball")
        assertThat(NextpariSportIcons.vector("futsal").name).isEqualTo("premium.sport.football")
    }

    @Test
    fun prioritySportsHaveDedicatedPremiumIcons() {
        val football = NextpariSportIcons.vector("football")
        val tennis = NextpariSportIcons.vector("tennis")
        val basketball = NextpariSportIcons.vector("basketball")
        val hockey = NextpariSportIcons.vector("hockey")
        val volleyball = NextpariSportIcons.vector("volleyball")
        val esports = NextpariSportIcons.vector("esports")
        assertThat(football.name).isEqualTo("premium.sport.football")
        assertThat(tennis.name).isEqualTo("premium.sport.tennis")
        assertThat(basketball.name).isEqualTo("premium.sport.basketball")
        assertThat(hockey.name).isEqualTo("premium.sport.hockey")
        assertThat(volleyball.name).isEqualTo("premium.sport.volleyball")
        assertThat(esports.name).isEqualTo("premium.sport.esports")
        val names = listOf(football, tennis, basketball, hockey, volleyball, esports).map { it.name }
        assertThat(names.toSet()).hasSize(6)
        names.forEach { name ->
            assertThat(name).isNotEqualTo("premium.sport.default")
        }
    }

    @Test
    fun iconPackHasNoEmojiFallback() {
        val iconsDir = moduleFile("src/main/java/com/nextpari/app/core/ui/icons")
        iconsDir.listFiles().orEmpty().forEach { file ->
            val text = file.readText()
            assertThat(text).doesNotContain("⚽")
            assertThat(text).doesNotContain("🎾")
            assertThat(text).doesNotContain("🏀")
            assertThat(text).doesNotContain("🎮")
            assertThat(text).doesNotContain("🏆")
            assertThat(text).doesNotContain("⭐")
            assertThat(text).doesNotContain("emoji")
        }
    }

    @Test
    fun chromeScreensUseCentralizedRegistry() {
        val bottomNav = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariBottomNav.kt").readText()
        val tabs = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariMainTabs.kt").readText()
        val header = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariHeader.kt").readText()
        val menu = moduleFile("src/main/java/com/nextpari/app/feature/menu/MenuScreen.kt").readText()
        assertThat(bottomNav).contains("NextpariIcons.bottomNav(route)")
        assertThat(bottomNav).contains("NextpariIcons.Betslip")
        assertThat(bottomNav).doesNotContain("Icons.Outlined.LocalFireDepartment")
        assertThat(bottomNav).doesNotContain("Icons.Outlined.ConfirmationNumber")
        assertThat(tabs).contains("NextpariIcons.mainTab(tab.id)")
        assertThat(tabs).doesNotContain("Icons.Outlined.EmojiEvents")
        assertThat(header).contains("NextpariIcons.Add")
        assertThat(header).contains("NextpariIcons.ThemeLight")
        assertThat(header).contains("NextpariIcons.Settings")
        assertThat(header).contains("NextpariIcons.Search")
        assertThat(header).doesNotContain("Icons.Outlined.Add")
        assertThat(menu).contains("NextpariIcons.menuTab(label)")
        assertThat(menu).contains("NextpariIcons.menuRow(label)")
        assertThat(menu).contains("NextpariIcons.Wallet")
        assertThat(menu).contains("NextpariIcons.ChevronDown")
        assertThat(menu).doesNotContain("Icons.Outlined.LocalFireDepartment")
        assertThat(NextpariIcons.bottomNav(Destinations.HOME).name).isEqualTo(NextpariIcons.Popular.name)
        assertThat(NextpariIcons.mainTab("sport").name).isEqualTo(NextpariIcons.Sport.name)
        assertThat(NextpariIcons.menuTab("Топ").name).isEqualTo(NextpariIcons.Top.name)
        assertThat(NextpariIcons.menuRow("LIVE").name).isEqualTo(NextpariIcons.Live.name)
        assertThat(NextpariIcons.menuRow("Аутентификатор").name).isEqualTo(NextpariIcons.Authenticator.name)
    }

    @Test
    fun navigationRoutesRemainUnchanged() {
        assertThat(Destinations.HOME).isEqualTo("home")
        assertThat(Destinations.FAVORITES).isEqualTo("favorites")
        assertThat(Destinations.BETSLIP).isEqualTo("betslip")
        assertThat(Destinations.HISTORY).isEqualTo("history")
        assertThat(Destinations.MENU).isEqualTo("menu")
        assertThat(Destinations.WALLET).isEqualTo("wallet")
        assertThat(Destinations.SETTINGS).isEqualTo("settings")
        val bottomNav = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariBottomNav.kt").readText()
        assertThat(bottomNav).contains("item.center")
        assertThat(bottomNav).contains("offset(y = (-20).dp)")
        assertThat(bottomNav).contains(".size(58.dp)")
        val header = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariHeader.kt").readText()
        assertThat(header).contains("HeaderWalletSwitcher(")
        assertThat(header).contains("clickable(onClick = onDeposit)")
    }

    @Test
    fun legacySportDrawablesArePreserved() {
        assertThat(SportIconRes.drawable("football")).isEqualTo(R.drawable.ic_sport_football)
        assertThat(SportIconRes.drawable("tennis")).isEqualTo(R.drawable.ic_sport_tennis)
        assertThat(SportIconRes.drawable("esports")).isEqualTo(R.drawable.ic_sport_esports)
        assertThat(File(moduleFile("src/main/res/drawable").path, "ic_sport_football.xml").exists()).isTrue()
        assertThat(File(moduleFile("src/main/res/drawable").path, "ic_sport_hockey.xml").exists()).isTrue()
        assertThat(File(moduleFile("src/main/res/drawable").path, "ic_sport_volleyball.xml").exists()).isTrue()
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
