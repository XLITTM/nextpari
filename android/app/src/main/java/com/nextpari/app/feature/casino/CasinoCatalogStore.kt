package com.nextpari.app.feature.casino

import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal data class CasinoCatalogEntry(
    val page: CasinoDemoPage,
    val loadedAt: Long,
    val networkMs: Long,
)

internal class CasinoCatalogCache(
    private val clock: () -> Long,
    private val freshnessMs: Long,
    private val sessionId: () -> String,
    private val fetch: suspend (query: String, category: String, page: Int) -> CasinoDemoPage,
) {
    data class Key(val session: String, val query: String, val category: String, val page: Int)

    private val mutex = Mutex()
    private val memory = LinkedHashMap<Key, CasinoCatalogEntry>()
    private val inflight = HashMap<Key, CompletableDeferred<CasinoDemoPage>>()

    @Volatile var networkCalls: Int = 0
        private set
    @Volatile var cacheHits: Int = 0
        private set
    @Volatile var coalescedWaits: Int = 0
        private set
    @Volatile var lastNetworkMs: Long = 0
        private set

    fun peek(query: String, category: String, page: Int): CasinoDemoPage? {
        val key = Key(sessionId(), query, category, page)
        synchronized(memory) { return memory[key]?.page }
    }

    fun peekFresh(query: String, category: String, page: Int): CasinoDemoPage? {
        val key = Key(sessionId(), query, category, page)
        val now = clock()
        synchronized(memory) {
            val entry = memory[key] ?: return null
            return entry.page.takeIf { now - entry.loadedAt < freshnessMs }
        }
    }

    suspend fun list(query: String, category: String, page: Int): CasinoDemoPage {
        peekFresh(query, category, page)?.let {
            cacheHits += 1
            return it
        }
        val key = Key(sessionId(), query, category, page)
        val existing = mutex.withLock { inflight[key] }
        if (existing != null) {
            coalescedWaits += 1
            return existing.await()
        }
        val deferred = CompletableDeferred<CasinoDemoPage>()
        mutex.withLock { inflight[key] = deferred }
        try {
            val started = clock()
            networkCalls += 1
            val result = fetch(query, category, page)
            lastNetworkMs = (clock() - started).coerceAtLeast(0)
            synchronized(memory) {
                memory[key] = CasinoCatalogEntry(result, clock(), lastNetworkMs)
            }
            deferred.complete(result)
            return result
        } catch (error: Throwable) {
            deferred.completeExceptionally(error)
            throw error
        } finally {
            mutex.withLock { inflight.remove(key) }
        }
    }

    fun clear() {
        synchronized(memory) { memory.clear() }
        cacheHits = 0
        coalescedWaits = 0
        networkCalls = 0
        lastNetworkMs = 0
    }
}

internal object CasinoCatalogStore {
    const val FRESHNESS_MS = 90_000L

    @Volatile
    var sessionId: () -> String = {
        AppGraph.playerStateStore.me()?.playerPublicId.orEmpty().ifBlank { "anon" }
    }

    @Volatile
    var clock: () -> Long = { System.currentTimeMillis() }

    @Volatile
    var fetch: suspend (String, String, Int) -> CasinoDemoPage = { query, category, page ->
        CasinoRealCatalogClient.network(query, category, page)
    }

    val cache = CasinoCatalogCache(
        clock = { clock() },
        freshnessMs = FRESHNESS_MS,
        sessionId = { sessionId() },
        fetch = { query, category, page -> fetch(query, category, page) },
    )

    fun peek(query: String, category: String, page: Int): CasinoDemoPage? = cache.peek(query, category, page)

    fun peekFresh(query: String, category: String, page: Int): CasinoDemoPage? = cache.peekFresh(query, category, page)

    suspend fun list(query: String, category: String, page: Int): CasinoDemoPage = cache.list(query, category, page)

    fun clear() = cache.clear()
}
