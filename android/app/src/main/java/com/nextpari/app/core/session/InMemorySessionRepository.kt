package com.nextpari.app.core.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-memory session only. A001 does not persist auth tokens.
 *
 * Production mobile tokens MUST use Android Keystore-backed secure storage
 * (EncryptedSharedPreferences / Keystore). Do not store access or refresh
 * tokens in DataStore, SharedPreferences, or plain files.
 */
class InMemorySessionRepository : SessionRepository {
    private val state = MutableStateFlow(AuthSession.Anonymous)
    override val session: StateFlow<AuthSession> = state.asStateFlow()

    override suspend fun setSession(session: AuthSession) {
        state.value = session
    }

    override suspend fun clear() {
        state.value = AuthSession.Anonymous
    }
}
