package com.nextpari.app.core.session

import kotlinx.coroutines.flow.StateFlow

interface SessionRepository {
    val session: StateFlow<AuthSession>
    val ready: StateFlow<Boolean>
    suspend fun setSession(session: AuthSession)
    suspend fun clear()
    fun clearImmediate()
    fun setReady(value: Boolean)
}
