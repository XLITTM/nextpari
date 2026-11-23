package com.nextpari.app.feature.sportsbook

import android.app.Activity
import android.app.Instrumentation
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityNodeInfo
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.core.network.NetworkModule
import java.io.File
import java.net.InetSocketAddress
import java.net.Proxy
import java.security.KeyStore
import java.security.cert.CertificateFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.decodeFromJsonElement

/** Explicit opt-in test: public GET only; no credentials, player session or POST. */
class SportsSmokeInstrumentation : Instrumentation() {
    private var arguments=Bundle()
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments);this.arguments=arguments?:Bundle();start() }
    override fun onStart() {
        val result=Bundle()
        try {
            fun progress(message:String) { sendStatus(0,Bundle().apply { putString("stream","$message\n") }) }
            check(arguments.getString("productionRead")=="1") { "Use -e productionRead 1 to permit the public endpoint GET" }
            progress("Reading actual production source")
            val captureFile=arguments.getString("captureFile")
            val data=if(captureFile!=null) {
                // Optional transport for emulators without a working proxy route. The caller
                // supplies the unmodified response of the actual public production GET.
                val raw=File(captureFile).readText()
                NetworkModule.json.decodeFromJsonElement<FootballFeedDto>(NetworkModule.json.parseToJsonElement(raw))
                    .toSnapshot(null,System.currentTimeMillis(),SystemClock.elapsedRealtime(),checkMarketAge=true)
            } else {
            val builder=NetworkModule.okHttpClient().newBuilder()
            arguments.getString("proxyPort")?.toIntOrNull()?.let { port ->
                builder.proxy(Proxy(Proxy.Type.HTTP,InetSocketAddress("10.0.2.2",port)))
            }
            // Test environment CA roots are supplied externally, never bundled in the app.
            arguments.getString("caFile")?.let { path ->
                val store=KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null) }
                File(path).inputStream().use { input -> CertificateFactory.getInstance("X.509").generateCertificates(input).forEachIndexed { i,cert -> store.setCertificateEntry("root-$i",cert) } }
                val factory=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
                val trust=factory.trustManagers.filterIsInstance<X509TrustManager>().single()
                val ssl=SSLContext.getInstance("TLS").apply { init(null,arrayOf(trust),null) }
                builder.sslSocketFactory(ssl.socketFactory,trust)
            }
            val repo=RemoteFootballRepository(NetworkModule.playerApi(builder.build(),"https://nextpari.net/"),NetworkModule.json)
            runBlocking { repo.read() }
            }
            check(data.fixtures.isNotEmpty()) { "Production read empty: ${data.notice}" }
            check(data.fixtures.any { it.markets.isNotEmpty() }) { "No market catalog decoded from production source" }
            progress("Decoded ${data.fixtures.size} real events and ${data.fixtures.sumOf { it.markets.size }} market families")
            check(data.fixtures.all { it.match.readOnly && oddsPapiEventId.matches(it.match.eventId) })
            check(data.fixtures.flatMap { it.markets }.flatMap { it.outcomes }.all { it.selection==null && it.locked })
            runOnMainSync { SportsReadOnlyTestActivity.snapshot=data }
            val activity=startActivitySync(Intent(targetContext,SportsReadOnlyTestActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            uiAutomation.serviceInfo=uiAutomation.serviceInfo.apply {
                flags=flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
            }
            val directory=File(targetContext.getExternalFilesDir(null),"sports-smoke").apply { mkdirs() }
            fun visibleTexts():List<String> {
                if(android.os.Build.VERSION.SDK_INT>=35)uiAutomation.clearCache()
                val roots=uiAutomation.windows.mapNotNull { it.root }.filter { it.packageName==targetContext.packageName }
                    .ifEmpty { listOfNotNull(uiAutomation.rootInActiveWindow) }
                val pending=java.util.ArrayDeque<AccessibilityNodeInfo>().apply { addAll(roots) }
                val texts=mutableListOf<String>()
                var visited=0
                while(pending.isNotEmpty() && visited++<1000) {
                    val node=pending.removeFirst()
                    if(node.isVisibleToUser) listOfNotNull(node.text,node.contentDescription).mapTo(texts) { it.toString() }
                    for(i in 0 until node.childCount) node.getChild(i)?.let(pending::addLast)
                }
                return texts
            }
            fun capture(name:String, route:String, expected:List<String>, dark:Boolean=false) {
                runOnMainSync { SportsReadOnlyTestActivity.dark=dark;SportsReadOnlyTestActivity.screen=route }
                val deadline=SystemClock.elapsedRealtime()+120_000
                var ready=false
                var observed=emptyList<String>()
                do {
                    observed=visibleTexts()
                    ready=expected.all { text -> observed.any { it.contains(text) } }
                    if(!ready)SystemClock.sleep(250)
                } while(!ready && SystemClock.elapsedRealtime()<deadline)
                check(ready) { "Native screen $name expected $expected; actual visible content: ${observed.take(20)}" }
                // Require actual rendered semantics, then allow the frame to commit.
                SystemClock.sleep(2500)
                val bitmap=checkNotNull(uiAutomation.takeScreenshot())
                File(directory,"$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) }
                val update=Bundle().apply { putString("stream","Captured $name from real API data\n") };sendStatus(0,update)
            }
            capture("sports-line","sports",listOf("Виды спорта"))
            val fixtures=data.fixtures.groupBy { it.match.sport }.mapValues { (_,values)->values.maxBy { it.markets.size } }
            for((sport,fixture) in fixtures) {
                capture("$sport-competitions",Destinations.championships(sport,if(fixture.match.isLive)"live" else "line"),listOf("Чемпионаты",SportsListCatalog.sportName(sport).uppercase()))
                capture("$sport-markets",Destinations.match(fixture.match.eventId),listOf(fixture.match.team1,fixture.match.team2)+fixture.markets.take(1).map { it.name })
            }
            val football=fixtures["football"]?:fixtures.values.first()
            capture("markets-dark",Destinations.match(football.match.eventId),listOf(football.match.team1,football.match.team2)+football.markets.take(1).map { it.name },true)
            val origin=if(captureFile==null)"PRODUCTION_READ_OK" else "PRODUCTION_CAPTURE_RENDER_OK"
            result.putString("stream","$origin events=${data.fixtures.size} sports=${fixtures.keys}; screenshots=$directory\n")
            runOnMainSync { activity.finish();SportsReadOnlyTestActivity.snapshot=null }
            finish(Activity.RESULT_OK,result)
        } catch(error:Throwable) {
            result.putString("stream", "PRODUCTION_UI_FAILED ${error.javaClass.simpleName}: ${error.message}\n${error.stackTraceToString()}")
            finish(Activity.RESULT_CANCELED,result)
        }
    }
}
