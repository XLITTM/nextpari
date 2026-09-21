package com.nextpari.app.core.network

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.BuildConfig
import org.junit.Test
import java.io.File

class ProductionTransportSafetyTest {
    @Test
    fun baseUrlIsHttpsNextpariNet() {
        assertThat(NextpariConfig.API_BASE_URL).isEqualTo("https://nextpari.net/")
        assertThat(NextpariConfig.API_BASE_URL).doesNotContain("nextpari.com")
        assertThat(BuildConfig.API_BASE_URL).isEqualTo("https://nextpari.net/")
        assertThat(BuildConfig.API_BASE_URL.startsWith("https://")).isTrue()
    }

    @Test
    fun androidSourceHasNoSupabaseOrProviderSecrets() {
        val root = moduleDir("src/main")
        val blob = root.walkTopDown().filter { it.isFile && it.extension in setOf("kt", "xml", "kts") }
            .joinToString("\n") { it.readText() }
        listOf(
            "SUPABASE_SERVICE_ROLE_KEY",
            "SERVICE_ROLE",
            "service_role",
            "BETCONSTRUCT_SPORTS_SHARED_KEY",
            "BETCONSTRUCT_CASINO_SHARED_KEY",
            "anon key",
            "eyJhbGciOi",
        ).forEach { secret ->
            assertThat(blob).doesNotContain(secret)
        }
    }

    @Test
    fun gameUiDoesNotInvokeProductionWagering() {
        val uiFiles = listOf(
            "src/main/java/com/nextpari/app/feature/home/GamesHubScreen.kt",
            "src/main/java/com/nextpari/app/feature/home/GamesHubViewModel.kt",
            "src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt",
            "src/main/java/com/nextpari/app/core/AppGraph.kt",
        )
        val blob = uiFiles.joinToString("\n") { moduleFile(it).readText() }
        assertThat(blob).doesNotContain("startGame(")
        assertThat(blob).doesNotContain("/api/player/games/start")
        assertThat(blob).doesNotContain("gameAction(")
        assertThat(moduleFile("src/main/java/com/nextpari/app/core/AppGraph.kt").readText())
            .contains("gameRepository = RemoteGameRepository")
        assertThat(moduleFile("src/main/java/com/nextpari/app/feature/home/GamesHubScreen.kt").readText())
            .doesNotContain("GameRepository")
    }

    @Test
    fun productionGraphWiresRemoteReadModels() {
        val graph = moduleFile("src/main/java/com/nextpari/app/core/AppGraph.kt").readText()
        assertThat(graph).contains("RemoteAuthRepository")
        assertThat(graph).contains("RemoteWalletRepository")
        assertThat(graph).contains("RemoteWalletsRepository")
        assertThat(graph).contains("RemotePersonalDataRepository")
        assertThat(graph).contains("EncryptedCookiePersistence")
        assertThat(graph).contains("SecureCookieJar")
        assertThat(graph).doesNotContain("DataStorePreferencesStorage(app, cookies")
        val cookies = moduleFile("src/main/java/com/nextpari/app/core/network/session/EncryptedCookiePersistence.kt").readText()
        assertThat(cookies).contains("EncryptedSharedPreferences")
        assertThat(cookies).contains("MasterKeys")
        assertThat(cookies).doesNotContain("preferencesDataStore")
        val logger = moduleFile("src/main/java/com/nextpari/app/core/network/session/SafeHttpLogger.kt").readText()
        assertThat(logger).contains("encodedPath")
        assertThat(logger).doesNotContain("request.header")
        assertThat(logger).doesNotContain("response.header")
        assertThat(logger).doesNotContain("Level.BODY")
        assertThat(logger).doesNotContain("Level.HEADERS")
        val loggerSource = moduleFile("src/main/java/com/nextpari/app/core/network/NetworkModule.kt").readText()
        assertThat(loggerSource).doesNotContain("HttpLoggingInterceptor.Level.BODY")
        assertThat(loggerSource).doesNotContain("HttpLoggingInterceptor.Level.HEADERS")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }

    private fun moduleDir(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
