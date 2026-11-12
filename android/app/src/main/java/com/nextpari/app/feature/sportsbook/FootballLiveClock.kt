package com.nextpari.app.feature.sportsbook

import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.produceState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.nextpari.app.feature.home.MatchCardModel
import java.time.DateTimeException
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

private const val STALE_AFTER_MS = 90_000L
private const val MAX_SECONDS = 130 * 60 + 59

data class FootballLiveClock private constructor(
    private val elapsedSeconds: Int,
    private val running: Boolean,
    private val ageAtReceiptMs: Long,
    private val receiptElapsedMs: Long,
) {
    fun labelAt(nowElapsedMs: Long): String? {
        val age = ageAtReceiptMs + (nowElapsedMs - receiptElapsedMs).coerceAtLeast(0)
        if (age > STALE_AFTER_MS) return null
        val seconds = elapsedSeconds + if (running) (age / 1_000).toInt() else 0
        if (seconds > MAX_SECONDS) return null
        return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
    }

    companion object {
        internal fun fromWire(value: JsonElement?, receiptEpochMs: Long, receiptElapsedMs: Long): FootballLiveClock? {
            val raw = value as? JsonObject ?: return null
            fun field(key: String) = raw[key] as? JsonPrimitive
            val minute = field("minute")?.takeUnless { it.isString }?.intOrNull ?: return null
            val second = field("second")?.takeUnless { it.isString }?.intOrNull ?: return null
            val running = field("running")?.takeUnless { it.isString }?.booleanOrNull ?: return null
            if (minute !in 0..130 || second !in 0..59 ||
                field("stale")?.takeUnless { it.isString }?.booleanOrNull != false) return null
            val time = field("observedAt")?.takeIf { it.isString }?.content ?: return null
            val observation = try {
                Instant.parse(time).toEpochMilli()
            } catch (_: DateTimeException) {
                return null
            } catch (_: ArithmeticException) {
                return null
            }
            if (observation < receiptEpochMs - STALE_AFTER_MS || observation > receiptEpochMs + 5_000) return null
            return FootballLiveClock(minute * 60 + second, running,
                (receiptEpochMs - observation).coerceAtLeast(0), receiptElapsedMs)
        }
    }
}

@Composable
internal fun footballLiveMinute(match: MatchCardModel): String? {
    if (!match.isLive) return null
    if (match.sport != "football") return match.period
    val clock = match.liveClock ?: return null
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    return key(clock) {
        produceState(clock.labelAt(SystemClock.elapsedRealtime()), lifecycle) {
            lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                while (true) {
                    value = clock.labelAt(SystemClock.elapsedRealtime())
                    if (value == null) break
                    delay(1_000)
                }
            }
        }.value
    }
}
