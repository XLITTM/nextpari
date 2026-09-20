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
        assertThat(NextpariSportIcons.premiumTint("all")).isEqualTo(Color(0xFF16D982))
        assertThat(NextpariSportIcons.premiumTint("football")).isEqualTo(Color(0xFF20B86A))
        assertThat(NextpariSportIcons.premiumTint("futsal")).isEqualTo(Color(0xFF00BFA6))
        assertThat(NextpariSportIcons.premiumTint("tennis")).isEqualTo(Color(0xFFB7D900))
        assertThat(NextpariSportIcons.premiumTint("basketball")).isEqualTo(Color(0xFFFF7A1A))
        assertThat(NextpariSportIcons.premiumTint("hockey")).isEqualTo(Color(0xFF2F9BFF))
        assertThat(NextpariSportIcons.premiumTint("volleyball")).isEqualTo(Color(0xFF8B5CF6))
        assertThat(NextpariSportIcons.premiumTint("beach-volleyball")).isEqualTo(Color(0xFF06B6D4))
        assertThat(NextpariSportIcons.premiumTint("esports")).isEqualTo(Color(0xFF00CFA5))
        assertThat(NextpariSportIcons.premiumTint("table-tennis")).isEqualTo(Color(0xFF14B8A6))
        assertThat(NextpariSportIcons.premiumTint("badminton")).isEqualTo(Color(0xFFF59E0B))
        assertThat(NextpariSportIcons.premiumTint("baseball")).isEqualTo(Color(0xFFF43F5E))
        assertThat(NextpariSportIcons.premiumTint("polo")).isEqualTo(Color(0xFFA855F7))
        assertThat(NextpariSportIcons.premiumTint("cricket")).isEqualTo(Color(0xFF65A30D))
        assertThat(NextpariSportIcons.premiumTint("snooker")).isEqualTo(Color(0xFF7C3AED))
        assertThat(NextpariSportIcons.premiumTint("pickleball")).isEqualTo(Color(0xFFEAB308))
        assertThat(NextpariSportIcons.premiumTint("ufc")).isEqualTo(Color(0xFFEF4444))
        assertThat(NextpariSportIcons.premiumTint("mma")).isEqualTo(Color(0xFFEF4444))
        assertThat(NextpariSportIcons.premiumTint("fifa")).isEqualTo(Color(0xFF22C55E))
        assertThat(NextpariSportIcons.premiumTint("mk")).isEqualTo(Color(0xFFE11D48))
        assertThat(NextpariSportIcons.premiumTint("polybet")).isEqualTo(Color(0xFF6366F1))
        assertThat(NextpariSportIcons.premiumTint("elections")).isEqualTo(Color(0xFF3B82F6))
        assertThat(NextpariSportIcons.premiumTint("filter")).isEqualTo(Color(0xFF64748B))
        listOf("football", "hockey", "volleyball").forEach { id ->
            assertThat(NextpariIconPalette.isRawBlack(NextpariSportIcons.premiumTint(id))).isFalse()
        }
    }

    @Test
    fun everyProductionSportHasDedicatedProfessionalVectorAndColor() {
        NextpariIconPalette.Sport.productionIds.forEach { id ->
            assertThat(NextpariSportIcons.vector(id).name).isNotEqualTo("professional.SportDefault")
            assertThat(NextpariSportIcons.vector(id).name).startsWith("professional.Sport")
            assertThat(NextpariIconPalette.isRawBlack(NextpariIconPalette.Sport.of(id))).isFalse()
        }
        assertThat(NextpariSportIcons.vector("mma").name).isEqualTo("professional.SportUfc")
        assertThat(NextpariSportIcons.vector("mma").name).isEqualTo(NextpariSportIcons.vector("ufc").name)
        assertThat(NextpariSportIcons.vector("snooker").name).isEqualTo("professional.SportSnooker")
        assertThat(NextpariSportIcons.vector("polo").name).isEqualTo("professional.SportPolo")
        assertThat(NextpariSportIcons.vector("cricket").name).isEqualTo("professional.SportCricket")
        assertThat(SportIconRes.knownIds).doesNotContain("poker")
        assertThat(NextpariIconPalette.Sport.productionIds).doesNotContain("poker")
        assertThat(NextpariIconPalette.Sport.productionIds.toSet()).containsExactlyElementsIn(SportIconRes.knownIds)
        assertThat(NextpariIconPalette.MainTab.of("top")).isEqualTo(Color(0xFFD59A36))
        assertThat(NextpariIconPalette.MainTab.of("sport")).isEqualTo(Color(0xFF22B86A))
        assertThat(NextpariIconPalette.MainTab.of("esports")).isEqualTo(Color(0xFF7C5CFC))
        assertThat(NextpariIconPalette.MainTab.of("casino")).isEqualTo(Color(0xFFEC4899))
        assertThat(NextpariIconPalette.MainTab.of("games")).isEqualTo(Color(0xFF06A9D8))
        assertThat(NextpariIconPalette.BottomNav.of(Destinations.HOME)).isEqualTo(Color(0xFFF59E0B))
        assertThat(NextpariIconPalette.BottomNav.of(Destinations.FAVORITES)).isEqualTo(Color(0xFFEC4899))
        assertThat(NextpariIconPalette.BottomNav.of(Destinations.HISTORY)).isEqualTo(Color(0xFF3B82F6))
        assertThat(NextpariIconPalette.BottomNav.of(Destinations.MENU)).isEqualTo(Color(0xFF8B5CF6))
        val badge = moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariPremiumIcon.kt").readText()
        assertThat(badge).contains("fun NextpariPremiumIconBadge")
        assertThat(badge).contains("fun NextpariSportIconBadge")
        assertThat(moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariIconPalette.kt").exists()).isTrue()
    }

    @Test
    fun chromeAndMenuHaveDistinctSemanticColors() {
        val tabs = listOf("top", "sport", "esports", "casino", "games").map { NextpariIconPalette.MainTab.of(it) }
        assertThat(tabs.toSet()).hasSize(5)
        val nav = listOf(Destinations.HOME, Destinations.FAVORITES, Destinations.HISTORY, Destinations.MENU)
            .map { NextpariIconPalette.BottomNav.of(it) }
        assertThat(nav.toSet()).hasSize(4)
        val menu = listOf(
            "LIVE", "Линия", "Киберспорт", "Слоты", "Лайв казино", "Games", "Промокоды",
            "Непобедимый", "Поддержка", "Аутентификатор", "ТОТО", "Финставки",
            "Бетконструктор", "Сканер купонов", "Уведомления", "Инфо", "Управление счетом",
        ).map { NextpariIconPalette.Menu.of(it) }
        assertThat(menu.toSet().size).isAtLeast(10)
        assertThat(NextpariIcons.pack(NextpariIconVariant.Premium)).isSameInstanceAs(NextpariProfessionalIcons)
        assertThat(NextpariIconConfig.defaultVariant).isEqualTo(NextpariIconVariant.Premium)
        assertThat(NextpariIcons.pack(NextpariIconVariant.Legacy)).isSameInstanceAs(NextpariLegacyIcons)
    }

    @Test
    fun playerScreensDoNotImportMaterialIconsDirectly() {
        val roots = listOf(
            moduleFile("src/main/java/com/nextpari/app/feature"),
            moduleFile("src/main/java/com/nextpari/app/core/ui/components"),
        )
        roots.filter { it.exists() }.forEach { root ->
            root.walkTopDown().filter { it.isFile && it.extension == "kt" }.forEach { file ->
                val text = file.readText()
                assertThat(text).doesNotContain("import androidx.compose.material.icons")
            }
        }
        val legacy = moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariLegacyIcons.kt").readText()
        assertThat(legacy).contains("import androidx.compose.material.icons")
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
        assertThat(bottomNav).contains("NextpariReferenceIconAssets.bottomNavKey")
        assertThat(bottomNav).contains("NextpariReferenceIcon")
        assertThat(bottomNav).contains("bottom_betslip")
        assertThat(bottomNav).contains("NextpariIcons.Betslip")
        assertThat(bottomNav).doesNotContain("Icons.Outlined.LocalFireDepartment")
        assertThat(bottomNav).doesNotContain("Icons.Outlined.ConfirmationNumber")
        assertThat(tabs).contains("NextpariReferenceIconAssets.mainTabKey")
        assertThat(tabs).contains("NextpariIcons.mainTab(tab.id)")
        assertThat(tabs).doesNotContain("Icons.Outlined.EmojiEvents")
        assertThat(header).contains("NextpariIcons.Add")
        assertThat(header).contains("NextpariIcons.ThemeLight")
        assertThat(header).contains("NextpariIcons.Settings")
        assertThat(header).contains("NextpariIcons.Search")
        assertThat(header).contains("service_search")
        assertThat(header).contains("menu_settings")
        assertThat(header).doesNotContain("Icons.Outlined.Add")
        assertThat(menu).contains("NextpariReferenceIconAssets.menuTabKey")
        assertThat(menu).contains("NextpariReferenceIconAssets.menuRowKey")
        assertThat(menu).contains("NextpariIcons.menuTab(label)")
        assertThat(menu).contains("NextpariIcons.menuRow(label)")
        assertThat(menu).contains("menu_profile")
        assertThat(menu).contains("service_logout")
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

    @Test
    fun everyManifestKeyResolvesToExactDarkAndLightDrawables() {
        assertThat(NextpariReferenceIconAssets.specs).hasSize(59)
        NextpariReferenceIconAssets.keys.forEach { key ->
            val spec = NextpariReferenceIconAssets.spec(key)
            assertThat(spec.darkRes).isNotEqualTo(0)
            assertThat(spec.lightRes).isNotEqualTo(0)
            assertThat(spec.darkRes).isNotEqualTo(spec.lightRes)
            assertThat(drawableFile("np_ref_dark_$key.png").exists()).isTrue()
            assertThat(drawableFile("np_ref_light_$key.png").exists()).isTrue()
            assertThat(NextpariReferenceIconAssets.res(key, true)).isEqualTo(spec.darkRes)
            assertThat(NextpariReferenceIconAssets.res(key, false)).isEqualTo(spec.lightRes)
            assertThat(NextpariReferenceIconAssets.appliesTint(key)).isFalse()
        }
    }

    @Test
    fun bottomNavMainTabsSportsMenuAndServiceUseExactReferenceKeys() {
        assertThat(NextpariReferenceIconAssets.bottomNavKey(Destinations.HOME)).isEqualTo("bottom_popular")
        assertThat(NextpariReferenceIconAssets.bottomNavKey(Destinations.FAVORITES)).isEqualTo("bottom_favorites")
        assertThat(NextpariReferenceIconAssets.bottomNavKey(Destinations.BETSLIP)).isEqualTo("bottom_betslip")
        assertThat(NextpariReferenceIconAssets.bottomNavKey(Destinations.HISTORY)).isEqualTo("bottom_history")
        assertThat(NextpariReferenceIconAssets.bottomNavKey(Destinations.MENU)).isEqualTo("bottom_menu")
        assertThat(NextpariReferenceIconAssets.mainTabKey("top")).isEqualTo("tab_top")
        assertThat(NextpariReferenceIconAssets.mainTabKey("sport")).isEqualTo("tab_sport")
        assertThat(NextpariReferenceIconAssets.mainTabKey("esports")).isEqualTo("tab_esports")
        assertThat(NextpariReferenceIconAssets.mainTabKey("casino")).isEqualTo("tab_casino")
        assertThat(NextpariReferenceIconAssets.mainTabKey("games")).isEqualTo("tab_games")
        listOf(
            "football", "tennis", "basketball", "hockey", "volleyball", "esports", "futsal",
            "table-tennis", "badminton", "baseball", "cricket", "polo", "snooker", "pickleball",
            "beach-volleyball", "fifa", "mk", "polybet", "elections", "filter", "all",
        ).forEach { id ->
            assertThat(NextpariReferenceIconAssets.contains(NextpariReferenceIconAssets.sportKey(id))).isTrue()
            assertThat(NextpariSportIcons.resolves(id, NextpariIconVariant.Premium)).isTrue()
        }
        assertThat(NextpariReferenceIconAssets.sportKey("mk")).isEqualTo("sport_mk")
        assertThat(NextpariReferenceIconAssets.sportKey("polybet")).isEqualTo("sport_polybet")
        assertThat(NextpariReferenceIconAssets.sportKey("ufc")).isEqualTo("sport_ufc_mma")
        assertThat(NextpariReferenceIconAssets.sportKey("mma")).isEqualTo("sport_ufc_mma")
        assertThat(NextpariReferenceIconAssets.sportKey("polo")).isEqualTo("sport_polo")
        assertThat(NextpariReferenceIconAssets.sportKey("pickleball")).isEqualTo("sport_pickleball")
        assertThat(NextpariReferenceIconAssets.menuTabKey("Топ")).isEqualTo("tab_top")
        assertThat(NextpariReferenceIconAssets.menuRowKey("LIVE")).isEqualTo("menu_live")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Линия")).isEqualTo("menu_line")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Киберспорт")).isEqualTo("menu_esports")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Слоты")).isEqualTo("menu_slots")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Лайв казино")).isEqualTo("menu_live_casino")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Games")).isEqualTo("menu_games")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Промокоды")).isEqualTo("menu_promo")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Непобедимый")).isEqualTo("menu_vip")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Поддержка")).isEqualTo("menu_support")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Управление счетом")).isEqualTo("menu_account")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Аутентификатор")).isEqualTo("service_authenticator")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Повысьте безопасность!")).isEqualTo("service_security")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Уведомления")).isEqualTo("service_notifications")
        assertThat(NextpariReferenceIconAssets.menuRowKey("Инфо")).isEqualTo("service_info")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Search)).isEqualTo("service_search")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Notifications)).isEqualTo("service_notifications")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.ThemeLight)).isEqualTo("service_light_theme")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.ThemeDark)).isEqualTo("service_dark_theme")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Back)).isEqualTo("service_back")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.ChevronDown)).isEqualTo("service_down")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Close)).isEqualTo("service_close")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Share)).isEqualTo("service_share")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Info)).isEqualTo("service_info")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Security)).isEqualTo("service_security")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Authenticator)).isEqualTo("service_authenticator")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Logout)).isEqualTo("service_logout")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Profile)).isEqualTo("menu_profile")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Mail)).isEqualTo("menu_messages")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Settings)).isEqualTo("menu_settings")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Wallet)).isEqualTo("menu_account")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Deposit)).isEqualTo("menu_deposit")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Cashback)).isEqualTo("menu_cashback")
        assertThat(NextpariReferenceIconAssets.iconKey(NextpariIconKey.Support)).isEqualTo("menu_support")
    }

    @Test
    fun premiumCoveredKeysUseExactPngNotPhosphorOrMaterialAndLegacyRemains() {
        val reference = moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariReferenceIcon.kt").readText()
        val sports = moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariSportIcons.kt").readText()
        val badge = moduleFile("src/main/java/com/nextpari/app/core/ui/icons/NextpariPremiumIcon.kt").readText()
        val bottomNav = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariBottomNav.kt").readText()
        val tabs = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariMainTabs.kt").readText()
        val menu = moduleFile("src/main/java/com/nextpari/app/feature/menu/MenuScreen.kt").readText()
        assertThat(reference).contains("painterResource")
        assertThat(reference).doesNotContain("ColorFilter")
        assertThat(sports).contains("NextpariReferenceIcon")
        assertThat(badge).contains("NextpariReferenceIcon")
        assertThat(bottomNav).contains("isPremiumIcons()")
        assertThat(bottomNav).contains("NextpariReferenceIcon")
        assertThat(tabs).contains("NextpariReferenceIcon")
        assertThat(menu).contains("NextpariReferenceIcon")
        assertThat(menu).doesNotContain("NextpariPremiumIcon(")
        assertThat(bottomNav).doesNotContain("import androidx.compose.material.icons")
        assertThat(NextpariIconConfig.defaultVariant).isEqualTo(NextpariIconVariant.Premium)
        assertThat(NextpariIconVariant.entries).contains(NextpariIconVariant.Legacy)
        assertThat(NextpariIcons.pack(NextpariIconVariant.Legacy)).isSameInstanceAs(NextpariLegacyIcons)
        assertThat(Destinations.HOME).isEqualTo("home")
        assertThat(Destinations.WALLET).isEqualTo("wallet")
    }

    private fun drawableFile(name: String): File {
        val candidates = listOf(
            File("src/main/res/drawable-nodpi/$name"),
            File("app/src/main/res/drawable-nodpi/$name"),
            File("android/app/src/main/res/drawable-nodpi/$name"),
        )
        return candidates.firstOrNull { it.exists() } ?: File("src/main/res/drawable-nodpi/$name")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
