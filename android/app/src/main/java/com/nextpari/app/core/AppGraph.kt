package com.nextpari.app.core

import android.app.Application
import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.network.NetworkError
import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.network.NextpariApiClient
import com.nextpari.app.core.network.PlayerApi
import com.nextpari.app.core.network.userMessage
import com.nextpari.app.core.network.session.EncryptedCookiePersistence
import com.nextpari.app.core.network.session.SecureCookieJar
import com.nextpari.app.core.player.PlayerSessionCoordinator
import com.nextpari.app.core.player.PlayerStateStore
import com.nextpari.app.core.session.AuthSession
import com.nextpari.app.core.session.InMemorySessionRepository
import com.nextpari.app.core.session.SessionRepository
import com.nextpari.app.core.storage.DataStorePreferencesStorage
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import com.nextpari.app.core.storage.PreferencesStorage
import com.nextpari.app.feature.account.PlayerAccountGateway
import com.nextpari.app.feature.account.RemoteAccountGateway
import com.nextpari.app.feature.account.UnavailableAccountGateway
import com.nextpari.app.feature.auth.AuthRepository
import com.nextpari.app.feature.auth.FakeAuthRepository
import com.nextpari.app.feature.auth.RemoteAuthRepository
import com.nextpari.app.feature.games.GameRepository
import com.nextpari.app.feature.games.RemoteGameRepository
import com.nextpari.app.feature.games.web.WebSessionBridge
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import com.nextpari.app.feature.favorites.SportsFavoritesStore
import com.nextpari.app.feature.history.FakeHistoryRepository
import com.nextpari.app.feature.history.HistoryRepository
import com.nextpari.app.feature.history.RemoteHistoryRepository
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    var historyRepository: HistoryRepository = FakeHistoryRepository()
        private set
    var accountGateway: PlayerAccountGateway = UnavailableAccountGateway()
        private set
    var sportsFavorites: SportsFavoritesStore = SportsFavoritesStore(preferencesStorage)
        private set
    val homeCatalogRepository: HomeCatalogRepository = FakeHomeCatalogRepository()
    private var sessionCoordinator: PlayerSessionCoordinator? = null
    private var secureCookieJar: SecureCookieJar? = null
    private val restorePhase = MutableStateFlow(SessionRestorePhase.Checking)
    private val restoreDetail = MutableStateFlow<String?>(null)
    val sessionRestorePhase: StateFlow<SessionRestorePhase> = restorePhase.asStateFlow()
    val sessionRestoreDetail: StateFlow<String?> = restoreDetail.asStateFlow()

    fun retrySessionRestore() {
        val coordinator = sessionCoordinator ?: return
        restorePhase.value = SessionRestorePhase.Checking
        restoreDetail.value = null
        sessionRepositoryImpl.setReady(false)
        appScope.launch { finishRestore(coordinator.restore()) }
    }

    fun bindPreferences(storage: PreferencesStorage) {
        preferencesStorage = storage
        sportsFavorites = SportsFavoritesStore(storage) { playerStateStore.me()?.playerPublicId.orEmpty() }
    }

    fun sessionCookies(): List<Cookie> {
        val jar = secureCookieJar ?: return emptyList()
        return jar.loadForRequest("https://nextpari.net/".toHttpUrl())
    }

    fun refreshPlayerState() {
        val coordinator = sessionCoordinator ?: return
        appScope.launch { coordinator.refreshPlayerState() }
    }

    fun applyServerBalance(balanceAfter: Double, walletId: String = ""): Boolean =
        sessionCoordinator?.applyBalanceAfter(balanceAfter, walletId) ?: false

    fun bindFromApplication(app: Application) {
        bindPreferences(DataStorePreferencesStorage(app))
        val cookieJar = SecureCookieJar(EncryptedCookiePersistence(app))
        secureCookieJar = cookieJar
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
            onSessionCleared = { WebSessionBridge.clear() },
        )
        coordinatorHolder[0] = coordinator
        sessionCoordinator = coordinator
        authRepository = RemoteAuthRepository(coordinator)
        val sessionReady = { cookieJar.hasPlayerSessionCookies() }
        accountGateway = RemoteAccountGateway(api, NetworkModule.json, sessionReady)
        walletRepository = RemoteWalletRepository(playerStateStore, api, NetworkModule.json, sessionReady)
        historyRepository = RemoteHistoryRepository(api, NetworkModule.json, sessionReady)
        walletsRepository = RemoteWalletsRepository(
            store = playerStateStore,
            api = api,
            json = NetworkModule.json,
            hasSession = { cookieJar.hasPlayerSessionCookies() },
        )
        personalDataRepository = RemotePersonalDataRepository(playerStateStore, api, NetworkModule.json, sessionReady)
        gameRepository = RemoteGameRepository(api, NetworkModule.json)
        sessionRepository.setReady(false)
        restorePhase.value = SessionRestorePhase.Checking
        restoreDetail.value = null
        appScope.launch { finishRestore(coordinator.restore()) }
    }

    private fun finishRestore(result: ApiResult<AuthSession>) {
        val failed = result is ApiResult.Err && result.error !is NetworkError.Unauthorized
        restoreDetail.value = if (result is ApiResult.Err && failed) result.error.userMessage() else null
        restorePhase.value = if (failed) SessionRestorePhase.Failed else SessionRestorePhase.Ready
        sessionRepositoryImpl.setReady(true)
    }
}

enum class SessionRestorePhase { Checking, Ready, Failed }
