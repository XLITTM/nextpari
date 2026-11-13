package com.nextpari.app.feature.games.web

/**
 * Only exact NextPari game documents may load in the game WebView.
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

    private val standardCatalogs = mapOf(
        "casino-slots" to "/casino/real/slots",
        "casino-live" to "/casino/real/live",
    )
    private val standardGamePath = Regex("^/casino/real/sa-[a-f0-9]{32}$")
    private val demoId = Regex("^sa-[a-f0-9]{32}$")
    fun isCasinoDemoId(id: String): Boolean = demoId.matches(id)
    private fun casinoPath(id: String): String? = "/casino/demo/$id".takeIf { isCasinoDemoId(id) }

    fun gameUrl(gameCode: String): String? {
        val path = paths[gameCode] ?: standardCatalogs[gameCode] ?: casinoPath(gameCode) ?: return null
        return ORIGIN + path
    }

    fun decideMainFrame(url: String?, gameCode: String): GameFrameDecision {
        if (url.isNullOrBlank() || url == "about:blank") return GameFrameDecision.Ignore
        val uri = runCatching { java.net.URI(url) }.getOrNull() ?: return GameFrameDecision.Block
        if (!uri.scheme.equals("https", ignoreCase = true) || uri.userInfo != null) return GameFrameDecision.Block
        if (uri.host?.equals(HOST, ignoreCase = true) != true || uri.port !in setOf(-1, 443)) return GameFrameDecision.Block
        val query = uri.rawQuery.orEmpty()
        if (query.contains("token", ignoreCase = true) || query.contains("cookie", ignoreCase = true)) {
            return GameFrameDecision.Block
        }
        val path = uri.path?.trimEnd('/').orEmpty().ifBlank { "/" }
        val standardCatalog = standardCatalogs[gameCode]
        if (standardCatalog != null) {
            if (uri.rawQuery != null || uri.rawFragment != null) return GameFrameDecision.Block
            val rawPath = uri.rawPath.orEmpty()
            return if (rawPath == standardCatalog || rawPath == "/casino/real" || standardGamePath.matches(rawPath)) {
                GameFrameDecision.Allow
            } else {
                GameFrameDecision.Leave
            }
        }
        val casino = casinoPath(gameCode)
        if (casino != null) {
            if (uri.rawQuery != null || uri.rawFragment != null) return GameFrameDecision.Block
            return if (uri.rawPath == casino) GameFrameDecision.Allow else GameFrameDecision.Leave
        }
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
