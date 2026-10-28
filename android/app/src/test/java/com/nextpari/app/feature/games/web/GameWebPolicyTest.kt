package com.nextpari.app.feature.games.web

import com.google.common.truth.Truth.assertThat
import com.nextpari.app.core.network.session.PlayerCookieNames
import okhttp3.Cookie
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Test

class GameWebPolicyTest {
    @After
    fun resetStore() {
        WebSessionBridge.resetForTests()
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
    fun handoffCopiesOnlySecureHttpOnlyCookiesForTheSamePlayer() = runTest {
        val store = RecordingCookieStore()
        WebSessionBridge.install(store)
        val plan = WebSessionBridge.prepare(
            cookies = listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token"), sessionCookie(PlayerCookieNames.REFRESH, "refresh-token")),
            authenticated = true,
            playerPublicId = "110790",
            walletCurrency = "TMT",
        ) as WebHandoffPlan.Install
        assertThat(WebSessionBridge.commit(plan)).isTrue()
        assertThat(plan.cookieNames).containsExactly(PlayerCookieNames.ACCESS, PlayerCookieNames.REFRESH)
        assertThat(plan.fingerprint).doesNotContain("access-token")
        assertThat(plan.fingerprint).doesNotContain("refresh-token")
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
            WebSessionBridge.prepare(listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token")), false, "110790", "TMT"),
        ).isInstanceOf(WebHandoffPlan.Blocked::class.java)
        assertThat(
            WebSessionBridge.prepare(emptyList(), true, "110790", "TMT"),
        ).isInstanceOf(WebHandoffPlan.Blocked::class.java)
        assertThat(
            WebSessionBridge.prepare(listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token")), true, "", "TMT"),
        ).isInstanceOf(WebHandoffPlan.Blocked::class.java)
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
        val expired = Cookie.Builder()
            .name(PlayerCookieNames.ACCESS)
            .value("access-token")
            .hostOnlyDomain("nextpari.net")
            .path("/")
            .secure()
            .httpOnly()
            .expiresAt(System.currentTimeMillis() - 1_000)
            .build()
        assertThat(sessionLine(expired)).isNull()
        assertThat(
            WebSessionBridge.prepare(listOf(expired), true, "110790", "TMT"),
        ).isInstanceOf(WebHandoffPlan.Blocked::class.java)
    }

    @Test
    fun repeatedEntryDoesNotReplaceAnUnchangedSession() = runTest {
        val store = RecordingCookieStore()
        WebSessionBridge.install(store)
        val cookies = listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token"))
        val first = WebSessionBridge.prepare(cookies, true, "110790", "TMT") as WebHandoffPlan.Install
        assertThat(WebSessionBridge.commit(first)).isTrue()
        val written = store.lines.size
        assertThat(WebSessionBridge.prepare(cookies, true, "110790", "TMT")).isEqualTo(WebHandoffPlan.Reuse)
        assertThat(store.lines).hasSize(written)
    }

    @Test
    fun unfinishedCookieWriteDoesNotCountAsInstalled() = runTest {
        val store = RecordingCookieStore()
        store.hold = true
        WebSessionBridge.install(store)
        val cookies = listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token"))
        val plan = WebSessionBridge.prepare(cookies, true, "110790", "TMT") as WebHandoffPlan.Install
        assertThat(WebSessionBridge.commit(plan)).isFalse()
        assertThat(WebSessionBridge.prepare(cookies, true, "110790", "TMT")).isInstanceOf(WebHandoffPlan.Install::class.java)
    }

    @Test
    fun failedCookieWriteClearsAndBlocksTheNextReuse() = runTest {
        val store = RecordingCookieStore()
        store.failLiveCookies = true
        WebSessionBridge.install(store)
        val cookies = listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token"))
        val plan = WebSessionBridge.prepare(cookies, true, "110790", "TMT") as WebHandoffPlan.Install
        assertThat(WebSessionBridge.commit(plan)).isFalse()
        assertThat(store.lines.last().second.substringAfter("Max-Age=")).isEqualTo("0")
        assertThat(WebSessionBridge.prepare(cookies, true, "110790", "TMT")).isInstanceOf(WebHandoffPlan.Install::class.java)
    }

    @Test
    fun accountSwitchClearsThePreviousPlayerBeforeInstallingTheNext() = runTest {
        val store = RecordingCookieStore()
        WebSessionBridge.install(store)
        val first = WebSessionBridge.prepare(
            listOf(sessionCookie(PlayerCookieNames.ACCESS, "player-a-token")),
            true,
            "110790",
            "TMT",
        ) as WebHandoffPlan.Install
        assertThat(WebSessionBridge.commit(first)).isTrue()
        val mark = store.lines.size
        val second = WebSessionBridge.prepare(
            listOf(sessionCookie(PlayerCookieNames.ACCESS, "player-b-token")),
            true,
            "220791",
            "USD",
        ) as WebHandoffPlan.Install
        assertThat(WebSessionBridge.commit(second)).isTrue()
        val added = store.lines.drop(mark).map { it.second }
        val clearAt = added.indexOfFirst { it.substringAfter("Max-Age=") == "0" }
        val nextAt = added.indexOfFirst { it.contains("player-b-token") }
        assertThat(clearAt).isAtLeast(0)
        assertThat(nextAt).isGreaterThan(clearAt)
        assertThat(WebSessionBridge.prepare(
            listOf(sessionCookie(PlayerCookieNames.ACCESS, "player-a-token")),
            true,
            "110790",
            "TMT",
        )).isInstanceOf(WebHandoffPlan.Install::class.java)
    }

    @Test
    fun logoutForgetsTheInstalledSession() = runTest {
        val store = RecordingCookieStore()
        WebSessionBridge.install(store)
        val cookies = listOf(sessionCookie(PlayerCookieNames.ACCESS, "access-token"))
        val plan = WebSessionBridge.prepare(cookies, true, "110790", "TMT") as WebHandoffPlan.Install
        assertThat(WebSessionBridge.commit(plan)).isTrue()
        WebSessionBridge.clear()
        assertThat(WebSessionBridge.prepare(cookies, true, "110790", "TMT")).isInstanceOf(WebHandoffPlan.Install::class.java)
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
        var failLiveCookies = false
        var hold = false
        val pending = mutableListOf<() -> Unit>()
        override fun set(url: String, line: String, onResult: (Boolean) -> Unit) {
            lines += url to line
            val expired = line.substringAfter("Max-Age=") == "0"
            val ok = url == "https://nextpari.net" && !(failLiveCookies && !expired)
            if (hold) pending += { onResult(ok) } else onResult(ok)
        }
        fun release() {
            pending.toList().also { pending.clear() }.forEach { it() }
        }
        override fun flush() = Unit
    }
}
