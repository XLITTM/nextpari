package com.nextpari.app.feature.update

import java.net.URI

data class ReleaseNotice(
    val versionCode: Int,
    val versionName: String,
    val notes: String,
    val downloadUrl: String,
)

object ReleaseUpdatePolicy {
    private val trustedHosts = setOf("nextpari.net", "www.nextpari.net", "nextpari.com", "www.nextpari.com")

    fun officialDownloadUrl(apiBase: String): String? {
        val host = runCatching { URI(apiBase).host?.lowercase() }.getOrNull() ?: return null
        if (host !in trustedHosts) return null
        return "https://$host/download"
    }

    fun noticeFrom(
        apiBase: String,
        published: Boolean,
        versionCode: Int,
        versionName: String,
        notes: String,
        mode: String,
        currentVersionCode: Int,
        dismissedVersionCode: Int?,
    ): ReleaseNotice? {
        val downloadUrl = officialDownloadUrl(apiBase) ?: return null
        if (!published || mode != "recommended") return null
        if (versionCode <= currentVersionCode) return null
        if (dismissedVersionCode == versionCode) return null
        if (versionName.isBlank() || versionName.contains("debug", ignoreCase = true)) return null
        return ReleaseNotice(versionCode, versionName, notes, downloadUrl)
    }
}
