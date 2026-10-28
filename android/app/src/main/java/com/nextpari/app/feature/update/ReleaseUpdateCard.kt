package com.nextpari.app.feature.update

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.nextpari.app.BuildConfig
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.network.NetworkModule
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Request

private const val DISMISS_KEY = "android_release_dismissed_version"

@Composable
fun ReleaseUpdateCard(modifier: Modifier = Modifier) {
    var notice by remember { mutableStateOf<ReleaseNotice?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        notice = runCatching { loadReleaseNotice() }.getOrNull()
    }
    val shown = notice ?: return
    Card(modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("Доступно обновление Nextpari", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            Text("Версия ${shown.versionName}", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            if (shown.notes.isNotBlank()) {
                Text(shown.notes, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(top = 8.dp))
            }
            Button(
                onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(shown.downloadUrl))
                    context.startActivity(intent)
                },
                modifier = Modifier.padding(top = 12.dp),
            ) {
                Text("Обновить")
            }
            TextButton(onClick = {
                notice = null
                scope.launch {
                    AppGraph.preferencesStorage.putString(DISMISS_KEY, shown.versionCode.toString())
                }
            }) {
                Text("Позже")
            }
        }
    }
}

internal suspend fun loadReleaseNotice(): ReleaseNotice? {
    val base = BuildConfig.API_BASE_URL
    if (ReleaseUpdatePolicy.officialDownloadUrl(base) == null) return null
    val url = base.trimEnd('/') + "/api/android/release"
    val body = withContext(Dispatchers.IO) {
        NetworkModule.okHttpClient().newCall(Request.Builder().url(url).get().build()).execute().use { response ->
            if (!response.isSuccessful) return@use null
            response.body?.string()
        }
    } ?: return null
    val root = NetworkModule.json.parseToJsonElement(body) as? JsonObject ?: return null
    val update = root["update"]?.jsonObject
    val dismissed = AppGraph.preferencesStorage.getString(DISMISS_KEY)?.toIntOrNull()
    return ReleaseUpdatePolicy.noticeFrom(
        apiBase = base,
        published = root["published"]?.jsonPrimitive?.booleanOrNull == true,
        versionCode = root["versionCode"]?.jsonPrimitive?.intOrNull ?: return null,
        versionName = root["versionName"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        notes = root["releaseNotes"]?.jsonPrimitive?.contentOrNull.orEmpty(),
        mode = update?.get("mode")?.jsonPrimitive?.contentOrNull.orEmpty(),
        currentVersionCode = BuildConfig.VERSION_CODE,
        dismissedVersionCode = dismissed,
    )
}
