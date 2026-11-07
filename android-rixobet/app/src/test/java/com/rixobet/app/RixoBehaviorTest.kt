package com.rixobet.app

import com.rixobet.app.domain.Attempt
import com.rixobet.app.domain.Catalog
import com.rixobet.app.domain.FixtureMode
import com.rixobet.app.domain.Fixtures
import com.rixobet.app.domain.LocalPrefs
import com.rixobet.app.domain.LocalPrefsRepository
import com.rixobet.app.domain.ThemeMode
import com.rixobet.app.domain.UserActions
import com.rixobet.app.navigation.MainTab
import com.rixobet.app.navigation.NavState
import com.rixobet.app.navigation.Overlay
import com.rixobet.app.navigation.Screen
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationTest {
    @Test
    fun splashGoesToThemeUntilAThemeIsChosen() {
        val fresh = NavState().finishSplash(themeChosen = false)
        assertTrue(fresh.screen is Screen.Theme)
        val returning = NavState().finishSplash(themeChosen = true)
        assertTrue(returning.screen is Screen.Login)
    }

    @Test
    fun themeContinueOpensLoginAndBackReturns() {
        val login = NavState(listOf(Screen.Theme)).continueFromTheme()
        assertTrue(login.screen is Screen.Login)
        assertTrue(login.pop()?.screen is Screen.Theme)
    }

    @Test
    fun registrationReachesEmailStepWithoutLeavingTheStack() {
        val email = NavState(listOf(Screen.Login))
            .openRegister()
            .openEmailConfirm("player@example.com")
        val screen = email.screen as Screen.EmailConfirm
        assertEquals("player@example.com", screen.address)
        assertTrue(email.pop()?.screen is Screen.Register)
    }

    @Test
    fun guestShellUsesTheFiveApprovedTabs() {
        val home = NavState(listOf(Screen.Login)).openGuestShell()
        assertEquals(MainTab.Home, (home.screen as Screen.Shell).tab)
        assertEquals(
            listOf("Главная", "Спорт", "Казино", "Акции", "Профиль"),
            MainTab.entries.map { it.label },
        )
        assertEquals(Catalog.bottomNav, MainTab.entries.map { it.label })
        val sport = home.selectTab(MainTab.Sport)
        val casino = sport.selectTab(MainTab.Casino)
        val promo = casino.selectTab(MainTab.Promotions)
        val profile = promo.selectTab(MainTab.Profile)
        assertEquals(MainTab.Profile, (profile.screen as Screen.Shell).tab)
        assertTrue(profile.pop()?.screen is Screen.Login)
    }

    @Test
    fun overlaysPopBeforeTheShell() {
        val live = NavState.forKey("live")
        assertEquals(Overlay.Live, (live.screen as Screen.Shell).stack.single())
        val home = live.pop()
        assertTrue((home!!.screen as Screen.Shell).stack.isEmpty())
        assertEquals(MainTab.Home, (home.screen as Screen.Shell).tab)
        val settings = NavState.forKey("settings")
        assertEquals(MainTab.Profile, (settings.screen as Screen.Shell).tab)
        assertEquals(Overlay.Settings, (settings.screen as Screen.Shell).stack.single())
        assertTrue(settings.pop()?.screen is Screen.Shell)
        assertTrue((settings.pop()!!.screen as Screen.Shell).stack.isEmpty())
    }

    @Test
    fun everyApprovedScreenHasARoute() {
        val keys = listOf(
            null to Screen.Splash::class,
            "theme" to Screen.Theme::class,
            "login" to Screen.Login::class,
            "register" to Screen.Register::class,
            "email" to Screen.EmailConfirm::class,
            "home" to Screen.Shell::class,
            "sport" to Screen.Shell::class,
            "live" to Screen.Shell::class,
            "casino" to Screen.Shell::class,
            "minigames" to Screen.Shell::class,
            "promotions" to Screen.Shell::class,
            "vip" to Screen.Shell::class,
            "profile" to Screen.Shell::class,
            "settings" to Screen.Shell::class,
        )
        keys.forEach { (key, type) ->
            assertEquals(type, NavState.forKey(key).screen::class)
        }
        assertEquals(MainTab.Sport, (NavState.forKey("sport").screen as Screen.Shell).tab)
        assertEquals(MainTab.Casino, (NavState.forKey("casino").screen as Screen.Shell).tab)
        assertEquals(Overlay.MiniGames, (NavState.forKey("minigames").screen as Screen.Shell).stack.single())
        assertEquals(Overlay.Vip, (NavState.forKey("vip").screen as Screen.Shell).stack.single())
    }

    @Test
    fun selectingATabClearsTheOverlayStack() {
        val settings = NavState.forKey("settings").selectTab(MainTab.Home)
        val shell = settings.screen as Screen.Shell
        assertEquals(MainTab.Home, shell.tab)
        assertTrue(shell.stack.isEmpty())
    }

    @Test
    fun rootBackDoesNotInventAPreviousScreen() {
        assertNull(NavState().pop())
        assertNull(NavState.forKey("home").pop())
    }

    @Test
    fun leaveGuestReturnsToLogin() {
        val back = NavState(listOf(Screen.Login, Screen.Register)).openGuestShell().leaveToLogin()
        assertTrue(back.screen is Screen.Login)
        assertEquals(Screen.Login, NavState.forKey("home").leaveToLogin().screen)
    }
}

class ThemePersistenceTest {
    @Test
    fun themeSurvivesANewRepositoryInstance() {
        val file = File.createTempFile("rixo-theme", ".txt")
        val first = LocalPrefsRepository(file)
        first.write(LocalPrefs(theme = ThemeMode.WhiteEmerald, themeChosen = true, currency = "EUR"))
        val second = LocalPrefsRepository(file)
        val read = second.read()
        assertEquals(ThemeMode.WhiteEmerald, read.theme)
        assertTrue(read.themeChosen)
        assertEquals("EUR", read.currency)
        file.delete()
    }

    @Test
    fun unknownValuesFallBackWithoutDroppingTheFileContract() {
        val file = File.createTempFile("rixo-theme", ".txt")
        file.writeText("theme=cyan_ryxo\nthemeChosen=false\ncurrency=BTC\nnotifications=false\n")
        val read = LocalPrefsRepository(file).read()
        assertEquals(ThemeMode.DarkVip, read.theme)
        assertEquals("TMT", read.currency)
        assertFalse(read.notificationsEnabled)
        file.delete()
    }

    @Test
    fun repositoryNeverStoresAPassword() {
        val file = File.createTempFile("rixo-theme", ".txt")
        LocalPrefsRepository(file).write(
            LocalPrefs(rememberedIdentifier = "player@example.com\npassword=secret"),
        )
        val text = file.readText()
        assertFalse(text.lines().any { it.startsWith("password") })
        assertTrue(text.contains("rememberedIdentifier=player@example.com password secret"))
        file.delete()
    }
}

class UserActionTest {
    @Test
    fun loginValidatesBeforeReportingTheServiceOffline() {
        assertTrue(UserActions.login("", "") is Attempt.Invalid)
        assertTrue(UserActions.login("player@example.com", "short") is Attempt.Invalid)
        val offline = UserActions.login("player@example.com", "secret1")
        assertTrue(offline is Attempt.Unavailable)
        assertTrue((offline as Attempt.Unavailable).message.contains("не подключён"))
    }

    @Test
    fun registrationAndMoneyActionsCannotSucceed() {
        val attempts = listOf(
            UserActions.registerEmail("a@b.co", "secret1", "secret1", true),
            UserActions.registerPhone("+99361234567", "secret1", "secret1", true),
            UserActions.registerOneClick(true),
            UserActions.confirmEmail("472911"),
            UserActions.resendCode(),
            UserActions.social("Google"),
            UserActions.forgotPassword(),
            UserActions.deposit(),
            UserActions.placeBet(),
            UserActions.launchGame("Кристалл"),
            UserActions.claimPromo("Кэшбэк"),
            UserActions.changePassword("oldpass", "newpass", "newpass"),
        )
        assertTrue(attempts.all { it is Attempt.Unavailable })
        assertTrue(UserActions.registerEmail("not-an-email", "secret1", "secret1", true) is Attempt.Invalid)
        assertTrue(UserActions.changePassword("oldpass", "newpass", "other") is Attempt.Invalid)
        assertTrue(UserActions.registerOneClick(false) is Attempt.Invalid)
    }

    @Test
    fun demoNumbersStayOutOfTheDisconnectedMode() {
        assertTrue(Fixtures.showsNumbers(FixtureMode.Demo))
        assertFalse(Fixtures.showsNumbers(FixtureMode.Unavailable))
        assertEquals(6, Fixtures.miniGames.size)
        assertEquals(14, listOf(
            "splash", "theme", "login", "register", "email", "home", "sport", "live",
            "casino", "minigames", "promotions", "vip", "profile", "settings",
        ).size)
    }
}
