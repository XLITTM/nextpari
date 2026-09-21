package com.nextpari.app.core.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * In-memory player-facing session only. Access/refresh credentials stay in the
 * Keystore-backed CookieJar and are never stored here.
 */
class InMemorySessionRepository : SessionRepository {
    private val state = MutableStateFlow(AuthSession.Anonymous)
    private val readyState = MutableStateFlow(true)
    override val session: StateFlow<AuthSession> = state.asStateFlow()
    override val ready: StateFlow<Boolean> = readyState.asStateFlow()

    override suspend fun setSession(session: AuthSession) {
        state.value = session
    }

    override suspend fun clear() {
        clearImmediate()
    }

    override fun clearImmediate() {
        state.value = AuthSession.Anonymous
    }

    override fun setReady(value: Boolean) {
        readyState.value = value
    }
}
