package com.nextpari.app.core.player

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.network.NetworkModule
import com.nextpari.app.core.network.session.InMemoryCookiePersistence
import com.nextpari.app.core.network.session.PlayerCookieNames
import com.nextpari.app.core.network.session.SecureCookieJar
import com.nextpari.app.core.session.InMemorySessionRepository
import com.nextpari.app.feature.auth.LoginIdentifier
import com.nextpari.app.feature.auth.RemoteAuthRepository
import com.nextpari.app.feature.games.RemoteGameRepository
import com.nextpari.app.feature.games.newGameIdempotencyKey
import com.nextpari.app.feature.profile.RemotePersonalDataRepository
import com.nextpari.app.feature.wallet.RemoteWalletRepository
import com.nextpari.app.feature.wallets.RemoteWalletsRepository
import com.nextpari.app.feature.wallets.WalletsCatalog
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Before
import org.junit.Test

class PlayerBackendContractTest {
    private lateinit var server: MockWebServer

    @Before
    fun startServer() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun stopServer() {
        server.shutdown()
    }

    @Test
    fun emailLoginSendsEmailPasswordAndCapturesCookies() = runTest {
        enqueueLogin()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        val harness = harness()

        val result = harness.auth.login(LoginIdentifier.Email("player@nextpari.net"), "password1")

        assertThat(result).isInstanceOf(ApiResult.Ok::class.java)
        val login = server.takeRequest()
        assertThat(login.path).isEqualTo("/api/player/auth/login")
        assertThat(login.method).isEqualTo("POST")
        assertThat(login.body.readUtf8()).isEqualTo("""{"email":"player@nextpari.net","password":"password1"}""")
        val me = server.takeRequest()
        assertThat(me.path).isEqualTo("/api/player/me")
        assertThat(me.getHeader("Cookie")).contains(PlayerCookieNames.ACCESS)
        assertThat(me.getHeader("Cookie")).contains("access-token")
        assertThat(harness.sessions.session.value.isAuthenticated).isTrue()
        assertThat(harness.sessions.session.value.playerPublicId).isEqualTo("110790")
        assertThat(harness.sessions.session.value.playerPublicId).isNotEqualTo("DEV001")
        assertThat(harness.wallet.snapshot().displayBalance).isEqualTo("10.38")
        assertThat(harness.wallet.snapshot().currency).isEqualTo("TMT")
        assertThat(harness.wallet.publicId()).isEqualTo("110790")
    }

    @Test
    fun playerIdLoginUsesIdentifierMode() = runTest {
        enqueueLogin()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        val harness = harness()

        harness.auth.login(LoginIdentifier.PlayerId("110790"), "password1")

        val login = server.takeRequest()
        assertThat(login.body.readUtf8()).isEqualTo(
            """{"mode":"identifier","identifier":"110790","password":"password1"}""",
        )
    }

    @Test
    fun phoneLoginUsesPhoneMode() = runTest {
        enqueueLogin()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        val harness = harness()

        harness.auth.login(LoginIdentifier.Phone("+993 65 123-456"), "password1")

        val login = server.takeRequest()
        assertThat(login.body.readUtf8()).isEqualTo(
            """{"mode":"phone","phone":"+99365123456","password":"password1"}""",
        )
    }

    @Test
    fun sessionRestoreReplaysCookiesFromPersistence() = runTest {
        enqueueLogin()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        val persistence = InMemoryCookiePersistence()
        val first = harness(persistence)
        first.auth.login(LoginIdentifier.Email("player@nextpari.net"), "password1")
        drain(4)

        val restored = harness(persistence)
        val result = restored.coordinator.restore()

        assertThat(result).isInstanceOf(ApiResult.Ok::class.java)
        val me = server.takeRequest()
        assertThat(me.path).isEqualTo("/api/player/me")
        assertThat(me.getHeader("Cookie")).contains(PlayerCookieNames.REFRESH)
        assertThat(restored.sessions.session.value.isAuthenticated).isTrue()
        assertThat(restored.sessions.session.value.playerPublicId).isEqualTo("110790")
    }

    @Test
    fun unauthorizedMeClearsAuthenticatedState() = runTest {
        enqueueLogin()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        val harness = harness()
        harness.auth.login(LoginIdentifier.Email("player@nextpari.net"), "password1")
        drain(4)
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setHeader("Content-Type", "application/json")
                .setBody("""{"ok":false,"error":"JWT_INVALID"}"""),
        )

        val result = harness.coordinator.refreshPlayerState()

        assertThat(result).isInstanceOf(ApiResult.Err::class.java)
        assertThat(harness.sessions.session.value.isAuthenticated).isFalse()
        assertThat(harness.jar.hasPlayerSessionCookies()).isFalse()
        assertThat(harness.wallet.publicId()).isEmpty()
        assertThat(harness.wallets.ownedWallets()).isEmpty()
    }

    @Test
    fun logoutClearsCookieStoreAndSession() = runTest {
        enqueueLogin()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody("""{"ok":true}"""))
        val harness = harness()
        harness.auth.login(LoginIdentifier.Email("player@nextpari.net"), "password1")
        drain(4)

        harness.auth.logout()

        val logout = server.takeRequest()
        assertThat(logout.path).isEqualTo("/api/player/auth/logout")
        assertThat(harness.jar.hasPlayerSessionCookies()).isFalse()
        assertThat(harness.sessions.session.value.isAuthenticated).isFalse()
        assertThat(harness.store.me()).isNull()
    }

    @Test
    fun walletsListMappingUsesServerBalances() = runTest {
        enqueueLogin()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        val harness = harness()
        harness.auth.login(LoginIdentifier.Email("player@nextpari.net"), "password1")

        val owned = harness.wallets.ownedWallets()
        assertThat(owned).hasSize(2)
        assertThat(owned[0].currency).isEqualTo("TMT")
        assertThat(owned[0].availableBalance).isEqualTo("10.38")
        assertThat(owned[0].isActive).isTrue()
        assertThat(owned[1].currency).isEqualTo("USD")
        assertThat(owned[1].isActive).isFalse()
        assertThat(harness.wallets.addWallet("USD").isFailure).isTrue()
        assertThat(harness.wallets.setActiveWallet("USD").isFailure).isTrue()
        assertThat(harness.wallets.addWallet("USD").exceptionOrNull()?.message)
            .isEqualTo(WalletsCatalog.SESSION_UNAVAILABLE)
    }

    @Test
    fun profileReadMappingFillsPersonalData() = runTest {
        enqueueLogin()
        enqueueMe()
        enqueueWallets()
        enqueueProfile()
        val harness = harness()
        harness.auth.login(LoginIdentifier.Email("player@nextpari.net"), "password1")

        val profile = harness.profile.load()
        assertThat(profile.firstName).isEqualTo("Aman")
        assertThat(profile.lastName).isEqualTo("Player")
        assertThat(profile.phone).isEqualTo("+99365123456")
        assertThat(profile.email).isEqualTo("player@nextpari.net")
        assertThat(profile.emailVerified).isTrue()
        assertThat(harness.profile.save(com.nextpari.app.feature.profile.PersonalDataFields(firstName = "Aman")).isFailure).isTrue()
    }

    @Test
    fun gameStartSendsIdempotencyKeyAndMapsBalanceAfter() = runTest {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json").setBody(
                """
                {
                  "ok": true,
                  "isDuplicate": false,
                  "roundId": "11111111-1111-4111-8111-111111111111",
                  "gameCode": "apples",
                  "state": "playing",
                  "stake": 10,
                  "totalStake": 10,
                  "payout": 0,
                  "balanceAfter": 90.5,
                  "serverSeedHash": "abc",
                  "serverSeed": null,
                  "nonce": 3,
                  "sessionId": null,
                  "mathVersion": "v1",
                  "publicResult": {"lane":"1"},
                  "allowedActions": ["step"]
                }
                """.trimIndent(),
            ),
        )
        val harness = harness()
        val key = newGameIdempotencyKey()
        val round = harness.games.startGame("apples", 10.0, key)

        val request = server.takeRequest()
        assertThat(request.path).isEqualTo("/api/player/games/start")
        val body = Json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertThat(body["gameCode"]?.jsonPrimitive?.content).isEqualTo("apples")
        assertThat(body["idempotencyKey"]?.jsonPrimitive?.content).isEqualTo(key)
        assertThat(round.balanceAfter).isEqualTo(90.5)
        assertThat(round.roundId).isEqualTo("11111111-1111-4111-8111-111111111111")
        assertThat(round.ok).isTrue()
    }

    @Test
    fun gameActionRequestUsesRoundId() = runTest {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json").setBody(
                """
                {
                  "ok": true,
                  "roundId": "11111111-1111-4111-8111-111111111111",
                  "gameCode": "apples",
                  "state": "settled",
                  "stake": 10,
                  "totalStake": 10,
                  "payout": 20,
                  "balanceAfter": 110,
                  "serverSeedHash": "abc",
                  "allowedActions": []
                }
                """.trimIndent(),
            ),
        )
        val harness = harness()
        val round = harness.games.gameAction("11111111-1111-4111-8111-111111111111", "cashout")
        val request = server.takeRequest()
        assertThat(request.path).isEqualTo("/api/player/games/11111111-1111-4111-8111-111111111111/action")
        assertThat(request.body.readUtf8()).contains("\"action\":\"cashout\"")
        assertThat(round.balanceAfter).isEqualTo(110.0)
    }

    private fun enqueueLogin() {
        server.enqueue(
            MockResponse()
                .addHeader("Set-Cookie", "${PlayerCookieNames.ACCESS}=access-token; Path=/; HttpOnly; SameSite=Lax")
                .addHeader("Set-Cookie", "${PlayerCookieNames.REFRESH}=refresh-token; Path=/; HttpOnly; SameSite=Lax")
                .addHeader("Set-Cookie", "${PlayerCookieNames.DEVICE}=device-token; Path=/; HttpOnly; SameSite=Lax")
                .setHeader("Content-Type", "application/json")
                .setBody(ME_BODY),
        )
    }

    private fun enqueueMe() {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody(ME_BODY))
    }

    private fun enqueueWallets() {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody(WALLETS_BODY))
    }

    private fun enqueueProfile() {
        server.enqueue(MockResponse().setHeader("Content-Type", "application/json").setBody(PROFILE_BODY))
    }

    private fun drain(count: Int) {
        repeat(count) { server.takeRequest() }
    }

    private fun harness(persistence: InMemoryCookiePersistence = InMemoryCookiePersistence()): Harness {
        val jar = SecureCookieJar(persistence)
        val sessions = InMemorySessionRepository()
        val store = PlayerStateStore()
        val holder = arrayOfNulls<PlayerSessionCoordinator>(1)
        val client = NetworkModule.okHttpClient(jar) { holder[0]?.onUnauthorized() }
        val api = NetworkModule.playerApi(client, server.url("/").toString())
        val coordinator = PlayerSessionCoordinator(api, jar, sessions, store, NetworkModule.json)
        holder[0] = coordinator
        return Harness(
            coordinator = coordinator,
            auth = RemoteAuthRepository(coordinator),
            wallet = RemoteWalletRepository(store),
            wallets = RemoteWalletsRepository(store),
            profile = RemotePersonalDataRepository(store),
            games = RemoteGameRepository(api, NetworkModule.json),
            sessions = sessions,
            store = store,
            jar = jar,
        )
    }

    private data class Harness(
        val coordinator: PlayerSessionCoordinator,
        val auth: RemoteAuthRepository,
        val wallet: RemoteWalletRepository,
        val wallets: RemoteWalletsRepository,
        val profile: RemotePersonalDataRepository,
        val games: RemoteGameRepository,
        val sessions: InMemorySessionRepository,
        val store: PlayerStateStore,
        val jar: SecureCookieJar,
    )

    companion object {
        private const val ME_BODY = """
            {
              "ok": true,
              "authenticated": true,
              "player": { "publicId": "110790", "email": "player@nextpari.net" },
              "wallet": { "balance": 10.38, "currency": "TMTM", "status": "active", "migrationState": null },
              "profile": {
                "firstName": "Aman",
                "lastName": "Player",
                "middleName": "A",
                "birthDate": "1990-01-01",
                "passport": "AA123",
                "phone": "+99365123456",
                "email": "player@nextpari.net",
                "phoneVerified": true,
                "emailVerified": true
              }
            }
        """
        private const val WALLETS_BODY = """
            {
              "ok": true,
              "wallets": [
                {
                  "walletId": "w-tmt",
                  "currency": "TMTM",
                  "availableBalance": 10.38,
                  "lockedBalance": 0,
                  "isActive": true,
                  "displayNameRu": "Манат"
                },
                {
                  "walletId": "w-usd",
                  "currency": "USD",
                  "availableBalance": 25,
                  "lockedBalance": 0,
                  "isActive": false,
                  "displayNameRu": "Доллар США"
                }
              ]
            }
        """
        private const val PROFILE_BODY = """
            {
              "ok": true,
              "profile": {
                "firstName": "Aman",
                "lastName": "Player",
                "middleName": "A",
                "birthDate": "1990-01-01",
                "passport": "AA123",
                "phone": "+99365123456",
                "email": "player@nextpari.net",
                "phoneVerified": true,
                "emailVerified": true
              }
            }
        """
    }
}
