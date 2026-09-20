package com.nextpari.app.core.ui.icons

import androidx.compose.ui.graphics.Color
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
            assertThat(premium.name).startsWith("professional.")
            assertThat(legacy.name).doesNotContain("professional.")
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
            assertThat(NextpariSportIcons.vector(id).name).isNotEqualTo("professional.SportDefault")
            assertThat(NextpariSportIcons.vector(id).name).startsWith("professional.Sport")
        }
        assertThat(NextpariSportIcons.legacyDrawable("unknown-sport")).isEqualTo(R.drawable.ic_sport_default)
        assertThat(NextpariSportIcons.vector("unknown-sport").name).isEqualTo("professional.SportDefault")
        assertThat(NextpariSportIcons.canonicalId("futsal")).isEqualTo("football")
        assertThat(NextpariSportIcons.canonicalId("beach-volleyball")).isEqualTo("volleyball")
        assertThat(NextpariSportIcons.vector("futsal").name).isEqualTo("professional.SportFutsal")
        assertThat(NextpariSportIcons.vector("beach-volleyball").name)
            .isEqualTo("professional.SportBeachVolleyball")
        assertThat(NextpariSportIcons.vector("futsal").name)
            .isNotEqualTo(NextpariSportIcons.vector("football").name)
        assertThat(NextpariSportIcons.vector("beach-volleyball").name)
            .isNotEqualTo(NextpariSportIcons.vector("volleyball").name)
    }

    @Test
    fun prioritySportsHaveDedicatedPremiumIcons() {
        val football = NextpariSportIcons.vector("football")
        val tennis = NextpariSportIcons.vector("tennis")
        val basketball = NextpariSportIcons.vector("basketball")
        val hockey = NextpariSportIcons.vector("hockey")
        val volleyball = NextpariSportIcons.vector("volleyball")
        val esports = NextpariSportIcons.vector("esports")
        assertThat(football.name).isEqualTo("professional.SportFootball")
        assertThat(tennis.name).isEqualTo("professional.SportTennis")
        assertThat(basketball.name).isEqualTo("professional.SportBasketball")
        assertThat(hockey.name).isEqualTo("professional.SportHockey")
        assertThat(volleyball.name).isEqualTo("professional.SportVolleyball")
        assertThat(esports.name).isEqualTo("professional.SportEsports")
        val names = listOf(football, tennis, basketball, hockey, volleyball, esports).map { it.name }
        assertThat(names.toSet()).hasSize(6)
        names.forEach { name ->
            assertThat(name).isNotEqualTo("professional.SportDefault")
        }
    }

    @Test
    fun premiumSportTintPaletteMatchesApprovedColors() {
        assertThat(NextpariSportIcons.premiumTint("all", true)).isEqualTo(Color(0xFF16D982))
        assertThat(NextpariSportIcons.premiumTint("football", true)).isEqualTo(Color.White)
        assertThat(NextpariSportIcons.premiumTint("football", false)).isEqualTo(Color(0xFF0F172A))
        assertThat(NextpariSportIcons.premiumTint("tennis", true)).isEqualTo(Color(0xFFC7F000))
        assertThat(NextpariSportIcons.premiumTint("basketball", false)).isEqualTo(Color(0xFFFF7A1A))
        assertThat(NextpariSportIcons.premiumTint("hockey", true)).isEqualTo(Color.White)
        assertThat(NextpariSportIcons.premiumTint("hockey", false)).isEqualTo(Color(0xFF0F172A))
        assertThat(NextpariSportIcons.premiumTint("volleyball", true)).isEqualTo(Color.White)
        assertThat(NextpariSportIcons.premiumTint("volleyball", false)).isEqualTo(Color(0xFF0F172A))
        assertThat(NextpariSportIcons.premiumTint("esports", true)).isEqualTo(Color(0xFF22F39A))
        assertThat(NextpariSportIcons.premiumTint("cricket", true)).isEqualTo(NextpariSportIconTint)
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

    @Test
    fun premiumUsesProfessionalPhosphorPackNotCursorDrawnGeometry() {
        assertThat(NextpariIcons.pack(NextpariIconVariant.Premium))
            .isSameInstanceAs(NextpariProfessionalIcons)
        assertThat(NextpariIcons.pack(NextpariIconVariant.Premium))
            .isNotSameInstanceAs(NextpariPremiumIcons)
        val registry = moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariIcons.kt").readText()
        assertThat(registry).contains("NextpariProfessionalIcons")
        assertThat(registry).doesNotContain("NextpariIconVariant.Premium -> NextpariPremiumIcons")
        assertThat(moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariPremiumIcons.kt").exists()).isTrue()
        val generated = moduleFile("src/main/java/com/nextpari/app/core/ui/icons/ProfessionalPremiumIcons.kt")
        assertThat(generated.exists()).isTrue()
        val text = generated.readText()
        assertThat(text).contains("AUTO-GENERATED")
        assertThat(text).contains("Phosphor Icons")
        assertThat(Regex("""val \w+: ImageVector""").findAll(text).count()).isEqualTo(83)
        assertThat(text).contains("val CaretRight")
        assertThat(text).contains("val CaretLeft")
        assertThat(text).contains("val Warning")
        assertThat(text).contains("val Globe")
        assertThat(text).contains("val Language")
        assertThat(text).contains("val Check")
        assertThat(text).contains("val FactCheck")
        assertThat(text).contains("val Book")
        assertThat(text).contains("val Save")
        assertThat(text).contains("val Place")
        assertThat(text).contains("val BottomPopular")
        assertThat(text).contains("val ChevronDown")
    }

    @Test
    fun premiumSemanticMappingsUseDedicatedProfessionalVectors() {
        val premium = NextpariIconVariant.Premium
        val chevronRight = NextpariIcons.vector(NextpariIconKey.ChevronRight, premium)
        val chevronDown = NextpariIcons.vector(NextpariIconKey.ChevronDown, premium)
        val forward = NextpariIcons.vector(NextpariIconKey.Forward, premium)
        val back = NextpariIcons.vector(NextpariIconKey.Back, premium)
        val info = NextpariIcons.vector(NextpariIconKey.Info, premium)
        val warning = NextpariIcons.vector(NextpariIconKey.Warning, premium)
        val check = NextpariIcons.vector(NextpariIconKey.Check, premium)
        val globe = NextpariIcons.vector(NextpariIconKey.Globe, premium)
        val language = NextpariIcons.vector(NextpariIconKey.Language, premium)
        val factCheck = NextpariIcons.vector(NextpariIconKey.FactCheck, premium)
        val book = NextpariIcons.vector(NextpariIconKey.Book, premium)
        val save = NextpariIcons.vector(NextpariIconKey.Save, premium)
        val place = NextpariIcons.vector(NextpariIconKey.Place, premium)
        assertThat(chevronRight.name).isEqualTo("professional.CaretRight")
        assertThat(forward.name).isEqualTo("professional.CaretRight")
        assertThat(chevronDown.name).isEqualTo("professional.ChevronDown")
        assertThat(chevronRight.name).isNotEqualTo(chevronDown.name)
        assertThat(forward.name).isNotEqualTo(chevronDown.name)
        assertThat(back.name).isEqualTo("professional.Back")
        assertThat(warning.name).isEqualTo("professional.Warning")
        assertThat(check.name).isEqualTo("professional.Check")
        assertThat(globe.name).isEqualTo("professional.Globe")
        assertThat(language.name).isEqualTo("professional.Language")
        assertThat(factCheck.name).isEqualTo("professional.FactCheck")
        assertThat(book.name).isEqualTo("professional.Book")
        assertThat(save.name).isEqualTo("professional.Save")
        assertThat(place.name).isEqualTo("professional.Place")
        assertThat(info.name).isEqualTo("professional.Info")
        assertThat(warning.name).isNotEqualTo(info.name)
        assertThat(check.name).isNotEqualTo(info.name)
        assertThat(globe.name).isNotEqualTo(info.name)
        assertThat(language.name).isNotEqualTo(info.name)
        assertThat(factCheck.name).isNotEqualTo(info.name)
        assertThat(book.name).isNotEqualTo(info.name)
        assertThat(NextpariIcons.pack(premium)).isSameInstanceAs(NextpariProfessionalIcons)
        assertThat(NextpariIcons.vector(NextpariIconKey.ChevronRight, NextpariIconVariant.Legacy).name)
            .isNotEqualTo(chevronRight.name)
        assertThat(NextpariIcons.vector(NextpariIconKey.Warning, NextpariIconVariant.Legacy).name)
            .isNotEqualTo(warning.name)
    }

    @Test
    fun bottomNavAndMainTabsUseApprovedProfessionalVectors() {
        assertThat(NextpariIcons.bottomNav(Destinations.HOME).name).isEqualTo("professional.BottomPopular")
        assertThat(NextpariIcons.bottomNav(Destinations.FAVORITES).name).isEqualTo("professional.BottomFavorites")
        assertThat(NextpariIcons.bottomNav(Destinations.BETSLIP).name).isEqualTo("professional.BottomBetslip")
        assertThat(NextpariIcons.bottomNav(Destinations.HISTORY).name).isEqualTo("professional.BottomHistory")
        assertThat(NextpariIcons.bottomNav(Destinations.MENU).name).isEqualTo("professional.BottomMenu")
        assertThat(NextpariIcons.mainTab("top").name).isEqualTo("professional.TabTop")
        assertThat(NextpariIcons.mainTab("sport").name).isEqualTo("professional.TabSport")
        assertThat(NextpariIcons.mainTab("esports").name).isEqualTo("professional.TabEsports")
        assertThat(NextpariIcons.mainTab("casino").name).isEqualTo("professional.TabCasino")
        assertThat(NextpariIcons.mainTab("games").name).isEqualTo("professional.TabGames")
    }

    @Test
    fun phosphorLicenseIsPresent() {
        val assets = moduleFile("src/main/assets/third_party/PHOSPHOR_LICENSE.txt")
        assertThat(assets.exists()).isTrue()
        assertThat(assets.readText()).contains("MIT")
        val pack = listOf(
            File("../design/nextpari_professional_icon_pack/PHOSPHOR_LICENSE.txt"),
            File("android/design/nextpari_professional_icon_pack/PHOSPHOR_LICENSE.txt"),
            File("design/nextpari_professional_icon_pack/PHOSPHOR_LICENSE.txt"),
        ).firstOrNull { it.exists() }
        assertThat(pack).isNotNull()
        assertThat(pack!!.readText()).contains("MIT")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
