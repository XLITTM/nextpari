package com.nextpari.app.core

import android.app.Application
import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.network.NextpariApiClient
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.session.EncryptedCookiePersistence
import com.nextpari.app.core.network.session.SecureCookieJar
import com.nextpari.app.core.player.PlayerSessionCoordinator
import com.nextpari.app.core.player.PlayerStateStore
import com.nextpari.app.core.session.InMemorySessionRepository
import com.nextpari.app.core.session.SessionRepository
import com.nextpari.app.core.storage.DataStorePreferencesStorage
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import com.nextpari.app.core.storage.PreferencesStorage
import com.nextpari.app.feature.auth.AuthRepository
import com.nextpari.app.feature.auth.FakeAuthRepository
import com.nextpari.app.feature.auth.RemoteAuthRepository
import com.nextpari.app.feature.games.GameRepository
import com.nextpari.app.feature.games.RemoteGameRepository
import com.nextpari.app.feature.history.FakeHistoryRepository
import com.nextpari.app.feature.history.HistoryRepository
import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import com.nextpari.app.feature.home.HomeCatalogRepository
import com.nextpari.app.feature.profile.FakePersonalDataRepository
import com.nextpari.app.feature.profile.PersonalDataRepository
import com.nextpari.app.feature.profile.RemotePersonalDataRepository
import com.nextpari.app.feature.wallet.FakeWalletRepository
import com.nextpari.app.feature.wallet.RemoteWalletRepository
import com.nextpari.app.feature.wallet.WalletRepository
import com.nextpari.app.feature.wallets.FakeWalletsRepository
import com.nextpari.app.feature.wallets.RemoteWalletsRepository
import com.nextpari.app.feature.wallets.WalletsRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Manual composition root. Keep this small until a DI framework is justified.
 */
object AppGraph {
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val sessionRepositoryImpl = InMemorySessionRepository()
    val sessionRepository: SessionRepository = sessionRepositoryImpl
    val playerStateStore = PlayerStateStore()
    var preferencesStorage: PreferencesStorage = InMemoryPreferencesStorage()
        private set
    val apiClient: NextpariApiClient = NetworkModule.apiClient()
    var authRepository: AuthRepository = FakeAuthRepository(sessionRepository)
        private set
    var walletRepository: WalletRepository = FakeWalletRepository()
        private set
    var walletsRepository: WalletsRepository = FakeWalletsRepository()
        private set
    var personalDataRepository: PersonalDataRepository = FakePersonalDataRepository()
        private set
    var gameRepository: GameRepository? = null
        private set
    val historyRepository: HistoryRepository = FakeHistoryRepository()
    val homeCatalogRepository: HomeCatalogRepository = FakeHomeCatalogRepository()
    private var sessionCoordinator: PlayerSessionCoordinator? = null

    fun bindPreferences(storage: PreferencesStorage) {
        preferencesStorage = storage
    }

    fun refreshPlayerState() {
        val coordinator = sessionCoordinator ?: return
        appScope.launch { coordinator.refreshPlayerState() }
    }

    fun applyServerBalance(balanceAfter: Double) {
        sessionCoordinator?.applyBalanceAfter(balanceAfter)
    }

    fun bindFromApplication(app: Application) {
        bindPreferences(DataStorePreferencesStorage(app))
        val cookieJar = SecureCookieJar(EncryptedCookiePersistence(app))
        val coordinatorHolder = arrayOfNulls<PlayerSessionCoordinator>(1)
        val client = NetworkModule.okHttpClient(
            cookieJar = cookieJar,
            unauthorizedHandler = {
                coordinatorHolder[0]?.onUnauthorized()
            },
        )
        val api: PlayerApi = NetworkModule.playerApi(client)
        val coordinator = PlayerSessionCoordinator(
            api = api,
            cookieJar = cookieJar,
            sessions = sessionRepository,
            store = playerStateStore,
            json = NetworkModule.json,
        )
        coordinatorHolder[0] = coordinator
        sessionCoordinator = coordinator
        authRepository = RemoteAuthRepository(coordinator)
        walletRepository = RemoteWalletRepository(playerStateStore)
        walletsRepository = RemoteWalletsRepository(playerStateStore)
        personalDataRepository = RemotePersonalDataRepository(playerStateStore)
        gameRepository = RemoteGameRepository(api, NetworkModule.json)
        sessionRepository.setReady(false)
        appScope.launch {
            try {
                coordinator.restore()
            } finally {
                sessionRepository.setReady(true)
            }
        }
    }
}
