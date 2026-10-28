package com.nextpari.app.feature.games.web

import com.nextpari.app.core.network.session.PlayerCookieNames
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import okhttp3.Cookie
import java.security.MessageDigest
import kotlin.coroutines.coroutineContext
import kotlin.coroutines.resume

interface WebCookieStore {
    fun set(url: String, line: String, onResult: (Boolean) -> Unit)
    fun flush()
}

sealed class WebHandoffPlan {
    data class Blocked(val reason: String) : WebHandoffPlan()
    data object Reuse : WebHandoffPlan()
    data class Install(
        val playerPublicId: String,
        val fingerprint: String,
        val lines: List<String>,
        val cookieNames: List<String>,
        val epoch: Int,
    ) : WebHandoffPlan()
}

object WebSessionBridge {
    private val stateLock = Any()
    private val scopeJob = SupervisorJob()
    private val scope = CoroutineScope(scopeJob + Dispatchers.IO)
    private val mutex = Mutex()
    private var epoch: Int = 0
    private var clearJob: Job? = null
    private var installedPlayerId: String? = null
    private var installedFingerprint: String? = null

    @Volatile
    var store: WebCookieStore = NoopWebCookieStore

    fun install(cookieStore: WebCookieStore) {
        store = cookieStore
    }

    fun clear() {
        synchronized(stateLock) {
            epoch += 1
            installedPlayerId = null
            installedFingerprint = null
            clearJob = scope.launch {
                mutex.withLock {
                    writeLines(expiredLines())
                    store.flush()
                }
            }
        }
    }

    fun prepare(
        cookies: List<Cookie>,
        authenticated: Boolean,
        playerPublicId: String,
        walletCurrency: String,
    ): WebHandoffPlan {
        if (!authenticated || playerPublicId.isBlank() || walletCurrency.isBlank()) {
            return WebHandoffPlan.Blocked("Сессия не подтверждена")
        }
        val accepted = cookies.mapNotNull(::sessionLine)
        val names = accepted.map { it.substringBefore('=') }
        if (PlayerCookieNames.ACCESS !in names && PlayerCookieNames.REFRESH !in names) {
            return WebHandoffPlan.Blocked("Сессия не подтверждена")
        }
        val fingerprint = sessionFingerprint(cookies)
        return synchronized(stateLock) {
            if (installedPlayerId == playerPublicId && installedFingerprint == fingerprint) {
                WebHandoffPlan.Reuse
            } else {
                WebHandoffPlan.Install(playerPublicId, fingerprint, accepted, names, epoch)
            }
        }
    }

    suspend fun commit(install: WebHandoffPlan.Install): Boolean {
        while (true) {
            val pending = synchronized(stateLock) { clearJob }
            if (pending == null || pending.isCompleted) break
            pending.join()
        }
        return try {
            mutex.withLock {
                if (!coroutineContext.isActive || currentEpoch() != install.epoch) return@withLock false
                val cleared = withTimeout(COOKIE_TIMEOUT_MS) { writeLines(expiredLines()) }
                if (!cleared || !coroutineContext.isActive || currentEpoch() != install.epoch) {
                    return@withLock false
                }
                val wrote = withTimeout(COOKIE_TIMEOUT_MS) { writeLines(install.lines) }
                if (!wrote || !coroutineContext.isActive || currentEpoch() != install.epoch) {
                    writeLines(expiredLines())
                    store.flush()
                    return@withLock false
                }
                store.flush()
                if (!coroutineContext.isActive || currentEpoch() != install.epoch) {
                    writeLines(expiredLines())
                    store.flush()
                    return@withLock false
                }
                synchronized(stateLock) {
                    if (epoch != install.epoch) return@withLock false
                    installedPlayerId = install.playerPublicId
                    installedFingerprint = install.fingerprint
                }
                true
            }
        } catch (_: TimeoutCancellationException) {
            false
        }
    }

    internal fun resetForTests() {
        scopeJob.cancelChildren()
        synchronized(stateLock) {
            epoch = 0
            clearJob = null
            installedPlayerId = null
            installedFingerprint = null
        }
    }

    private fun currentEpoch(): Int = synchronized(stateLock) { epoch }

    private suspend fun writeLines(lines: List<String>): Boolean {
        for (line in lines) {
            val ok = kotlinx.coroutines.suspendCancellableCoroutine { cont ->
                store.set(GameWebPolicy.ORIGIN, line) { success ->
                    if (cont.isActive) cont.resume(success)
                }
            }
            if (!ok) return false
        }
        return true
    }
}

private const val COOKIE_TIMEOUT_MS = 5_000L

private object NoopWebCookieStore : WebCookieStore {
    override fun set(url: String, line: String, onResult: (Boolean) -> Unit) {
        onResult(false)
    }

    override fun flush() = Unit
}

internal fun sessionLine(cookie: Cookie): String? {
    if (cookie.name !in PlayerCookieNames.sessionCookies) return null
    if (!cookie.secure || !cookie.httpOnly) return null
    if (!cookie.domain.equals(GameWebPolicy.HOST, ignoreCase = true)) return null
    if (cookie.path != "/") return null
    if (cookie.expiresAt <= System.currentTimeMillis()) return null
    if (cookie.value.isBlank() || cookie.value.any { it == ';' || it == '\n' || it == '\r' || it.isWhitespace() }) return null
    val maxAge = ((cookie.expiresAt - System.currentTimeMillis()) / 1000L).coerceAtLeast(1L)
    return "${cookie.name}=${cookie.value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=$maxAge"
}

internal fun sessionFingerprint(cookies: List<Cookie>): String {
    val digest = MessageDigest.getInstance("SHA-256")
    cookies.mapNotNull { cookie ->
        if (sessionLine(cookie) == null) null else Triple(cookie.name, cookie.value, cookie.expiresAt)
    }.sortedBy { it.first }.forEach { (name, value, expiresAt) ->
        digest.update(name.toByteArray(Charsets.UTF_8))
        digest.update(0)
        digest.update(value.toByteArray(Charsets.UTF_8))
        digest.update(0)
        digest.update(expiresAt.toString().toByteArray(Charsets.UTF_8))
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
}

private fun expiredLines(): List<String> =
    PlayerCookieNames.sessionCookies.map { name ->
        "$name=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"
    }
