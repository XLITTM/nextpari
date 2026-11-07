package com.rixobet.app.navigation

enum class MainTab(val label: String) {
    Home("Главная"),
    Sport("Спорт"),
    Casino("Казино"),
    Promotions("Акции"),
    Profile("Профиль"),
}

sealed interface Overlay {
    data object Live : Overlay
    data object MiniGames : Overlay
    data object Vip : Overlay
    data object VipLevels : Overlay
    data object Settings : Overlay
    data object Password : Overlay
    data class Detail(val title: String) : Overlay
}

sealed interface Screen {
    data object Splash : Screen
    data object Theme : Screen
    data object Login : Screen
    data object Register : Screen
    data class EmailConfirm(val address: String) : Screen
    data class Shell(val tab: MainTab, val stack: List<Overlay> = emptyList()) : Screen
}

data class NavState(val history: List<Screen> = listOf(Screen.Splash)) {
    val screen: Screen get() = history.last()

    fun finishSplash(themeChosen: Boolean): NavState {
        require(screen is Screen.Splash)
        val next: Screen = if (themeChosen) Screen.Login else Screen.Theme
        return NavState(history.dropLast(1) + next)
    }

    fun continueFromTheme(): NavState {
        require(screen is Screen.Theme)
        return NavState(history + Screen.Login)
    }

    fun openRegister(): NavState {
        require(screen is Screen.Login)
        return NavState(history + Screen.Register)
    }

    fun openEmailConfirm(address: String): NavState {
        require(screen is Screen.Register)
        return NavState(history + Screen.EmailConfirm(address))
    }

    fun openGuestShell(): NavState = NavState(history + Screen.Shell(MainTab.Home))

    fun selectTab(tab: MainTab): NavState {
        val shell = screen as? Screen.Shell ?: return this
        return NavState(history.dropLast(1) + shell.copy(tab = tab, stack = emptyList()))
    }

    fun push(overlay: Overlay): NavState {
        val shell = screen as? Screen.Shell ?: return this
        return NavState(history.dropLast(1) + shell.copy(stack = shell.stack + overlay))
    }

    fun pop(): NavState? {
        val current = screen
        if (current is Screen.Shell && current.stack.isNotEmpty()) {
            return NavState(history.dropLast(1) + current.copy(stack = current.stack.dropLast(1)))
        }
        if (history.size <= 1) return null
        return NavState(history.dropLast(1))
    }

    fun leaveToLogin(): NavState {
        val index = history.indexOfLast { it is Screen.Login }
        return if (index >= 0) NavState(history.take(index + 1)) else NavState(listOf(Screen.Login))
    }

    companion object {
        fun forKey(key: String?): NavState = when (key) {
            "theme" -> NavState(listOf(Screen.Theme))
            "login" -> NavState(listOf(Screen.Login))
            "register" -> NavState(listOf(Screen.Login, Screen.Register))
            "email" -> NavState(listOf(Screen.Login, Screen.Register, Screen.EmailConfirm("yourmail@gmail.com")))
            "home" -> NavState(listOf(Screen.Shell(MainTab.Home)))
            "sport" -> NavState(listOf(Screen.Shell(MainTab.Sport)))
            "live" -> NavState(listOf(Screen.Shell(MainTab.Home, listOf(Overlay.Live))))
            "casino" -> NavState(listOf(Screen.Shell(MainTab.Casino)))
            "minigames" -> NavState(listOf(Screen.Shell(MainTab.Home, listOf(Overlay.MiniGames))))
            "promotions" -> NavState(listOf(Screen.Shell(MainTab.Promotions)))
            "vip" -> NavState(listOf(Screen.Shell(MainTab.Profile, listOf(Overlay.Vip))))
            "profile" -> NavState(listOf(Screen.Shell(MainTab.Profile)))
            "settings" -> NavState(listOf(Screen.Shell(MainTab.Profile, listOf(Overlay.Settings))))
            else -> NavState()
        }
    }
}
