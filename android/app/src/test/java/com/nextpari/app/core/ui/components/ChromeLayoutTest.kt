package com.nextpari.app.core.ui.components

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class ChromeLayoutTest {
    @Test
    fun bottomNavDrawsTopDividerBehindCouponInsteadOfRowBorder() {
        val bottomNav = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariBottomNav.kt").readText()
        val row = bottomNav.substringAfter("Row(").substringBefore("BottomNavSpec.items")
        assertThat(row).doesNotContain(".border(")
        assertThat(bottomNav).doesNotContain(".border(")
        assertThat(bottomNav).doesNotContain("foundation.border")
        assertThat(bottomNav).contains(".drawBehind {")
        assertThat(bottomNav).contains("start = Offset(0f, 0f)")
        assertThat(bottomNav).contains("end = Offset(size.width, 0f)")
        assertThat(bottomNav).contains("strokeWidth = 0.5.dp.toPx()")
        val box = bottomNav.substringAfter("Box(").substringBefore("Row(")
        assertThat(box).contains(".drawBehind {")
        assertThat(box).contains("drawLine(")
        assertThat(bottomNav.indexOf(".drawBehind {")).isLessThan(bottomNav.indexOf("Row("))
        assertThat(bottomNav).contains(".zIndex(1f)")
        assertThat(bottomNav).contains(".size(58.dp)")
        assertThat(bottomNav).contains("offset(y = (-20).dp)")
        assertThat(bottomNav).contains(".size(24.dp)")
        assertThat(bottomNav).contains("colors.accent")
        assertThat(bottomNav).contains(".shadow(12.dp, CircleShape)")
        assertThat(bottomNav).contains("if (betCount > 0)")
    }

    @Test
    fun couponGeometryAndNavigationStayUnchanged() {
        val bottomNav = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariBottomNav.kt").readText()
        val root = moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText()
        assertThat(bottomNav).contains(".size(58.dp)")
        assertThat(bottomNav).contains("offset(y = (-20).dp)")
        assertThat(bottomNav).contains("NextpariWebIcons.ticket(NextpariWebIcons.CouponStroke)")
        assertThat(root).contains("NextpariBottomNav(")
        assertThat(root).contains("onSelect = { item -> navController.navigateTab(item.route) }")
    }

    @Test
    fun headerOwnsMainTabsSlotInsideShadowAndRoundedSurface() {
        val header = moduleFile("src/main/java/com/nextpari/app/core/ui/components/NextpariHeader.kt").readText()
        assertThat(header).contains("bottomContent: (@Composable () -> Unit)? = null")
        val column = header.substringAfter("Column(").substringBefore("private fun HeaderIcon")
        assertThat(column).contains(".shadow(2.dp, RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))")
        assertThat(column).contains(".clip(RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp))")
        assertThat(column).contains(".height(56.dp)")
        assertThat(column).contains("bottomContent?.invoke()")
        assertThat(column.indexOf(".height(56.dp)")).isLessThan(column.indexOf("bottomContent?.invoke()"))
        assertThat(column.indexOf(".shadow(")).isLessThan(column.indexOf("bottomContent?.invoke()"))
        assertThat(column.indexOf(".clip(")).isLessThan(column.indexOf("bottomContent?.invoke()"))
    }

    @Test
    fun authenticatedShellRendersMainTabsInsideHeaderNotAsSibling() {
        val root = moduleFile("src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt").readText()
        val shell = root.substringAfter("private fun AuthenticatedShell(").substringBefore("bottomBar = {")
        assertThat(shell).contains("bottomContent = {")
        assertThat(shell).contains("if (showMainTabs) {")
        assertThat(shell).contains("NextpariMainTabs(activeId = homeState.mainTabId) { tab ->")
        assertThat(shell).doesNotContain("Column {")
        val headerCall = shell.substringAfter("NextpariHeader(")
        assertThat(headerCall).contains("bottomContent = {")
        assertThat(headerCall).contains("NextpariMainTabs(")
        assertThat(shell).contains("if (tab.id == \"games\") {")
        assertThat(shell).contains("navController.navigateTo(Destinations.GAMES)")
        assertThat(shell).contains("if (current != Destinations.HOME) navController.navigateTab(Destinations.HOME)")
        assertThat(shell).contains("homeViewModel.selectTab(tab.id)")
    }

    @Test
    fun homeSportsSelectorStaysOnGlossyBadges() {
        val home = moduleFile("src/main/java/com/nextpari/app/feature/home/HomeScreen.kt").readText()
        val selector = home.substringAfter("private fun SportsSelector(").substringBefore("private fun PromoRow(")
        assertThat(selector).contains("NextpariSportIconBadge(")
        assertThat(selector).contains("containerSize = 36.dp")
        assertThat(selector).contains("iconSize = 28.dp")
        assertThat(selector).doesNotContain("NextpariWebIcons")
        assertThat(selector).doesNotContain("NextpariSectionIcons")
        assertThat(selector).doesNotContain("SportIconRes.drawable")
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
