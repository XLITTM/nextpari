package com.nextpari.app.core.network.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Cookie

/**
 * Keystore-backed cookie persistence. Cookie values never go to DataStore
 * or plaintext SharedPreferences.
 */
class EncryptedCookiePersistence(
    context: Context,
) : CookiePersistence {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val prefs: SharedPreferences? = createPrefs(context.applicationContext)
    private val memoryFallback = InMemoryCookiePersistence()

    override fun load(): List<Cookie> {
        val stored = prefs?.getString(KEY, null) ?: return memoryFallback.load()
        return runCatching {
            json.decodeFromString<List<PersistedCookie>>(stored).mapNotNull { it.toCookie() }
        }.getOrElse { emptyList() }
    }

    override fun save(cookies: List<Cookie>) {
        memoryFallback.save(cookies)
        val payload = json.encodeToString(cookies.map(PersistedCookie::from))
        prefs?.edit()?.putString(KEY, payload)?.apply()
    }

    override fun clear() {
        memoryFallback.clear()
        prefs?.edit()?.remove(KEY)?.apply()
    }

    private fun createPrefs(context: Context): SharedPreferences? = try {
        val alias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        EncryptedSharedPreferences.create(
            FILE_NAME,
            alias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (_: Exception) {
        null
    }

    companion object {
        private const val FILE_NAME = "nextpari_secure_cookies"
        private const val KEY = "cookies"
    }
}
