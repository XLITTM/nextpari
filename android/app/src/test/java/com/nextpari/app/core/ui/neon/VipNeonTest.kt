package com.nextpari.app.core.ui.neon

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.navigation.BottomNavSpec
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.navigation.MainTabsSpec
import com.nextpari.app.core.ui.theme.NextpariColors
import com.nextpari.app.feature.wallets.WalletsCatalog
import org.junit.Test
import java.io.File

class VipNeonTest {
    @Test
    fun fourStatesMatchApprovedInteractionContract() {
        val default = VipNeon.resolve(selected = false, pressed = false, enabled = true)
        assertThat(default.phase).isEqualTo(VipNeonPhase.Default)
        assertThat(default.scale).isEqualTo(1f)
        assertThat(default.glowAlpha).isEqualTo(0f)
        assertThat(default.borderAlpha).isGreaterThan(0f)
        assertThat(default.interactive).isTrue()

        val pressed = VipNeon.resolve(selected = true, pressed = true, enabled = true)
        assertThat(pressed.phase).isEqualTo(VipNeonPhase.Pressed)
        assertThat(pressed.scale).isEqualTo(VipNeon.PRESS_SCALE)
        assertThat(pressed.scale).isEqualTo(0.98f)
        assertThat(pressed.glowAlpha).isGreaterThan(default.glowAlpha)
        assertThat(pressed.durationMillis).isAtLeast(110)
        assertThat(pressed.durationMillis).isAtMost(150)
        assertThat(pressed.interactive).isTrue()

        val selected = VipNeon.resolve(selected = true, pressed = false, enabled = true)
        assertThat(selected.phase).isEqualTo(VipNeonPhase.Selected)
        assertThat(selected.scale).isEqualTo(1f)
        assertThat(selected.glowAlpha).isGreaterThan(0f)
        assertThat(selected.glowAlpha).isLessThan(pressed.glowAlpha)
        assertThat(selected.interactive).isTrue()

        val disabled = VipNeon.resolve(selected = true, pressed = true, enabled = false)
        assertThat(disabled.phase).isEqualTo(VipNeonPhase.Disabled)
        assertThat(disabled.scale).isEqualTo(1f)
        assertThat(disabled.glowAlpha).isEqualTo(0f)
        assertThat(disabled.contentAlpha).isLessThan(1f)
        assertThat(disabled.durationMillis).isEqualTo(0)
        assertThat(disabled.interactive).isFalse()
    }

    @Test
    fun reducedMotionKeepsPressFeedbackWithoutScaleAnimation() {
        val pressed = VipNeon.resolve(
            selected = false,
            pressed = true,
            enabled = true,
            reducedMotion = true,
        )
        assertThat(pressed.phase).isEqualTo(VipNeonPhase.Pressed)
        assertThat(pressed.scale).isEqualTo(1f)
        assertThat(pressed.durationMillis).isEqualTo(0)
        assertThat(pressed.glowAlpha).isGreaterThan(0f)
    }

    @Test
    fun canonicalNavigationLabelsRoutesAndActiveTabStayIntact() {
        assertThat(BottomNavSpec.labels).containsExactly(
            "Популярное",
            "Избранное",
            "Купон",
            "История",
            "Меню",
        ).inOrder()
        assertThat(BottomNavSpec.items.map { it.route }).containsExactly(
            Destinations.HOME,
            Destinations.FAVORITES,
            Destinations.BETSLIP,
            Destinations.HISTORY,
            Destinations.MENU,
        ).inOrder()
        assertThat(MainTabsSpec.labels).containsExactly(
            "Топ",
            "Спорт",
            "Esports",
            "Казино",
            "Games",
        ).inOrder()
        assertThat(MainTabsSpec.tabs.map { it.id }).containsExactly(
            "top",
            "sport",
            "esports",
            "casino",
            "games",
        ).inOrder()
        assertThat(VipNeon.phaseFor("sport", "sport")).isEqualTo(VipNeonPhase.Selected)
        assertThat(VipNeon.phaseFor("sport", "casino")).isEqualTo(VipNeonPhase.Default)
        assertThat(VipNeon.phaseFor("games", "games", enabled = false)).isEqualTo(VipNeonPhase.Disabled)
        MainTabsSpec.tabs.forEach { tab ->
            assertThat(VipNeon.phaseFor(tab.id, tab.id)).isEqualTo(VipNeonPhase.Selected)
        }
    }

    @Test
    fun darkNeonColorsStayApprovedWithoutReplacingLightTheme() {
        assertThat(NextpariColors.Dark.bg).isEqualTo(androidx.compose.ui.graphics.Color(0xFF031522))
        assertThat(NextpariColors.Dark.surface).isEqualTo(androidx.compose.ui.graphics.Color(0xFF08283A))
        assertThat(NextpariColors.Dark.nav).isEqualTo(androidx.compose.ui.graphics.Color(0xFF061C2C))
        assertThat(NextpariColors.Dark.accent).isEqualTo(androidx.compose.ui.graphics.Color(0xFF22F39A))
        assertThat(NextpariColors.Dark.accentHover).isEqualTo(androidx.compose.ui.graphics.Color(0xFF19D985))
        assertThat(NextpariColors.Dark.text).isEqualTo(androidx.compose.ui.graphics.Color(0xFFF8FAFC))
        assertThat(NextpariColors.Dark.textSecondary).isEqualTo(androidx.compose.ui.graphics.Color(0xFF91AEC7))
        assertThat(NextpariColors.Dark.premiumGold).isEqualTo(androidx.compose.ui.graphics.Color(0xFFF5C969))
        assertThat(NextpariColors.Light.bg).isNotEqualTo(NextpariColors.Dark.bg)
        assertThat(NextpariColors.Light.surface).isNotEqualTo(NextpariColors.Dark.surface)
        assertThat(NextpariColors.Light.premiumGold).isNotEqualTo(NextpariColors.Dark.premiumGold)
        assertThat(NextpariColors.forDark(false)).isEqualTo(NextpariColors.Light)
        assertThat(NextpariColors.forDark(true)).isEqualTo(NextpariColors.Dark)
    }

    @Test
    fun lightThemeIsWhiteEmeraldWithTheSameMotionContract() {
        val light = NextpariColors.Light
        assertThat(light.surface).isEqualTo(androidx.compose.ui.graphics.Color.White)
        assertThat(light.nav).isEqualTo(androidx.compose.ui.graphics.Color.White)
        assertThat(light.text).isEqualTo(androidx.compose.ui.graphics.Color(0xFF10241C))
        assertThat(light.accent).isEqualTo(androidx.compose.ui.graphics.Color(0xFF12C97A))
        assertThat(light.premiumGold).isEqualTo(androidx.compose.ui.graphics.Color(0xFFC8962E))
        val pressed = VipNeon.resolve(selected = false, pressed = true, enabled = true)
        val selected = VipNeon.resolve(selected = true, pressed = false, enabled = true)
        assertThat(VipNeon.renderedAlpha(pressed.glowAlpha, dark = false))
            .isLessThan(VipNeon.renderedAlpha(pressed.glowAlpha, dark = true))
        assertThat(VipNeon.renderedAlpha(selected.glowAlpha, dark = false)).isGreaterThan(0f)
        assertThat(pressed.durationMillis).isEqualTo(selected.durationMillis)
        assertThat(pressed.scale).isEqualTo(VipNeon.PRESS_SCALE)
    }

    @Test
    fun walletAndAuthContractsRemainOnTheExistingPlayerSession() {
        assertThat(WalletsCatalog.displayCodes).containsExactly("TMT", "USD", "TRY", "UZS", "RUB", "KZT").inOrder()
        assertThat(WalletsCatalog.storageCurrency("TMT")).isEqualTo("TMTM")
        assertThat(WalletsCatalog.displayCurrency("TMTM")).isEqualTo("TMT")
        val api = moduleFile("src/main/java/com/nextpari/app/core/network/PlayerApi.kt").readText()
        assertThat(api).contains("@POST(\"api/player/auth/login\")")
        assertThat(api).contains("@GET(\"api/player/wallets\")")
        assertThat(api).contains("@POST(\"api/player/wallets/add\")")
        assertThat(api).contains("@POST(\"api/player/wallets/active\")")
        val repository = moduleFile("src/main/java/com/nextpari/app/feature/wallets/RemoteWalletsRepository.kt").readText()
        assertThat(repository).contains("api::addWallet")
        assertThat(repository).contains("api::setActiveWallet")
        assertThat(repository).contains("reloadAuthoritative")
        assertThat(repository).doesNotContain("service_role")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
