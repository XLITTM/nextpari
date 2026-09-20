package com.nextpari.app.core

import android.app.Application
import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.network.NextpariApiClient
import com.nextpari.app.core.session.InMemorySessionRepository
import com.nextpari.app.core.session.SessionRepository
import com.nextpari.app.core.storage.DataStorePreferencesStorage
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import com.nextpari.app.core.storage.PreferencesStorage
import com.nextpari.app.feature.auth.AuthRepository
import com.nextpari.app.feature.auth.FakeAuthRepository
import com.nextpari.app.feature.history.FakeHistoryRepository
import com.nextpari.app.feature.history.HistoryRepository
import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import com.nextpari.app.feature.home.HomeCatalogRepository
import com.nextpari.app.feature.wallet.FakeWalletRepository
import com.nextpari.app.feature.wallet.WalletRepository

/**
 * Manual composition root. Keep this small until a DI framework is justified.
 */
object AppGraph {
    val sessionRepository: SessionRepository = InMemorySessionRepository()
    var preferencesStorage: PreferencesStorage = InMemoryPreferencesStorage()
        private set
    val apiClient: NextpariApiClient = NetworkModule.apiClient()
    val authRepository: AuthRepository = FakeAuthRepository(sessionRepository)
    val walletRepository: WalletRepository = FakeWalletRepository()
    val historyRepository: HistoryRepository = FakeHistoryRepository()
    val homeCatalogRepository: HomeCatalogRepository = FakeHomeCatalogRepository()

    fun bindPreferences(storage: PreferencesStorage) {
        preferencesStorage = storage
    }

    fun bindFromApplication(app: Application) {
        bindPreferences(DataStorePreferencesStorage(app))
    }
}
