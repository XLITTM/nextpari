package com.rixobet.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.rixobet.app.domain.FixtureMode
import com.rixobet.app.domain.LocalPrefs
import com.rixobet.app.domain.LocalPrefsRepository
import com.rixobet.app.domain.ThemeMode
import com.rixobet.app.navigation.NavState
import com.rixobet.app.navigation.Screen
import com.rixobet.app.ui.screens.EmailConfirmScreen
import com.rixobet.app.ui.screens.LoginScreen
import com.rixobet.app.ui.screens.MainShell
import com.rixobet.app.ui.screens.RegisterScreen
import com.rixobet.app.ui.screens.SplashScreen
import com.rixobet.app.ui.screens.ThemeScreen
import com.rixobet.app.ui.theme.LocalRixoTokens
import com.rixobet.app.ui.theme.RixoTheme
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing

class RixoViewModel(
    private val repository: LocalPrefsRepository,
    startKey: String?,
    startTheme: ThemeMode?,
) : ViewModel() {
    var prefs by mutableStateOf(
        repository.read().let { saved -> if (startTheme != null) saved.copy(theme = startTheme) else saved },
    )
        private set

    var nav by mutableStateOf(NavState.forKey(startKey))
        private set

    val holdSplash: Boolean = startKey == "splash"

    fun updatePrefs(next: LocalPrefs) {
        repository.write(next)
        prefs = next
    }

    fun navigate(next: NavState) {
        nav = next
    }

    companion object {
        fun factory(
            repository: LocalPrefsRepository,
            startKey: String?,
            startTheme: ThemeMode?,
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return RixoViewModel(repository, startKey, startTheme) as T
            }
        }
    }
}

private data class Notice(val title: String, val message: String, val guestEntry: Boolean = false)

@Composable
fun RixoRoot(
    repository: LocalPrefsRepository,
    mode: FixtureMode,
    startKey: String?,
    startTheme: ThemeMode?,
) {
    val vm: RixoViewModel = viewModel(factory = RixoViewModel.factory(repository, startKey, startTheme))
    RixoTheme(vm.prefs.theme) {
        RixoApp(vm, mode)
    }
}

@Composable
fun RixoApp(vm: RixoViewModel, mode: FixtureMode) {
    val nav = vm.nav
    val prefs = vm.prefs
    var notice by remember { mutableStateOf<Notice?>(null) }
    BackHandler(enabled = nav.pop() != null) {
        vm.navigate(nav.pop()!!)
    }
    Box(Modifier.fillMaxSize().background(LocalRixoTokens.current.page)) {
        when (val screen = nav.screen) {
            Screen.Splash -> Box(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
                SplashScreen(hold = vm.holdSplash) { vm.navigate(nav.finishSplash(prefs.themeChosen)) }
            }
            Screen.Theme -> Box(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
                ThemeScreen(
                    selected = prefs.theme,
                    onSelect = { vm.updatePrefs(prefs.withTheme(it)) },
                    onContinue = {
                        vm.updatePrefs(prefs.withTheme(prefs.theme, chosen = true))
                        vm.navigate(nav.continueFromTheme())
                    },
                )
            }
            Screen.Login -> Box(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
                LoginScreen(
                    prefs = prefs,
                    onPrefs = vm::updatePrefs,
                    onRegister = { vm.navigate(nav.openRegister()) },
                    onGuest = { vm.navigate(nav.openGuestShell()) },
                    onNotice = { title, message, guest -> notice = Notice(title, message, guest) },
                )
            }
            Screen.Register -> Box(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
                RegisterScreen(
                    currency = prefs.currency,
                    onCurrency = { vm.updatePrefs(prefs.copy(currency = it)) },
                    onEmailStep = { address -> vm.navigate(nav.openEmailConfirm(address)) },
                    onNotice = { title, message -> notice = Notice(title, message) },
                )
            }
            is Screen.EmailConfirm -> Box(Modifier.windowInsetsPadding(WindowInsets.safeDrawing)) {
                EmailConfirmScreen(address = screen.address, mode = mode) { title, message ->
                    notice = Notice(title, message)
                }
            }
            is Screen.Shell -> MainShell(
                tab = screen.tab,
                stack = screen.stack,
                prefs = prefs,
                mode = mode,
                onTab = { vm.navigate(nav.selectTab(it)) },
                onPush = { vm.navigate(nav.push(it)) },
                onPrefs = vm::updatePrefs,
                onLeave = { vm.navigate(nav.leaveToLogin()) },
                onPop = { nav.pop()?.let(vm::navigate) },
                onNotice = { title, message -> notice = Notice(title, message) },
            )
        }
        notice?.let { current ->
            AlertDialog(
                onDismissRequest = { notice = null },
                title = { Text(current.title) },
                text = { Text(current.message) },
                confirmButton = {
                    TextButton(onClick = { notice = null }) { Text("Понятно") }
                },
                dismissButton = if (current.guestEntry) {
                    {
                        TextButton(onClick = {
                            notice = null
                            vm.navigate(vm.nav.openGuestShell())
                        }) { Text("Открыть интерфейс") }
                    }
                } else {
                    null
                },
            )
        }
    }
}
