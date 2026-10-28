package com.nextpari.app.feature.games.web

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.ui.theme.NextpariTheme

@Composable
fun GameWebViewScreen(
    gameCode: String,
    onBack: () -> Unit,
) {
    val session by AppGraph.sessionRepository.session.collectAsStateWithLifecycle()
    val me = AppGraph.playerStateStore.me()
    var seenAuth by remember { mutableStateOf(false) }
    LaunchedEffect(session.isAuthenticated) {
        if (session.isAuthenticated) seenAuth = true
        else if (seenAuth) onBack()
    }
    BackHandler(onBack = onBack)
    val handoff = remember(session.isAuthenticated, session.playerPublicId, me?.wallet?.currency) {
        WebSessionBridge.handoff(
            cookies = AppGraph.sessionCookies(),
            authenticated = session.isAuthenticated && me?.playerPublicId == session.playerPublicId,
            playerPublicId = session.playerPublicId,
            walletCurrency = me?.wallet?.currency.orEmpty(),
        )
    }
    val url = GameWebPolicy.gameUrl(gameCode)
    if (!handoff.accepted || url == null) {
        BlockedGame(handoff.reason.ifBlank { "Сессия не подтверждена" }, onBack)
        return
    }
    GameDocument(url = url, gameCode = gameCode, onBack = onBack)
}

@Composable
private fun BlockedGame(message: String, onBack: () -> Unit) {
    val colors = NextpariTheme.colors
    Column(
        Modifier.fillMaxSize().background(colors.bg).statusBarsPadding().navigationBarsPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(message, color = colors.text)
        Button(onClick = onBack) { Text("Назад") }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun GameDocument(url: String, gameCode: String, onBack: () -> Unit) {
    val colors = NextpariTheme.colors
    var loading by remember(url) { mutableStateOf(true) }
    var failed by remember(url) { mutableStateOf(false) }
    var page by remember { mutableStateOf<WebView?>(null) }
    Box(Modifier.fillMaxSize().background(colors.bg).statusBarsPadding().navigationBarsPadding()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView.setWebContentsDebuggingEnabled(GameWebPolicy.WEB_CONTENTS_DEBUGGING)
                WebView(context).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    setLayerType(View.LAYER_TYPE_HARDWARE, null)
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        allowFileAccess = false
                        allowContentAccess = false
                        @Suppress("DEPRECATION")
                        allowFileAccessFromFileURLs = false
                        @Suppress("DEPRECATION")
                        allowUniversalAccessFromFileURLs = false
                        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        javaScriptCanOpenWindowsAutomatically = false
                        setSupportMultipleWindows(false)
                        mediaPlaybackRequiresUserGesture = false
                        safeBrowsingEnabled = true
                        cacheMode = WebSettings.LOAD_DEFAULT
                        setGeolocationEnabled(false)
                    }
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, GameWebPolicy.ACCEPT_THIRD_PARTY_COOKIES)
                    webChromeClient = object : WebChromeClient() {
                        override fun onPermissionRequest(request: PermissionRequest) {
                            request.deny()
                        }
                    }
                    val leftGame = java.util.concurrent.atomic.AtomicBoolean(false)
                    fun leaveGame() {
                        if (leftGame.compareAndSet(false, true)) onBack()
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            if (!request.isForMainFrame) return request.url.scheme != "https"
                            return when (GameWebPolicy.decideMainFrame(request.url.toString(), gameCode)) {
                                GameFrameDecision.Allow, GameFrameDecision.Ignore -> false
                                GameFrameDecision.Leave -> {
                                    leaveGame()
                                    true
                                }
                                GameFrameDecision.Block -> true
                            }
                        }

                        override fun doUpdateVisitedHistory(view: WebView, historyUrl: String?, isReload: Boolean) {
                            if (GameWebPolicy.decideMainFrame(historyUrl, gameCode) == GameFrameDecision.Leave) {
                                view.stopLoading()
                                leaveGame()
                            }
                        }

                        override fun onPageStarted(view: WebView?, started: String?, favicon: Bitmap?) {
                            loading = true
                            failed = false
                        }

                        override fun onPageFinished(view: WebView?, finished: String?) {
                            loading = false
                        }

                        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                            if (request.isForMainFrame) {
                                loading = false
                                failed = true
                            }
                        }

                        override fun onReceivedHttpError(
                            view: WebView,
                            request: WebResourceRequest,
                            errorResponse: WebResourceResponse,
                        ) {
                            if (request.isForMainFrame && errorResponse.statusCode >= 400) {
                                loading = false
                                failed = true
                            }
                        }
                    }
                    loadUrl(url)
                    page = this
                }
            },
            onRelease = { view ->
                view.stopLoading()
                view.destroy()
            },
        )
        if (loading && !failed) {
            Box(Modifier.fillMaxSize().background(colors.bg), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = colors.accent)
            }
        }
        if (failed) {
            Column(
                Modifier.fillMaxSize().background(colors.bg).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Нет соединения с игрой", color = colors.text)
                Button(onClick = {
                    failed = false
                    loading = true
                    val current = AppGraph.sessionRepository.session.value
                    val wallet = AppGraph.playerStateStore.me()
                    WebSessionBridge.handoff(
                        cookies = AppGraph.sessionCookies(),
                        authenticated = current.isAuthenticated && wallet?.playerPublicId == current.playerPublicId,
                        playerPublicId = current.playerPublicId,
                        walletCurrency = wallet?.wallet?.currency.orEmpty(),
                    )
                    page?.loadUrl(url)
                }) { Text("Повторить") }
            }
        }
    }
}
