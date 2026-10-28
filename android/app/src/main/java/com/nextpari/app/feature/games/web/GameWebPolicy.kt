package com.nextpari.app.feature.games.web

/**
 * Only the six original Nextpari game documents may load in the game WebView.
 * Tokens are never placed in the URL.
 */
object GameWebPolicy {
    const val ORIGIN = "https://nextpari.net"
    const val HOST = "nextpari.net"
    const val ACCEPT_THIRD_PARTY_COOKIES = false
    const val WEB_CONTENTS_DEBUGGING = false

    private val paths = mapOf(
        "blackjack" to "/games/blackjack",
        "apples" to "/games/apples",
        "aviator" to "/games/aviator",
        "crystal" to "/games/crystal",
        "dice" to "/games/dice",
        "pharaoh" to "/games/pharaoh",
    )

    fun gameUrl(gameCode: String): String? {
        val path = paths[gameCode] ?: return null
        return ORIGIN + path
    }

    fun decideMainFrame(url: String?, gameCode: String): GameFrameDecision {
        if (url.isNullOrBlank() || url == "about:blank") return GameFrameDecision.Ignore
        val uri = runCatching { java.net.URI(url) }.getOrNull() ?: return GameFrameDecision.Block
        if (!uri.scheme.equals("https", ignoreCase = true) || uri.userInfo != null) return GameFrameDecision.Block
        if (uri.host?.equals(HOST, ignoreCase = true) != true) return GameFrameDecision.Block
        val query = uri.rawQuery.orEmpty()
        if (query.contains("token", ignoreCase = true) || query.contains("cookie", ignoreCase = true)) {
            return GameFrameDecision.Block
        }
        val path = uri.path?.trimEnd('/').orEmpty().ifBlank { "/" }
        val allowed = paths[gameCode]
        if (allowed != null && (path == allowed || (gameCode == "blackjack" && path == "/games/21"))) {
            return GameFrameDecision.Allow
        }
        return GameFrameDecision.Leave
    }
}

enum class GameFrameDecision {
    Allow,
    Ignore,
    Leave,
    Block,
}
