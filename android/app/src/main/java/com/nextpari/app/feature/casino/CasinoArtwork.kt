package com.nextpari.app.feature.casino

import android.content.Context
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

internal fun casinoArtworkUrl(raw: String): String? {
    val uri = runCatching { URI(raw) }.getOrNull() ?: return null
    return raw.takeIf {
        uri.scheme == "https" && uri.host == "cdn.imagesai.org" && uri.port == -1 &&
            uri.userInfo == null && uri.rawQuery == null && uri.rawFragment == null
    }
}

internal object CasinoArtworkPolicy {
    const val BYTE_LIMIT = 1024L * 1024
    const val MAX_SOURCE_EDGE = 1600
    const val DECODE_EDGE = 480
    val MIME = setOf("image/png", "image/jpeg", "image/webp")

    fun sampleSize(width: Int, height: Int, target: Int = DECODE_EDGE): Int {
        var size = 1
        while (width / size > target || height / size > target) size *= 2
        return size.coerceAtLeast(1)
    }

    fun diskKey(url: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(url.toByteArray())
        return digest.joinToString("") { byte -> "%02x".format(byte) }
    }
}

internal object CasinoArtwork {
    private val requests = Semaphore(4)
    private val memory = object : LruCache<String, ImageBitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.width * value.height * 4
    }
    private val urlLocks = ConcurrentHashMap<String, Mutex>()
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .callTimeout(6, TimeUnit.SECONDS).build()
    @Volatile private var diskDir: File? = null

    fun bind(context: Context) {
        diskDir = File(context.cacheDir, "casino-art").also { it.mkdirs() }
    }

    fun cached(url: String): ImageBitmap? = memory.get(url)

    fun clearMemory() {
        memory.evictAll()
        urlLocks.clear()
    }

    suspend fun load(raw: String): ImageBitmap? {
        val url = casinoArtworkUrl(raw) ?: return null
        cached(url)?.let { return it }
        val lock = urlLocks.getOrPut(url) { Mutex() }
        return lock.withLock {
            cached(url) ?: requests.withPermit { decode(url) }
        }
    }

    private suspend fun decode(url: String): ImageBitmap? = withContext(Dispatchers.IO) {
        readDisk(url)?.also { memory.put(url, it) } ?: download(url)
    }

    private fun readDisk(url: String): ImageBitmap? {
        val file = diskFile(url) ?: return null
        if (!file.isFile || file.length() <= 0L || file.length() > CasinoArtworkPolicy.BYTE_LIMIT) return null
        val age = System.currentTimeMillis() - file.lastModified()
        if (age > 24L * 60 * 60 * 1000) return null
        val bytes = runCatching { file.readBytes() }.getOrNull() ?: return null
        return decodeBytes(bytes)?.also { memory.put(url, it) }
    }

    private fun download(url: String): ImageBitmap? {
        val call = client.newCall(Request.Builder().url(url).build())
        return try {
            call.execute().use { response ->
                val body = response.body ?: return null
                if (!response.isSuccessful || body.contentLength() > CasinoArtworkPolicy.BYTE_LIMIT) return null
                val source = body.source()
                if (source.request(CasinoArtworkPolicy.BYTE_LIMIT + 1)) return null
                val bytes = source.readByteArray()
                decodeBytes(bytes)?.also { bitmap ->
                    memory.put(url, bitmap)
                    writeDisk(url, bytes)
                }
            }
        } catch (_: java.io.IOException) {
            null
        }
    }

    private fun decodeBytes(bytes: ByteArray): ImageBitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth !in 1..CasinoArtworkPolicy.MAX_SOURCE_EDGE ||
            bounds.outHeight !in 1..CasinoArtworkPolicy.MAX_SOURCE_EDGE ||
            bounds.outMimeType !in CasinoArtworkPolicy.MIME
        ) return null
        val options = BitmapFactory.Options().apply {
            inSampleSize = CasinoArtworkPolicy.sampleSize(bounds.outWidth, bounds.outHeight)
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)?.asImageBitmap()
    }

    private fun writeDisk(url: String, bytes: ByteArray) {
        val file = diskFile(url) ?: return
        runCatching { file.writeBytes(bytes) }
    }

    private fun diskFile(url: String): File? {
        val dir = diskDir ?: return null
        return File(dir, CasinoArtworkPolicy.diskKey(url) + ".img")
    }
}
