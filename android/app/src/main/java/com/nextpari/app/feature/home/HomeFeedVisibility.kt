package com.nextpari.app.feature.home

enum class HomeSectionBody { Data, Skeleton, EmptyText, Hidden }

object HomeFeedVisibility {
    fun topLive(loading: Boolean, count: Int): HomeSectionBody = when {
        count > 0 -> HomeSectionBody.Data
        loading -> HomeSectionBody.Skeleton
        else -> HomeSectionBody.Hidden
    }

    fun alwaysVisibleSection(loading: Boolean, count: Int): HomeSectionBody = when {
        count > 0 -> HomeSectionBody.Data
        loading -> HomeSectionBody.Skeleton
        else -> HomeSectionBody.EmptyText
    }

    fun optionalDataOnly(count: Int): HomeSectionBody =
        if (count > 0) HomeSectionBody.Data else HomeSectionBody.Hidden
}
