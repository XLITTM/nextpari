package com.nextpari.app.feature.casino

import com.nextpari.app.core.AppGraph
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

internal data class CasinoCatalogEntry(
    val page: CasinoDemoPage,
    val loadedAt: Long,
    val networkMs: Long,
)

internal data class CasinoDirectorySnapshot(
    val categories: List<CasinoDirectoryCategory> = emptyList(),
    val providers: List<CasinoProviderRef> = emptyList(),
    val tournaments: List<CasinoTournamentDto> = emptyList(),
    val unauthorized: Boolean = false,
)

internal data class CasinoDirectoryCategory(
    val id: String,
    val label: String,
    val total: Int? = null,
    val artwork: String,
)

internal class CasinoCatalogCache(
    private val clock: () -> Long,
    private val freshnessMs: Long,
    private val sessionId: () -> String,
    private val fetch: suspend (query: String, category: String, page: Int, provider: String) -> CasinoDemoPage,
) {
    data class Key(val session: String, val query: String, val category: String, val provider: String, val page: Int)

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

    fun peek(query: String, category: String, page: Int, provider: String = ""): CasinoDemoPage? {
        val key = Key(sessionId(), query, category, provider, page)
        synchronized(memory) { return memory[key]?.page }
    }

    fun peekFresh(query: String, category: String, page: Int, provider: String = ""): CasinoDemoPage? {
        val key = Key(sessionId(), query, category, provider, page)
        val now = clock()
        synchronized(memory) {
            val entry = memory[key] ?: return null
            return entry.page.takeIf { now - entry.loadedAt < freshnessMs }
        }
    }

    suspend fun list(query: String, category: String, page: Int, provider: String = ""): CasinoDemoPage {
        peekFresh(query, category, page, provider)?.let {
            cacheHits += 1
            return it
        }
        val key = Key(sessionId(), query, category, provider, page)
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
            val result = fetch(query, category, page, provider)
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
    const val DIRECTORY_CATEGORY_PAGES = 8

    @Volatile
    var sessionId: () -> String = {
        AppGraph.playerStateStore.me()?.playerPublicId.orEmpty().ifBlank { "anon" }
    }

    @Volatile
    var clock: () -> Long = { System.currentTimeMillis() }

    @Volatile
    var fetch: suspend (String, String, Int, String) -> CasinoDemoPage = { query, category, page, provider ->
        CasinoRealCatalogClient.network(query, category, page, provider)
    }

    val cache = CasinoCatalogCache(
        clock = { clock() },
        freshnessMs = FRESHNESS_MS,
        sessionId = { sessionId() },
        fetch = { query, category, page, provider -> fetch(query, category, page, provider) },
    )

    fun peek(query: String, category: String, page: Int, provider: String = ""): CasinoDemoPage? =
        cache.peek(query, category, page, provider)

    fun peekFresh(query: String, category: String, page: Int, provider: String = ""): CasinoDemoPage? =
        cache.peekFresh(query, category, page, provider)

    suspend fun list(query: String, category: String, page: Int, provider: String = ""): CasinoDemoPage =
        cache.list(query, category, page, provider)

    fun peekDirectory(): CasinoDirectorySnapshot? {
        val page = peek("", "", 1) ?: return null
        if (page.categories.isEmpty() && page.providers.isEmpty()) return null
        return snapshotFrom(page, emptyMap())
    }

    suspend fun directory(): CasinoDirectorySnapshot {
        val root = list("", "", 1)
        val totals = coroutineScope {
            root.categories.take(DIRECTORY_CATEGORY_PAGES).associate { category ->
                category to async {
                    runCatching { list("", category, 1).total.takeIf { it > 0 } }.getOrNull()
                }
            }.mapValues { it.value.await() }
        }
        return snapshotFrom(root, totals)
    }

    fun clear() = cache.clear()

    private fun snapshotFrom(page: CasinoDemoPage, totals: Map<String, Int?>): CasinoDirectorySnapshot {
        val categories = CasinoCatalogLogic.sortCategories(page.categories).map { id ->
            CasinoDirectoryCategory(
                id = id,
                label = CasinoCatalogLogic.categoryLabel(id),
                total = totals[id],
                artwork = CasinoCatalogLogic.categoryArtwork(id),
            )
        }
        return CasinoDirectorySnapshot(
            categories = categories,
            providers = page.providers,
            tournaments = page.tournaments,
        )
    }
}
