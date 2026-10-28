package com.nextpari.app.feature.games.web

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.network.session.PlayerCookieNames
import okhttp3.Cookie
import org.junit.After
import org.junit.Test

class GameWebPolicyTest {
    @After
    fun resetStore() {
        WebSessionBridge.install(RecordingCookieStore())
    }

    @Test
    fun sixGameUrlsAreTheProductionRoutesAndCarryNoTokens() {
        val urls = listOf("blackjack", "apples", "aviator", "crystal", "dice", "pharaoh").map { code ->
            GameWebPolicy.gameUrl(code)
        }
        assertThat(urls).containsExactly(
            "https://nextpari.net/games/blackjack",
            "https://nextpari.net/games/apples",
            "https://nextpari.net/games/aviator",
            "https://nextpari.net/games/crystal",
            "https://nextpari.net/games/dice",
            "https://nextpari.net/games/pharaoh",
        ).inOrder()
        urls.forEach { url ->
            assertThat(url).doesNotContain("?")
            assertThat(url).doesNotContain("token")
            assertThat(GameWebPolicy.decideMainFrame(url, url!!.substringAfterLast('/'))).isEqualTo(GameFrameDecision.Allow)
        }
        assertThat(GameWebPolicy.gameUrl("home")).isNull()
        assertThat(GameWebPolicy.ACCEPT_THIRD_PARTY_COOKIES).isFalse()
        assertThat(GameWebPolicy.WEB_CONTENTS_DEBUGGING).isFalse()
    }

    @Test
    fun navigationStaysOnTheGameAndLeavesTheWebsiteShell() {
        assertThat(GameWebPolicy.decideMainFrame("https://nextpari.net/", "dice")).isEqualTo(GameFrameDecision.Leave)
        assertThat(GameWebPolicy.decideMainFrame("https://nextpari.net/games", "dice")).isEqualTo(GameFrameDecision.Leave)
        assertThat(GameWebPolicy.decideMainFrame("https://nextpari.net/games/apples", "dice")).isEqualTo(GameFrameDecision.Leave)
        assertThat(GameWebPolicy.decideMainFrame("https://nextpari.net/games/21", "blackjack")).isEqualTo(GameFrameDecision.Allow)
        assertThat(GameWebPolicy.decideMainFrame("http://nextpari.net/games/dice", "dice")).isEqualTo(GameFrameDecision.Block)
        assertThat(GameWebPolicy.decideMainFrame("https://evil.nextpari.net/games/dice", "dice")).isEqualTo(GameFrameDecision.Block)
        assertThat(GameWebPolicy.decideMainFrame("https://nextpari.net.evil/games/dice", "dice")).isEqualTo(GameFrameDecision.Block)
        assertThat(GameWebPolicy.decideMainFrame("javascript:alert(1)", "dice")).isEqualTo(GameFrameDecision.Block)
        assertThat(GameWebPolicy.decideMainFrame("file:///tmp/game.html", "dice")).isEqualTo(GameFrameDecision.Block)
        assertThat(GameWebPolicy.decideMainFrame("https://nextpari.net/games/dice?token=secret", "dice")).isEqualTo(GameFrameDecision.Block)
        assertThat(GameWebPolicy.decideMainFrame("about:blank", "dice")).isEqualTo(GameFrameDecision.Ignore)
    }

    @Test
    fun handoffCopiesOnlySecureHttpOnlyCookiesForTheSamePlayer() {
        val store = RecordingCookieStore()
        WebSessionBridge.install(store)
        val result = WebSessionBridge.handoff(
            cookies = listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token"), sessionCookie(PlayerCookieNames.REFRESH, "refresh-token")),
            authenticated = true,
            playerPublicId = "110790",
            walletCurrency = "TMT",
        )
        assertThat(result.accepted).isTrue()
        assertThat(result.cookieNames).containsExactly(PlayerCookieNames.ACCESS, PlayerCookieNames.REFRESH)
        val published = store.lines.filter { (_, line) ->
            line.substringAfter('=').startsWith("access-token") || line.substringAfter('=').startsWith("refresh-token")
        }
        assertThat(published.map { it.first }.distinct()).containsExactly("https://nextpari.net")
        published.forEach { (_, line) ->
            assertThat(line).contains("Secure")
            assertThat(line).contains("HttpOnly")
            assertThat(line).contains("Path=/")
        }
        assertThat(GameWebPolicy.gameUrl("dice")).doesNotContain("access-token")
        assertThat(GameWebPolicy.gameUrl("dice")).doesNotContain("refresh-token")
    }

    @Test
    fun handoffBlocksUnknownSessionInsecureCookiesAndADifferentHost() {
        val store = RecordingCookieStore()
        WebSessionBridge.install(store)
        assertThat(
            WebSessionBridge.handoff(listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token")), false, "110790", "TMT").accepted,
        ).isFalse()
        assertThat(
            WebSessionBridge.handoff(emptyList(), true, "110790", "TMT").accepted,
        ).isFalse()
        assertThat(
            WebSessionBridge.handoff(listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token")), true, "", "TMT").accepted,
        ).isFalse()
        val insecure = Cookie.Builder()
            .name(PlayerCookieNames.ACCESS)
            .value("access-token")
            .hostOnlyDomain("nextpari.net")
            .path("/")
            .httpOnly()
            .expiresAt(System.currentTimeMillis() + 60_000)
            .build()
        assertThat(sessionLine(insecure)).isNull()
        val foreign = Cookie.Builder()
            .name(PlayerCookieNames.ACCESS)
            .value("access-token")
            .hostOnlyDomain("example.com")
            .path("/")
            .secure()
            .httpOnly()
            .expiresAt(System.currentTimeMillis() + 60_000)
            .build()
        assertThat(sessionLine(foreign)).isNull()
    }

    private fun sessionCookie(name: String, value: String): Cookie = Cookie.Builder()
        .name(name)
        .value(value)
        .hostOnlyDomain("nextpari.net")
        .path("/")
        .secure()
        .httpOnly()
        .expiresAt(System.currentTimeMillis() + 60_000)
        .build()

    private class RecordingCookieStore : WebCookieStore {
        val lines = mutableListOf<Pair<String, String>>()
        override fun set(url: String, line: String) {
            lines += url to line
        }
        override fun flush() = Unit
    }
}
