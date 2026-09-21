package com.nextpari.app.core.session

import kotlinx.coroutines.flow.StateFlow

interface SessionRepository {
    val session: StateFlow<AuthSession>
    suspend fun setSession(session: AuthSession)
    suspend fun clear()
}
