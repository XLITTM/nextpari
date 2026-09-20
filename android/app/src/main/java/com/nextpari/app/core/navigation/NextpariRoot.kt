package com.nextpari.app.core.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.nextpari.app.core.ui.theme.NpAccent
import com.nextpari.app.core.ui.theme.NpNav
import com.nextpari.app.core.ui.theme.NpTextMuted
import com.nextpari.app.feature.auth.AuthViewModel
import com.nextpari.app.feature.auth.LoginScreen
import com.nextpari.app.feature.auth.RegisterEmailScreen
import com.nextpari.app.feature.auth.RegisterMenuScreen
import com.nextpari.app.feature.auth.RegisterOneClickScreen
import com.nextpari.app.feature.auth.RegisterPhoneScreen
import com.nextpari.app.feature.history.HistoryScreen
import com.nextpari.app.feature.home.HomeScreen
import com.nextpari.app.feature.profile.ProfileScreen
import com.nextpari.app.feature.settings.SettingsScreen
import com.nextpari.app.feature.wallet.WalletScreen

private data class TabItem(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

private val tabs = listOf(
    TabItem(Destinations.HOME, "Главная", Icons.Outlined.Home),
    TabItem(Destinations.WALLET, "Кошелёк", Icons.Outlined.AccountBalanceWallet),
    TabItem(Destinations.HISTORY, "История", Icons.Outlined.History),
    TabItem(Destinations.PROFILE, "Профиль", Icons.Outlined.Person),
)

@Composable
fun NextpariRoot(
    authViewModel: AuthViewModel = viewModel(factory = AuthViewModel.Factory),
) {
    val session by authViewModel.session.collectAsStateWithLifecycle()
    if (!session.isAuthenticated) {
        UnauthenticatedNavHost(authViewModel)
    } else {
        AuthenticatedShell(authViewModel)
    }
}

@Composable
private fun UnauthenticatedNavHost(authViewModel: AuthViewModel) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Destinations.LOGIN) {
        composable(Destinations.LOGIN) {
            LoginScreen(
                viewModel = authViewModel,
                onOpenRegister = { navController.navigate(Destinations.REGISTER) },
            )
        }
        composable(Destinations.REGISTER) {
            RegisterMenuScreen(
                onBack = { navController.popBackStack() },
                onEmail = { navController.navigate(Destinations.REGISTER_EMAIL) },
                onPhone = { navController.navigate(Destinations.REGISTER_PHONE) },
                onOneClick = { navController.navigate(Destinations.REGISTER_ONE_CLICK) },
            )
        }
        composable(Destinations.REGISTER_EMAIL) {
            RegisterEmailScreen(
                onBack = { navController.popBackStack() },
                onPrepared = {
                    authViewModel.markRegisterPrepared("email")
                    navController.popBackStack(Destinations.LOGIN, inclusive = false)
                },
            )
        }
        composable(Destinations.REGISTER_PHONE) {
            RegisterPhoneScreen(
                onBack = { navController.popBackStack() },
                onPrepared = {
                    authViewModel.markRegisterPrepared("phone")
                    navController.popBackStack(Destinations.LOGIN, inclusive = false)
                },
            )
        }
        composable(Destinations.REGISTER_ONE_CLICK) {
            RegisterOneClickScreen(
                onBack = { navController.popBackStack() },
                onPrepared = {
                    authViewModel.markRegisterPrepared("one-click")
                    navController.popBackStack(Destinations.LOGIN, inclusive = false)
                },
            )
        }
    }
}

@Composable
private fun AuthenticatedShell(authViewModel: AuthViewModel) {
    val navController = rememberNavController()
    val session by authViewModel.session.collectAsStateWithLifecycle()
    val backStack by navController.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    val showBottomBar = Destinations.isAuthenticatedTab(current ?: Destinations.HOME)

    Scaffold(
        containerColor = com.nextpari.app.core.ui.theme.NpBackground,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(containerColor = NpNav) {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = current == tab.route,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = NpAccent,
                                selectedTextColor = NpAccent,
                                unselectedIconColor = NpTextMuted,
                                unselectedTextColor = NpTextMuted,
                                indicatorColor = NpNav,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Destinations.HOME,
            modifier = Modifier.padding(padding),
        ) {
            composable(Destinations.HOME) {
                HomeScreen(
                    session = session,
                    onDeposit = {
                        navController.navigate(Destinations.WALLET) {
                            launchSingleTop = true
                        }
                    },
                    onWithdraw = {
                        navController.navigate(Destinations.WALLET) {
                            launchSingleTop = true
                        }
                    },
                )
            }
            composable(Destinations.WALLET) { WalletScreen() }
            composable(Destinations.HISTORY) { HistoryScreen() }
            composable(Destinations.PROFILE) {
                ProfileScreen(
                    session = session,
                    onOpenSettings = { navController.navigate(Destinations.SETTINGS) },
                    onLogout = { authViewModel.logout() },
                )
            }
            composable(Destinations.SETTINGS) {
                SettingsScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
