package com.nextpari.app.core.storage

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.nextpariDataStore by preferencesDataStore(name = "nextpari_prefs")

class DataStorePreferencesStorage(
    private val context: Context,
) : PreferencesStorage {
    override suspend fun putString(key: String, value: String) {
        val prefKey = stringPreferencesKey(key)
        context.nextpariDataStore.edit { prefs ->
            prefs[prefKey] = value
        }
    }

    override suspend fun getString(key: String): String? {
        val prefKey = stringPreferencesKey(key)
        return context.nextpariDataStore.data.first()[prefKey]
    }
}
