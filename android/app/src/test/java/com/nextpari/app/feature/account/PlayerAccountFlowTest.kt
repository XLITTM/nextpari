package com.nextpari.app.feature.account

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.player.PlayerStateStore
import com.nextpari.app.core.storage.InMemoryPreferencesStorage
import com.nextpari.app.feature.favorites.SportsFavoritesStore
import com.nextpari.app.feature.history.RemoteHistoryRepository
import com.nextpari.app.feature.settings.AccountSecurityResult
import com.nextpari.app.feature.wallet.RemoteWalletRepository
import com.nextpari.app.feature.wallet.WalletCatalog
import com.nextpari.app.feature.wallet.WithdrawalSubmission
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Test

class PlayerAccountFlowTest {
    @Test
    fun passwordEmailWithdrawalHistoryAndQuoteUseThePlayerApi() = runTest {
        val server = MockWebServer()
        server.start()
        val api = NetworkModule.playerApi(NetworkModule.okHttpClient(), server.url("/").toString())
        val json = NetworkModule.json
        val account = RemoteAccountGateway(api, json) { true }
        val wallet = RemoteWalletRepository(PlayerStateStore(), api, json) { true }
        val history = RemoteHistoryRepository(api, json) { true }

        server.enqueue(jsonResponse("""{"ok":false,"error":"CURRENT_PASSWORD_INVALID"}""", 400))
        val rejected = account.changePassword("old-password", "new-password", "new-password")
        assertThat((rejected as AccountSecurityResult.Unavailable).message).isEqualTo("Текущий пароль указан неверно")
        val passwordRequest = server.takeRequest()
        assertThat(passwordRequest.path).isEqualTo("/api/player/auth/change-password")
        assertThat(passwordRequest.body.readUtf8()).doesNotContain("confirmPassword")

        server.enqueue(jsonResponse("""{"ok":true}"""))
        val changed = account.changePassword("old-password", "new-password", "new-password")
        assertThat(changed).isInstanceOf(AccountSecurityResult.Accepted::class.java)
        assertThat((changed as AccountSecurityResult.Accepted).message).contains("Войдите")
        server.takeRequest()

        server.enqueue(jsonResponse("""{"ok":true,"maskedEmail":"p***@nextpari.net","expiresInSeconds":600}"""))
        val started = account.startEmail("Player@Nextpari.Net")
        assertThat((started as AccountSecurityResult.Accepted).message).contains("p***@nextpari.net")
        assertThat(server.takeRequest().body.readUtf8()).contains("player@nextpari.net")

        server.enqueue(jsonResponse("""{"ok":false,"error":"EMAIL_CODE_EXPIRED"}""", 400))
        val expired = account.verifyEmail("123456")
        assertThat((expired as AccountSecurityResult.Unavailable).message).contains("истёк")
        server.takeRequest()

        server.enqueue(jsonResponse("""{"ok":true,"data":{"ok":true,"rows":[],"total":0}}"""))
        server.enqueue(jsonResponse("""{"ok":true,"data":{"rows":[{"id":"desk-1","city":"Ашхабад","label":"Касса 1"}]}}"""))
        server.enqueue(jsonResponse("""{"ok":true,"targets":[{"walletId":"w1","currency":"TMT","rate":1,"enabled":true}]}"""))
        val financials = wallet.loadFinancials()
        assertThat(financials.withdrawals).isEmpty()
        assertThat(financials.withdrawalsError).isEmpty()
        assertThat(financials.destinations.map { it.id }).containsExactly("desk-1")
        assertThat(financials.quoteTargets.map { it.walletId }).containsExactly("w1")
        repeat(3) { server.takeRequest() }

        server.enqueue(jsonResponse("""{"ok":false,"error":"INSUFFICIENT_AVAILABLE_BALANCE"}""", 400))
        val denied = wallet.submitWithdrawal(
            WithdrawalSubmission("crypto", "Crypto", 10.0, "TXabc", "", "", "", "key-1"),
        )
        assertThat(denied.isFailure).isTrue()
        assertThat(denied.exceptionOrNull()?.message).isEqualTo(WalletCatalog.INSUFFICIENT)
        val withdrawal = server.takeRequest()
        assertThat(withdrawal.path).isEqualTo("/api/player/withdrawals")
        assertThat(withdrawal.body.readUtf8()).contains("key-1")

        server.enqueue(jsonResponse("""{"ok":false,"error":"USDT_AMOUNT_INVALID"}""", 400))
        val quote = wallet.quoteUsdt("0", "w1")
        assertThat(quote.exceptionOrNull()?.message).isEqualTo(WalletCatalog.INVALID_AMOUNT)
        server.takeRequest()

        server.enqueue(jsonResponse("""{"ok":true,"bets":[{"betId":"bet-1","status":"accepted","stake":"15","currency":"TMT","acceptedOdds":"1.8","legs":[{"fixtureLabel":"Team A"}]}]}"""))
        val bets = history.loadBets()
        assertThat(bets.getOrThrow().single().title).isEqualTo("Team A")
        assertThat(bets.getOrThrow().single().stake).isEqualTo("15")
        assertThat(server.takeRequest().path).isEqualTo("/api/player/sports/bets")

        server.shutdown()
    }

    @Test
    fun favoritesStayOnThisDeviceAndDoNotCrossPlayers() = runTest {
        val prefs = InMemoryPreferencesStorage()
        var player = "100001"
        val store = SportsFavoritesStore(prefs) { player }
        store.toggleLeague("Ашхабад")
        assertThat(store.favorites.value.leagueIds).containsExactly("Ашхабад")
        player = "100002"
        store.load()
        assertThat(store.favorites.value.leagueIds).isEmpty()
        store.toggleSport("football")
        player = "100001"
        store.load()
        assertThat(store.favorites.value.leagueIds).containsExactly("Ашхабад")
        assertThat(store.favorites.value.sportIds).isEmpty()
    }

    @Test
    fun unsignedSessionDoesNotSubmitAWithdrawal() = runTest {
        val wallet = RemoteWalletRepository(PlayerStateStore())
        val result = wallet.submitWithdrawal(
            WithdrawalSubmission("cash", "Наличные", 40.0, "", "Ашхабад", "Касса", "desk-1", "key"),
        )
        assertThat(result.exceptionOrNull()?.message).isEqualTo(WalletCatalog.SESSION_UNAVAILABLE)
    }

    private fun jsonResponse(body: String, code: Int = 200): MockResponse =
        MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)
}
