package com.nextpari.app.core.network

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.BuildConfig
import com.nextpari.app.feature.auth.FakeAuthRepository
import com.nextpari.app.feature.history.FakeHistoryRepository
import com.nextpari.app.feature.home.FakeHomeCatalogRepository
import com.nextpari.app.feature.wallet.FakeWalletRepository
import okhttp3.OkHttpClient
import org.junit.Test
import retrofit2.Retrofit

class ParitySafetyTest {
    @Test
    fun F_baseUrlIsNextpariNet() {
        assertThat(NextpariConfig.API_BASE_URL).isEqualTo("https://nextpari.net/")
        assertThat(NextpariConfig.API_BASE_URL).doesNotContain("nextpari.com")
        assertThat(BuildConfig.API_BASE_URL).isEqualTo("https://nextpari.net/")
        assertThat(BuildConfig.API_BASE_URL).doesNotContain("nextpari.com")
    }

    @Test
    fun G_fakeRepositoriesDoNotHoldProductionNetworkClients() {
        val types = listOf(
            FakeAuthRepository::class.java,
            FakeWalletRepository::class.java,
            FakeHistoryRepository::class.java,
            FakeHomeCatalogRepository::class.java,
        ).flatMap { type -> type.declaredFields.map { it.type } }
        assertThat(types).containsNoneOf(OkHttpClient::class.java, Retrofit::class.java, NextpariApiClient::class.java)
        assertThat(FakeHomeCatalogRepository().liveTitles()).isEmpty()
        assertThat(FakeHomeCatalogRepository().lineTitles()).isEmpty()
    }
}
