package com.nextpari.app.core.ui.icons

import androidx.compose.ui.graphics.vector.ImageVector
import com.nextpari.app.core.ui.icons.PremiumIconBuilder.fill
import com.nextpari.app.core.ui.icons.PremiumIconBuilder.stroke

object NextpariPremiumIcons : NextpariIconPack {
    private val cache = mutableMapOf<NextpariIconKey, ImageVector>()

    override fun vector(key: NextpariIconKey): ImageVector = cache.getOrPut(key) { build(key) }

    private fun build(key: NextpariIconKey): ImageVector = when (key) {
        NextpariIconKey.Home -> house()
        NextpariIconKey.Popular, NextpariIconKey.Top, NextpariIconKey.Fire -> flame()
        NextpariIconKey.Favorites, NextpariIconKey.FavoriteStarBorder -> starOutline()
        NextpariIconKey.FavoriteStar -> starFilled()
        NextpariIconKey.Betslip, NextpariIconKey.Ticket -> ticket()
        NextpariIconKey.History -> clock()
        NextpariIconKey.Menu, NextpariIconKey.Grid -> grid()
        NextpariIconKey.Sport -> sportBall()
        NextpariIconKey.Esports -> controller()
        NextpariIconKey.Casino -> chip()
        NextpariIconKey.Games -> dice()
        NextpariIconKey.Add -> plus()
        NextpariIconKey.Deposit, NextpariIconKey.Download -> trayArrow(down = true)
        NextpariIconKey.Wallet -> wallet()
        NextpariIconKey.Withdraw, NextpariIconKey.Upload -> trayArrow(down = false)
        NextpariIconKey.Currencies -> coins()
        NextpariIconKey.Search -> search()
        NextpariIconKey.Settings -> gear()
        NextpariIconKey.ThemeLight -> sun()
        NextpariIconKey.ThemeDark -> moon()
        NextpariIconKey.Profile, NextpariIconKey.Person -> person()
        NextpariIconKey.Mail, NextpariIconKey.Email -> envelope()
        NextpariIconKey.Notifications -> bell()
        NextpariIconKey.Back -> chevron(dx = -1f, autoMirror = true)
        NextpariIconKey.Forward, NextpariIconKey.ChevronRight -> chevron(dx = 1f, autoMirror = true)
        NextpariIconKey.ChevronDown -> chevronDown()
        NextpariIconKey.ChevronLeft -> chevron(dx = -1f, autoMirror = true)
        NextpariIconKey.Close -> close()
        NextpariIconKey.Share -> share()
        NextpariIconKey.Info -> info()
        NextpariIconKey.Support, NextpariIconKey.Headset -> headset()
        NextpariIconKey.Promo -> sparkles()
        NextpariIconKey.Gift, NextpariIconKey.Bonus -> gift()
        NextpariIconKey.Cashback -> cashback()
        NextpariIconKey.Vip -> crown()
        NextpariIconKey.Security, NextpariIconKey.Shield -> shield()
        NextpariIconKey.Authenticator -> authenticator()
        NextpariIconKey.Key -> key()
        NextpariIconKey.Live -> live()
        NextpariIconKey.Trophy -> trophy()
        NextpariIconKey.Filter -> funnel()
        NextpariIconKey.Copy -> copy()
        NextpariIconKey.Eye -> eye()
        NextpariIconKey.EyeOff -> eyeOff()
        NextpariIconKey.Lock -> lock()
        NextpariIconKey.Logout -> logout()
        NextpariIconKey.Pin, NextpariIconKey.Place -> mapPin()
        NextpariIconKey.PinFilled -> mapPin(filled = true)
        NextpariIconKey.Tv -> tv()
        NextpariIconKey.Globe, NextpariIconKey.Language -> globe()
        NextpariIconKey.Bolt -> bolt()
        NextpariIconKey.More -> more()
        NextpariIconKey.Payments -> banknote()
        NextpariIconKey.Bitcoin -> bitcoin()
        NextpariIconKey.Schedule -> calendar()
        NextpariIconKey.Check -> checkCircle()
        NextpariIconKey.Cancel -> cancelCircle()
        NextpariIconKey.Warning -> warning()
        NextpariIconKey.Book -> book()
        NextpariIconKey.CreditCard -> creditCard()
        NextpariIconKey.Percent -> percent()
        NextpariIconKey.Verified -> verified()
        NextpariIconKey.Diamond -> diamond()
        NextpariIconKey.Refresh -> refresh()
        NextpariIconKey.Heart -> heart(filled = true)
        NextpariIconKey.HeartBorder -> heart(filled = false)
        NextpariIconKey.Tune -> sliders()
        NextpariIconKey.Ads -> megaphone()
        NextpariIconKey.FactCheck -> clipboardCheck()
        NextpariIconKey.AccountBalance -> columns()
        NextpariIconKey.LegalBalance -> scales()
        NextpariIconKey.Phone -> phone()
        NextpariIconKey.Save -> save()
        NextpariIconKey.ShoppingCart -> cart()
        NextpariIconKey.Wifi -> wifi()
    }
}

private fun house() = PremiumIconBuilder.make("premium.Home") {
    stroke {
        moveTo(4.8f, 11.2f)
        lineTo(12f, 5.2f)
        lineTo(19.2f, 11.2f)
        moveTo(7.2f, 10.4f)
        lineTo(7.2f, 18.4f)
        lineTo(16.8f, 18.4f)
        lineTo(16.8f, 10.4f)
        moveTo(10.2f, 18.4f)
        lineTo(10.2f, 13.6f)
        lineTo(13.8f, 13.6f)
        lineTo(13.8f, 18.4f)
    }
}

private fun flame() = PremiumIconBuilder.make("premium.Fire") {
    stroke {
        moveTo(12f, 19.6f)
        curveTo(8.6f, 19.6f, 6.4f, 16.9f, 6.4f, 13.6f)
        curveTo(6.4f, 10.6f, 8.6f, 8.8f, 9.8f, 6.2f)
        curveTo(10.6f, 8.4f, 12f, 9.2f, 12f, 9.2f)
        curveTo(12f, 9.2f, 13.1f, 6.8f, 14.8f, 5.2f)
        curveTo(16.6f, 8.2f, 17.6f, 10.4f, 17.6f, 13.6f)
        curveTo(17.6f, 16.9f, 15.4f, 19.6f, 12f, 19.6f)
        close()
        moveTo(12f, 16.6f)
        curveTo(10.6f, 16.6f, 9.7f, 15.4f, 9.7f, 14.1f)
        curveTo(9.7f, 12.8f, 10.8f, 12f, 11.4f, 11f)
        curveTo(12.2f, 12.1f, 14.3f, 12.6f, 14.3f, 14.1f)
        curveTo(14.3f, 15.4f, 13.4f, 16.6f, 12f, 16.6f)
        close()
    }
}

private fun starOutline() = PremiumIconBuilder.make("premium.StarBorder") {
    stroke { star(12f, 12.2f, 7.4f, 3.15f) }
}

private fun starFilled() = PremiumIconBuilder.make("premium.Star") {
    fill { star(12f, 12.2f, 7.4f, 3.15f) }
}

private fun ticket() = PremiumIconBuilder.make("premium.Betslip") {
    stroke {
        moveTo(5.2f, 7.2f)
        lineTo(18.8f, 7.2f)
        curveTo(19.6f, 7.2f, 20.2f, 7.8f, 20.2f, 8.6f)
        lineTo(20.2f, 10.4f)
        curveTo(19.1f, 10.4f, 18.2f, 11.2f, 18.2f, 12.2f)
        curveTo(18.2f, 13.2f, 19.1f, 14f, 20.2f, 14f)
        lineTo(20.2f, 15.8f)
        curveTo(20.2f, 16.6f, 19.6f, 17.2f, 18.8f, 17.2f)
        lineTo(5.2f, 17.2f)
        curveTo(4.4f, 17.2f, 3.8f, 16.6f, 3.8f, 15.8f)
        lineTo(3.8f, 14f)
        curveTo(4.9f, 14f, 5.8f, 13.2f, 5.8f, 12.2f)
        curveTo(5.8f, 11.2f, 4.9f, 10.4f, 3.8f, 10.4f)
        lineTo(3.8f, 8.6f)
        curveTo(3.8f, 7.8f, 4.4f, 7.2f, 5.2f, 7.2f)
        close()
        moveTo(9.2f, 9.6f)
        lineTo(9.2f, 14.8f)
        moveTo(12.8f, 9.6f)
        lineTo(12.8f, 14.8f)
    }
}

private fun clock() = PremiumIconBuilder.make("premium.History") {
    stroke {
        circle(12f, 12.4f, 7.2f)
        moveTo(12f, 8.4f)
        lineTo(12f, 12.4f)
        lineTo(15.1f, 14.2f)
        moveTo(7.2f, 4.8f)
        lineTo(5.2f, 6.6f)
        moveTo(16.8f, 4.8f)
        lineTo(18.8f, 6.6f)
    }
}

private fun grid() = PremiumIconBuilder.make("premium.Menu") {
    stroke {
        roundedRect(4.6f, 4.6f, 10.4f, 10.4f, 1.4f)
        roundedRect(13.6f, 4.6f, 19.4f, 10.4f, 1.4f)
        roundedRect(4.6f, 13.6f, 10.4f, 19.4f, 1.4f)
        roundedRect(13.6f, 13.6f, 19.4f, 19.4f, 1.4f)
    }
}

private fun sportBall() = PremiumIconBuilder.make("premium.Sport") {
    stroke(PremiumIconBuilder.SportStroke) {
        circle(12f, 12f, 7.2f)
        moveTo(12f, 4.8f)
        curveTo(9.8f, 7.4f, 9.1f, 10.4f, 9.4f, 19.2f)
        moveTo(4.9f, 9.4f)
        curveTo(8.4f, 10.6f, 12.6f, 11.4f, 19.1f, 10.2f)
        moveTo(6.2f, 16.8f)
        curveTo(9.4f, 15.2f, 13.6f, 15.1f, 17.8f, 16.6f)
    }
}

private fun controller() = PremiumIconBuilder.make("premium.Esports") {
    stroke {
        moveTo(7.4f, 9.1f)
        curveTo(8.1f, 8.2f, 9.4f, 7.6f, 12f, 7.6f)
        curveTo(14.6f, 7.6f, 15.9f, 8.2f, 16.6f, 9.1f)
        curveTo(18.8f, 9.4f, 20.4f, 10.8f, 20.4f, 12.8f)
        curveTo(20.4f, 15f, 18.7f, 16.8f, 16.6f, 16.8f)
        curveTo(15.8f, 16.8f, 15.1f, 16.5f, 14.6f, 16f)
        lineTo(9.4f, 16f)
        curveTo(8.9f, 16.5f, 8.2f, 16.8f, 7.4f, 16.8f)
        curveTo(5.3f, 16.8f, 3.6f, 15f, 3.6f, 12.8f)
        curveTo(3.6f, 10.8f, 5.2f, 9.4f, 7.4f, 9.1f)
        close()
        moveTo(8f, 11.6f)
        lineTo(8f, 14.2f)
        moveTo(6.7f, 12.9f)
        lineTo(9.3f, 12.9f)
        moveTo(14.6f, 12.2f)
        circle(14.6f, 12.2f, 0.55f)
        moveTo(16.6f, 13.8f)
        circle(16.6f, 13.8f, 0.55f)
    }
}

private fun chip() = PremiumIconBuilder.make("premium.Casino") {
    stroke {
        circle(12f, 12f, 7.4f)
        circle(12f, 12f, 3.6f)
        moveTo(12f, 4.6f)
        lineTo(12f, 6.4f)
        moveTo(12f, 17.6f)
        lineTo(12f, 19.4f)
        moveTo(4.6f, 12f)
        lineTo(6.4f, 12f)
        moveTo(17.6f, 12f)
        lineTo(19.4f, 12f)
        moveTo(7f, 7f)
        lineTo(8.2f, 8.2f)
        moveTo(15.8f, 15.8f)
        lineTo(17f, 17f)
        moveTo(17f, 7f)
        lineTo(15.8f, 8.2f)
        moveTo(8.2f, 15.8f)
        lineTo(7f, 17f)
    }
}

private fun dice() = PremiumIconBuilder.make("premium.Games") {
    stroke {
        roundedRect(5.4f, 5.4f, 18.6f, 18.6f, 3.2f)
        moveTo(9.2f, 9.2f)
        circle(9.2f, 9.2f, 0.7f)
        moveTo(14.8f, 9.2f)
        circle(14.8f, 9.2f, 0.7f)
        moveTo(12f, 12f)
        circle(12f, 12f, 0.7f)
        moveTo(9.2f, 14.8f)
        circle(9.2f, 14.8f, 0.7f)
        moveTo(14.8f, 14.8f)
        circle(14.8f, 14.8f, 0.7f)
    }
}

private fun plus() = PremiumIconBuilder.make("premium.Add") {
    stroke(1.9f) {
        moveTo(12f, 6.4f)
        lineTo(12f, 17.6f)
        moveTo(6.4f, 12f)
        lineTo(17.6f, 12f)
    }
}

private fun trayArrow(down: Boolean) = PremiumIconBuilder.make(if (down) "premium.Deposit" else "premium.Withdraw") {
    stroke {
        moveTo(6.2f, 16.8f)
        lineTo(6.2f, 18.6f)
        lineTo(17.8f, 18.6f)
        lineTo(17.8f, 16.8f)
        if (down) {
            moveTo(12f, 5.4f)
            lineTo(12f, 14.2f)
            moveTo(8.6f, 11f)
            lineTo(12f, 14.4f)
            lineTo(15.4f, 11f)
        } else {
            moveTo(12f, 15.2f)
            lineTo(12f, 6.4f)
            moveTo(8.6f, 9.6f)
            lineTo(12f, 6.2f)
            lineTo(15.4f, 9.6f)
        }
    }
}

private fun wallet() = PremiumIconBuilder.make("premium.Wallet") {
    stroke {
        roundedRect(4.4f, 7.2f, 19.6f, 18.2f, 2.2f)
        moveTo(4.4f, 9.8f)
        lineTo(19.6f, 9.8f)
        moveTo(15.2f, 12.4f)
        lineTo(19.6f, 12.4f)
        lineTo(19.6f, 15.4f)
        lineTo(15.2f, 15.4f)
        curveTo(14.4f, 15.4f, 13.8f, 14.8f, 13.8f, 14f)
        curveTo(13.8f, 13.2f, 14.4f, 12.4f, 15.2f, 12.4f)
        close()
        moveTo(16.6f, 13.9f)
        circle(16.6f, 13.9f, 0.55f)
        moveTo(7.2f, 7.2f)
        curveTo(7.2f, 5.8f, 8.4f, 5.2f, 10.4f, 5.2f)
        lineTo(16.4f, 5.2f)
    }
}

private fun coins() = PremiumIconBuilder.make("premium.Currencies") {
    stroke {
        circle(10.4f, 13.6f, 5.4f)
        moveTo(14.2f, 8.2f)
        curveTo(15.1f, 7.6f, 16.3f, 7.4f, 17.4f, 7.8f)
        curveTo(19.8f, 8.8f, 20.4f, 11.6f, 18.8f, 14.2f)
        moveTo(10.4f, 11.2f)
        lineTo(10.4f, 16f)
        moveTo(8.6f, 12.4f)
        curveTo(9.2f, 11.8f, 10f, 11.4f, 10.8f, 11.4f)
        curveTo(11.8f, 11.4f, 12.4f, 12f, 12.4f, 12.8f)
        curveTo(12.4f, 14.4f, 8.4f, 13.6f, 8.4f, 15.2f)
        curveTo(8.4f, 16f, 9.2f, 16.6f, 10.6f, 16.6f)
        curveTo(11.4f, 16.6f, 12.1f, 16.3f, 12.5f, 15.8f)
    }
}

private fun search() = PremiumIconBuilder.make("premium.Search") {
    stroke {
        circle(11f, 11f, 5.6f)
        moveTo(15.2f, 15.2f)
        lineTo(19.4f, 19.4f)
    }
}

private fun gear() = PremiumIconBuilder.make("premium.Settings") {
    stroke {
        circle(12f, 12f, 3.1f)
        moveTo(12f, 4.6f)
        lineTo(12f, 6.6f)
        moveTo(12f, 17.4f)
        lineTo(12f, 19.4f)
        moveTo(4.6f, 12f)
        lineTo(6.6f, 12f)
        moveTo(17.4f, 12f)
        lineTo(19.4f, 12f)
        moveTo(6.8f, 6.8f)
        lineTo(8.2f, 8.2f)
        moveTo(15.8f, 15.8f)
        lineTo(17.2f, 17.2f)
        moveTo(17.2f, 6.8f)
        lineTo(15.8f, 8.2f)
        moveTo(8.2f, 15.8f)
        lineTo(6.8f, 17.2f)
    }
}

private fun sun() = PremiumIconBuilder.make("premium.ThemeLight") {
    stroke {
        circle(12f, 12f, 3.6f)
        moveTo(12f, 4.6f)
        lineTo(12f, 6.4f)
        moveTo(12f, 17.6f)
        lineTo(12f, 19.4f)
        moveTo(4.6f, 12f)
        lineTo(6.4f, 12f)
        moveTo(17.6f, 12f)
        lineTo(19.4f, 12f)
        moveTo(6.8f, 6.8f)
        lineTo(8.1f, 8.1f)
        moveTo(15.9f, 15.9f)
        lineTo(17.2f, 17.2f)
        moveTo(17.2f, 6.8f)
        lineTo(15.9f, 8.1f)
        moveTo(8.1f, 15.9f)
        lineTo(6.8f, 17.2f)
    }
}

private fun moon() = PremiumIconBuilder.make("premium.ThemeDark") {
    stroke {
        moveTo(14.6f, 5.4f)
        curveTo(10.2f, 6.2f, 7.2f, 10f, 7.6f, 14.4f)
        curveTo(8f, 17.8f, 10.8f, 20.2f, 14.2f, 20.4f)
        curveTo(11f, 21.2f, 7.4f, 19.4f, 6.2f, 16f)
        curveTo(4.8f, 11.8f, 6.8f, 7.2f, 10.8f, 5.6f)
        curveTo(12f, 5.2f, 13.4f, 5.2f, 14.6f, 5.4f)
        close()
    }
}

private fun person() = PremiumIconBuilder.make("premium.Profile") {
    stroke {
        circle(12f, 8.4f, 3.1f)
        moveTo(5.6f, 19.2f)
        curveTo(5.8f, 15.4f, 8.4f, 13.4f, 12f, 13.4f)
        curveTo(15.6f, 13.4f, 18.2f, 15.4f, 18.4f, 19.2f)
    }
}

private fun envelope() = PremiumIconBuilder.make("premium.Mail") {
    stroke {
        roundedRect(4.2f, 6.8f, 19.8f, 17.4f, 1.8f)
        moveTo(5f, 8f)
        lineTo(12f, 13.2f)
        lineTo(19f, 8f)
    }
}

private fun bell() = PremiumIconBuilder.make("premium.Notifications") {
    stroke {
        moveTo(7.4f, 16.4f)
        lineTo(16.6f, 16.4f)
        curveTo(16.6f, 16.4f, 17.6f, 13.8f, 17.6f, 11.2f)
        curveTo(17.6f, 8.4f, 15.2f, 6.2f, 12f, 6.2f)
        curveTo(8.8f, 6.2f, 6.4f, 8.4f, 6.4f, 11.2f)
        curveTo(6.4f, 13.8f, 7.4f, 16.4f, 7.4f, 16.4f)
        close()
        moveTo(10.4f, 16.4f)
        curveTo(10.4f, 17.6f, 11.1f, 18.6f, 12f, 18.6f)
        curveTo(12.9f, 18.6f, 13.6f, 17.6f, 13.6f, 16.4f)
        moveTo(12f, 4.6f)
        lineTo(12f, 6.2f)
    }
}

private fun chevron(dx: Float, autoMirror: Boolean) = PremiumIconBuilder.make(
    if (dx < 0f) "premium.Back" else "premium.Forward",
    autoMirror = autoMirror,
) {
    stroke(1.9f) {
        val x1 = 12f - 3.6f * dx
        moveTo(12f + 2.4f * dx, 6.6f)
        lineTo(x1, 12f)
        lineTo(12f + 2.4f * dx, 17.4f)
    }
}

private fun chevronDown() = PremiumIconBuilder.make("premium.ChevronDown") {
    stroke(1.9f) {
        moveTo(6.6f, 9.6f)
        lineTo(12f, 15f)
        lineTo(17.4f, 9.6f)
    }
}

private fun close() = PremiumIconBuilder.make("premium.Close") {
    stroke(1.9f) {
        moveTo(7f, 7f)
        lineTo(17f, 17f)
        moveTo(17f, 7f)
        lineTo(7f, 17f)
    }
}

private fun share() = PremiumIconBuilder.make("premium.Share") {
    stroke {
        circle(17.2f, 6.8f, 2.1f)
        circle(6.8f, 12f, 2.1f)
        circle(17.2f, 17.2f, 2.1f)
        moveTo(8.7f, 11f)
        lineTo(15.3f, 7.8f)
        moveTo(8.7f, 13f)
        lineTo(15.3f, 16.2f)
    }
}

private fun info() = PremiumIconBuilder.make("premium.Info") {
    stroke {
        circle(12f, 12f, 7.4f)
        moveTo(12f, 10.4f)
        lineTo(12f, 16.4f)
        moveTo(12f, 7.6f)
        circle(12f, 7.6f, 0.55f)
    }
}

private fun headset() = PremiumIconBuilder.make("premium.Support") {
    stroke {
        moveTo(6.4f, 13.2f)
        curveTo(6.4f, 8.8f, 8.8f, 5.6f, 12f, 5.6f)
        curveTo(15.2f, 5.6f, 17.6f, 8.8f, 17.6f, 13.2f)
        roundedRect(4.4f, 12.4f, 7.8f, 18f, 1.4f)
        roundedRect(16.2f, 12.4f, 19.6f, 18f, 1.4f)
        moveTo(17.6f, 17.2f)
        curveTo(17.6f, 19f, 16f, 20.2f, 14.2f, 20.2f)
        lineTo(13.2f, 20.2f)
    }
}

private fun sparkles() = PremiumIconBuilder.make("premium.Promo") {
    stroke {
        moveTo(12f, 4.8f)
        lineTo(13.3f, 9.4f)
        lineTo(18f, 10.6f)
        lineTo(13.3f, 11.8f)
        lineTo(12f, 16.4f)
        lineTo(10.7f, 11.8f)
        lineTo(6f, 10.6f)
        lineTo(10.7f, 9.4f)
        close()
        moveTo(17.4f, 15.2f)
        lineTo(18.1f, 17.1f)
        lineTo(20f, 17.8f)
        lineTo(18.1f, 18.5f)
        lineTo(17.4f, 20.4f)
        lineTo(16.7f, 18.5f)
        lineTo(14.8f, 17.8f)
        lineTo(16.7f, 17.1f)
        close()
    }
}

private fun gift() = PremiumIconBuilder.make("premium.Gift") {
    stroke {
        roundedRect(5.2f, 11f, 18.8f, 19.2f, 1.6f)
        roundedRect(4.6f, 7.6f, 19.4f, 11.2f, 1.4f)
        moveTo(12f, 7.6f)
        lineTo(12f, 19.2f)
        moveTo(12f, 7.6f)
        curveTo(12f, 5.6f, 10.2f, 4.8f, 9f, 5.8f)
        curveTo(8.2f, 6.5f, 8.6f, 7.6f, 10f, 7.6f)
        lineTo(12f, 7.6f)
        curveTo(12f, 5.6f, 13.8f, 4.8f, 15f, 5.8f)
        curveTo(15.8f, 6.5f, 15.4f, 7.6f, 14f, 7.6f)
        lineTo(12f, 7.6f)
    }
}

private fun cashback() = PremiumIconBuilder.make("premium.Cashback") {
    stroke {
        circle(12f, 12f, 7.2f)
        moveTo(8.2f, 10.2f)
        curveTo(8.8f, 8.6f, 10.4f, 7.6f, 12.2f, 7.6f)
        curveTo(14.6f, 7.6f, 16.4f, 9.2f, 16.4f, 11.2f)
        moveTo(15.8f, 13.8f)
        curveTo(15.2f, 15.4f, 13.6f, 16.4f, 11.8f, 16.4f)
        curveTo(9.4f, 16.4f, 7.6f, 14.8f, 7.6f, 12.8f)
        moveTo(16.4f, 8.4f)
        lineTo(16.4f, 11.2f)
        lineTo(13.8f, 11.2f)
        moveTo(7.6f, 15.6f)
        lineTo(7.6f, 12.8f)
        lineTo(10.2f, 12.8f)
    }
}

private fun crown() = PremiumIconBuilder.make("premium.Vip") {
    stroke {
        moveTo(5.2f, 16.8f)
        lineTo(18.8f, 16.8f)
        lineTo(19.4f, 9.2f)
        lineTo(15.2f, 12.2f)
        lineTo(12f, 6.8f)
        lineTo(8.8f, 12.2f)
        lineTo(4.6f, 9.2f)
        close()
        moveTo(6.4f, 16.8f)
        lineTo(6.4f, 18.6f)
        lineTo(17.6f, 18.6f)
        lineTo(17.6f, 16.8f)
    }
}

private fun shield() = PremiumIconBuilder.make("premium.Security") {
    stroke {
        moveTo(12f, 4.6f)
        curveTo(14.6f, 6.2f, 17.4f, 6.8f, 19.2f, 6.8f)
        curveTo(19.2f, 13.6f, 16.6f, 18.2f, 12f, 20.2f)
        curveTo(7.4f, 18.2f, 4.8f, 13.6f, 4.8f, 6.8f)
        curveTo(6.6f, 6.8f, 9.4f, 6.2f, 12f, 4.6f)
        close()
        moveTo(9.2f, 12.2f)
        lineTo(11.2f, 14.2f)
        lineTo(15.2f, 9.8f)
    }
}

private fun authenticator() = PremiumIconBuilder.make("premium.Authenticator") {
    stroke {
        roundedRect(8f, 4.6f, 16f, 19.4f, 2.2f)
        moveTo(12f, 8.2f)
        lineTo(12f, 12.4f)
        lineTo(14.2f, 13.6f)
        moveTo(10.4f, 17.6f)
        lineTo(13.6f, 17.6f)
    }
}

private fun key() = PremiumIconBuilder.make("premium.Key") {
    stroke {
        circle(8.4f, 12f, 3.4f)
        moveTo(11.6f, 12f)
        lineTo(20f, 12f)
        lineTo(20f, 14.6f)
        moveTo(16.4f, 12f)
        lineTo(16.4f, 14.2f)
    }
}

private fun live() = PremiumIconBuilder.make("premium.Live") {
    stroke {
        circle(12f, 12f, 1.5f)
        circle(12f, 12f, 4.4f)
        circle(12f, 12f, 7.4f)
    }
}

private fun trophy() = PremiumIconBuilder.make("premium.Trophy") {
    stroke {
        moveTo(8.2f, 5.2f)
        lineTo(15.8f, 5.2f)
        curveTo(15.8f, 5.2f, 16.4f, 9.6f, 14.6f, 12.4f)
        curveTo(13.6f, 13.8f, 12.8f, 14.2f, 12f, 14.2f)
        curveTo(11.2f, 14.2f, 10.4f, 13.8f, 9.4f, 12.4f)
        curveTo(7.6f, 9.6f, 8.2f, 5.2f, 8.2f, 5.2f)
        close()
        moveTo(15.8f, 6.4f)
        curveTo(18.2f, 6.6f, 19.2f, 8.6f, 18.4f, 10.6f)
        curveTo(17.7f, 12.2f, 16.2f, 12.6f, 15.2f, 12.2f)
        moveTo(8.2f, 6.4f)
        curveTo(5.8f, 6.6f, 4.8f, 8.6f, 5.6f, 10.6f)
        curveTo(6.3f, 12.2f, 7.8f, 12.6f, 8.8f, 12.2f)
        moveTo(12f, 14.2f)
        lineTo(12f, 16.8f)
        moveTo(9.2f, 18.8f)
        lineTo(14.8f, 18.8f)
        moveTo(8.4f, 16.8f)
        lineTo(15.6f, 16.8f)
    }
}

private fun funnel() = PremiumIconBuilder.make("premium.Filter") {
    stroke {
        moveTo(5.2f, 6.2f)
        lineTo(18.8f, 6.2f)
        lineTo(13.6f, 12.4f)
        lineTo(13.6f, 18.2f)
        lineTo(10.4f, 16.6f)
        lineTo(10.4f, 12.4f)
        close()
    }
}

private fun copy() = PremiumIconBuilder.make("premium.Copy") {
    stroke {
        roundedRect(7.6f, 7.6f, 18.6f, 18.6f, 1.8f)
        moveTo(7.6f, 16.2f)
        lineTo(5.6f, 16.2f)
        curveTo(4.8f, 16.2f, 4.2f, 15.6f, 4.2f, 14.8f)
        lineTo(4.2f, 5.6f)
        curveTo(4.2f, 4.8f, 4.8f, 4.2f, 5.6f, 4.2f)
        lineTo(14.8f, 4.2f)
        curveTo(15.6f, 4.2f, 16.2f, 4.8f, 16.2f, 5.6f)
        lineTo(16.2f, 7.6f)
    }
}

private fun eye() = PremiumIconBuilder.make("premium.Eye") {
    stroke {
        moveTo(3.8f, 12f)
        curveTo(6.4f, 7.6f, 9.2f, 5.8f, 12f, 5.8f)
        curveTo(14.8f, 5.8f, 17.6f, 7.6f, 20.2f, 12f)
        curveTo(17.6f, 16.4f, 14.8f, 18.2f, 12f, 18.2f)
        curveTo(9.2f, 18.2f, 6.4f, 16.4f, 3.8f, 12f)
        close()
        circle(12f, 12f, 2.4f)
    }
}

private fun eyeOff() = PremiumIconBuilder.make("premium.EyeOff") {
    stroke {
        moveTo(4f, 5.2f)
        lineTo(19.2f, 18.8f)
        moveTo(9.4f, 9.6f)
        curveTo(8.8f, 10.3f, 8.4f, 11.1f, 8.4f, 12f)
        curveTo(8.4f, 14f, 10f, 15.6f, 12f, 15.6f)
        curveTo(12.9f, 15.6f, 13.7f, 15.2f, 14.4f, 14.6f)
        moveTo(6.2f, 8.4f)
        curveTo(4.8f, 9.6f, 3.8f, 11f, 3.6f, 12f)
        curveTo(6f, 16.4f, 8.8f, 18.2f, 12f, 18.2f)
        curveTo(13.6f, 18.2f, 15.1f, 17.7f, 16.6f, 16.8f)
        moveTo(10.6f, 6.2f)
        curveTo(11f, 6f, 11.5f, 5.8f, 12f, 5.8f)
        curveTo(14.8f, 5.8f, 17.6f, 7.6f, 20.2f, 12f)
        curveTo(19.7f, 12.9f, 19.1f, 13.7f, 18.4f, 14.4f)
    }
}

private fun lock() = PremiumIconBuilder.make("premium.Lock") {
    stroke {
        roundedRect(6.4f, 10.6f, 17.6f, 19.2f, 1.8f)
        moveTo(8.6f, 10.6f)
        lineTo(8.6f, 8.4f)
        curveTo(8.6f, 6.2f, 10.1f, 4.6f, 12f, 4.6f)
        curveTo(13.9f, 4.6f, 15.4f, 6.2f, 15.4f, 8.4f)
        lineTo(15.4f, 10.6f)
        moveTo(12f, 13.6f)
        lineTo(12f, 16.2f)
    }
}

private fun logout() = PremiumIconBuilder.make("premium.Logout", autoMirror = true) {
    stroke {
        moveTo(10.2f, 6.2f)
        lineTo(7.2f, 6.2f)
        curveTo(6.2f, 6.2f, 5.4f, 7f, 5.4f, 8f)
        lineTo(5.4f, 16f)
        curveTo(5.4f, 17f, 6.2f, 17.8f, 7.2f, 17.8f)
        lineTo(10.2f, 17.8f)
        moveTo(13.2f, 12f)
        lineTo(20f, 12f)
        moveTo(17.2f, 8.8f)
        lineTo(20.2f, 12f)
        lineTo(17.2f, 15.2f)
    }
}

private fun mapPin(filled: Boolean = false) = PremiumIconBuilder.make(if (filled) "premium.PinFilled" else "premium.Pin") {
    val body: androidx.compose.ui.graphics.vector.PathBuilder.() -> Unit = {
        moveTo(12f, 19.6f)
        curveTo(12f, 19.6f, 6.4f, 14.4f, 6.4f, 10.4f)
        curveTo(6.4f, 7.2f, 8.8f, 4.8f, 12f, 4.8f)
        curveTo(15.2f, 4.8f, 17.6f, 7.2f, 17.6f, 10.4f)
        curveTo(17.6f, 14.4f, 12f, 19.6f, 12f, 19.6f)
        close()
        circle(12f, 10.2f, 1.8f)
    }
    if (filled) fill(body) else stroke(block = body)
}

private fun tv() = PremiumIconBuilder.make("premium.Tv") {
    stroke {
        roundedRect(4.2f, 5.6f, 19.8f, 16.4f, 1.8f)
        moveTo(9.2f, 18.6f)
        lineTo(14.8f, 18.6f)
        moveTo(12f, 16.4f)
        lineTo(12f, 18.6f)
    }
}

private fun globe() = PremiumIconBuilder.make("premium.Globe") {
    stroke {
        circle(12f, 12f, 7.2f)
        moveTo(12f, 4.8f)
        curveTo(14.6f, 7.6f, 15.6f, 10.4f, 15.6f, 12f)
        curveTo(15.6f, 13.6f, 14.6f, 16.4f, 12f, 19.2f)
        curveTo(9.4f, 16.4f, 8.4f, 13.6f, 8.4f, 12f)
        curveTo(8.4f, 10.4f, 9.4f, 7.6f, 12f, 4.8f)
        moveTo(5f, 10.2f)
        lineTo(19f, 10.2f)
        moveTo(5f, 13.8f)
        lineTo(19f, 13.8f)
    }
}

private fun bolt() = PremiumIconBuilder.make("premium.Bolt") {
    stroke {
        moveTo(13.6f, 4.6f)
        lineTo(8.2f, 13.2f)
        lineTo(12.2f, 13.2f)
        lineTo(10.4f, 19.4f)
        lineTo(16.4f, 10.4f)
        lineTo(12.6f, 10.4f)
        close()
    }
}

private fun more() = PremiumIconBuilder.make("premium.More") {
    fill {
        circle(12f, 6.4f, 1.35f)
        circle(12f, 12f, 1.35f)
        circle(12f, 17.6f, 1.35f)
    }
}

private fun banknote() = PremiumIconBuilder.make("premium.Payments") {
    stroke {
        roundedRect(3.8f, 7.2f, 20.2f, 16.8f, 1.8f)
        circle(12f, 12f, 2.2f)
        moveTo(6.2f, 9.4f)
        lineTo(6.2f, 14.6f)
        moveTo(17.8f, 9.4f)
        lineTo(17.8f, 14.6f)
    }
}

private fun bitcoin() = PremiumIconBuilder.make("premium.Bitcoin") {
    stroke {
        circle(12f, 12f, 7.4f)
        moveTo(10.2f, 8.2f)
        lineTo(10.2f, 15.8f)
        moveTo(10.2f, 8.2f)
        lineTo(13.4f, 8.2f)
        curveTo(14.8f, 8.2f, 15.8f, 9.2f, 15.8f, 10.4f)
        curveTo(15.8f, 11.6f, 14.8f, 12.4f, 13.4f, 12.4f)
        lineTo(10.2f, 12.4f)
        lineTo(13.6f, 12.4f)
        curveTo(15.1f, 12.4f, 16.1f, 13.4f, 16.1f, 14.6f)
        curveTo(16.1f, 15.8f, 15.1f, 16.8f, 13.6f, 16.8f)
        lineTo(10.2f, 16.8f)
        moveTo(11.6f, 7.2f)
        lineTo(11.6f, 8.2f)
        moveTo(13.4f, 7.2f)
        lineTo(13.4f, 8.2f)
        moveTo(11.6f, 16.8f)
        lineTo(11.6f, 17.8f)
        moveTo(13.4f, 16.8f)
        lineTo(13.4f, 17.8f)
    }
}

private fun calendar() = PremiumIconBuilder.make("premium.Schedule") {
    stroke {
        roundedRect(5f, 6.4f, 19f, 19f, 1.8f)
        moveTo(5f, 10.4f)
        lineTo(19f, 10.4f)
        moveTo(9f, 4.8f)
        lineTo(9f, 7.6f)
        moveTo(15f, 4.8f)
        lineTo(15f, 7.6f)
    }
}

private fun checkCircle() = PremiumIconBuilder.make("premium.Check") {
    stroke {
        circle(12f, 12f, 7.4f)
        moveTo(8.2f, 12.2f)
        lineTo(10.8f, 14.8f)
        lineTo(16f, 9.4f)
    }
}

private fun cancelCircle() = PremiumIconBuilder.make("premium.Cancel") {
    stroke {
        circle(12f, 12f, 7.4f)
        moveTo(9f, 9f)
        lineTo(15f, 15f)
        moveTo(15f, 9f)
        lineTo(9f, 15f)
    }
}

private fun warning() = PremiumIconBuilder.make("premium.Warning") {
    stroke {
        moveTo(12f, 5.2f)
        lineTo(20.2f, 18.6f)
        lineTo(3.8f, 18.6f)
        close()
        moveTo(12f, 10.2f)
        lineTo(12f, 14.2f)
        moveTo(12f, 16.6f)
        circle(12f, 16.6f, 0.45f)
    }
}

private fun book() = PremiumIconBuilder.make("premium.Book") {
    stroke {
        moveTo(6.4f, 5.2f)
        lineTo(12f, 7f)
        lineTo(17.6f, 5.2f)
        lineTo(17.6f, 17.4f)
        lineTo(12f, 19.2f)
        lineTo(6.4f, 17.4f)
        close()
        moveTo(12f, 7f)
        lineTo(12f, 19.2f)
    }
}

private fun creditCard() = PremiumIconBuilder.make("premium.CreditCard") {
    stroke {
        roundedRect(3.8f, 6.8f, 20.2f, 17.2f, 1.8f)
        moveTo(3.8f, 10.4f)
        lineTo(20.2f, 10.4f)
        moveTo(7f, 14.2f)
        lineTo(11.4f, 14.2f)
    }
}

private fun percent() = PremiumIconBuilder.make("premium.Percent") {
    stroke {
        circle(8.4f, 8.4f, 2.1f)
        circle(15.6f, 15.6f, 2.1f)
        moveTo(16.8f, 6.6f)
        lineTo(7.2f, 17.4f)
    }
}

private fun verified() = PremiumIconBuilder.make("premium.Verified") {
    stroke {
        moveTo(12f, 4.4f)
        lineTo(14.2f, 6.2f)
        lineTo(17f, 5.8f)
        lineTo(17.6f, 8.6f)
        lineTo(20f, 10.4f)
        lineTo(18.6f, 13f)
        lineTo(19.4f, 15.8f)
        lineTo(16.6f, 16.6f)
        lineTo(15.2f, 19.2f)
        lineTo(12f, 18.2f)
        lineTo(8.8f, 19.2f)
        lineTo(7.4f, 16.6f)
        lineTo(4.6f, 15.8f)
        lineTo(5.4f, 13f)
        lineTo(4f, 10.4f)
        lineTo(6.4f, 8.6f)
        lineTo(7f, 5.8f)
        lineTo(9.8f, 6.2f)
        close()
        moveTo(9.2f, 12.2f)
        lineTo(11.1f, 14.1f)
        lineTo(15.2f, 9.8f)
    }
}

private fun diamond() = PremiumIconBuilder.make("premium.Diamond") {
    stroke {
        moveTo(7.2f, 6.4f)
        lineTo(16.8f, 6.4f)
        lineTo(20.2f, 10.6f)
        lineTo(12f, 19.4f)
        lineTo(3.8f, 10.6f)
        close()
        moveTo(7.2f, 6.4f)
        lineTo(9.6f, 10.6f)
        lineTo(12f, 6.4f)
        lineTo(14.4f, 10.6f)
        lineTo(16.8f, 6.4f)
        moveTo(3.8f, 10.6f)
        lineTo(20.2f, 10.6f)
    }
}

private fun refresh() = PremiumIconBuilder.make("premium.Refresh") {
    stroke {
        moveTo(19.2f, 12f)
        curveTo(19.2f, 16f, 16f, 19.2f, 12f, 19.2f)
        curveTo(8f, 19.2f, 4.8f, 16f, 4.8f, 12f)
        curveTo(4.8f, 8f, 8f, 4.8f, 12f, 4.8f)
        curveTo(14.8f, 4.8f, 17.2f, 6.4f, 18.4f, 8.8f)
        moveTo(18.4f, 5.2f)
        lineTo(18.4f, 9.2f)
        lineTo(14.4f, 9.2f)
    }
}

private fun heart(filled: Boolean) = PremiumIconBuilder.make(if (filled) "premium.Heart" else "premium.HeartBorder") {
    val body: androidx.compose.ui.graphics.vector.PathBuilder.() -> Unit = {
        moveTo(12f, 18.6f)
        curveTo(12f, 18.6f, 4.8f, 13.8f, 4.8f, 9.4f)
        curveTo(4.8f, 7f, 6.6f, 5.4f, 8.8f, 5.4f)
        curveTo(10.2f, 5.4f, 11.4f, 6.1f, 12f, 7.2f)
        curveTo(12.6f, 6.1f, 13.8f, 5.4f, 15.2f, 5.4f)
        curveTo(17.4f, 5.4f, 19.2f, 7f, 19.2f, 9.4f)
        curveTo(19.2f, 13.8f, 12f, 18.6f, 12f, 18.6f)
        close()
    }
    if (filled) fill(body) else stroke(block = body)
}

private fun sliders() = PremiumIconBuilder.make("premium.Tune") {
    stroke {
        moveTo(6.4f, 6.4f)
        lineTo(6.4f, 17.6f)
        moveTo(12f, 6.4f)
        lineTo(12f, 17.6f)
        moveTo(17.6f, 6.4f)
        lineTo(17.6f, 17.6f)
        moveTo(4.8f, 9.6f)
        lineTo(8f, 9.6f)
        moveTo(10.4f, 14.4f)
        lineTo(13.6f, 14.4f)
        moveTo(16f, 8.8f)
        lineTo(19.2f, 8.8f)
    }
}

private fun megaphone() = PremiumIconBuilder.make("premium.Ads") {
    stroke {
        moveTo(5.4f, 10.6f)
        lineTo(12.8f, 7.2f)
        lineTo(12.8f, 16.8f)
        lineTo(5.4f, 13.4f)
        close()
        moveTo(12.8f, 9.4f)
        lineTo(18.6f, 7.6f)
        lineTo(18.6f, 16.4f)
        lineTo(12.8f, 14.6f)
        moveTo(7.6f, 13.6f)
        lineTo(7.6f, 17.2f)
        curveTo(7.6f, 18.2f, 8.4f, 18.8f, 9.4f, 18.4f)
        lineTo(11.2f, 17.6f)
    }
}

private fun clipboardCheck() = PremiumIconBuilder.make("premium.FactCheck") {
    stroke {
        roundedRect(6.4f, 5.8f, 17.6f, 19.4f, 1.8f)
        roundedRect(9.2f, 4.4f, 14.8f, 7.2f, 1.2f)
        moveTo(9.2f, 11.8f)
        lineTo(11.2f, 13.8f)
        lineTo(15.2f, 9.6f)
    }
}

private fun columns() = PremiumIconBuilder.make("premium.AccountBalance") {
    stroke {
        moveTo(4.6f, 9.2f)
        lineTo(12f, 4.8f)
        lineTo(19.4f, 9.2f)
        close()
        moveTo(6.6f, 9.2f)
        lineTo(6.6f, 16.8f)
        moveTo(12f, 9.2f)
        lineTo(12f, 16.8f)
        moveTo(17.4f, 9.2f)
        lineTo(17.4f, 16.8f)
        moveTo(4.8f, 16.8f)
        lineTo(19.2f, 16.8f)
        moveTo(4.2f, 18.8f)
        lineTo(19.8f, 18.8f)
    }
}

private fun scales() = PremiumIconBuilder.make("premium.LegalBalance") {
    stroke {
        moveTo(12f, 5.2f)
        lineTo(12f, 18.6f)
        moveTo(8.2f, 18.6f)
        lineTo(15.8f, 18.6f)
        moveTo(12f, 6.6f)
        lineTo(5.6f, 6.6f)
        lineTo(4.4f, 12.4f)
        curveTo(4.4f, 14f, 5.6f, 14.8f, 7f, 14.8f)
        curveTo(8.4f, 14.8f, 9.6f, 14f, 9.6f, 12.4f)
        lineTo(5.6f, 6.6f)
        moveTo(12f, 6.6f)
        lineTo(18.4f, 6.6f)
        lineTo(19.6f, 12.4f)
        curveTo(19.6f, 14f, 18.4f, 14.8f, 17f, 14.8f)
        curveTo(15.6f, 14.8f, 14.4f, 14f, 14.4f, 12.4f)
        lineTo(18.4f, 6.6f)
    }
}

private fun phone() = PremiumIconBuilder.make("premium.Phone") {
    stroke {
        roundedRect(8f, 4.4f, 16f, 19.6f, 2.2f)
        moveTo(10.4f, 17.4f)
        lineTo(13.6f, 17.4f)
    }
}

private fun save() = PremiumIconBuilder.make("premium.Save") {
    stroke {
        moveTo(6.4f, 5.2f)
        lineTo(15.6f, 5.2f)
        lineTo(18.8f, 8.4f)
        lineTo(18.8f, 18.6f)
        lineTo(6.4f, 18.6f)
        close()
        roundedRect(8.4f, 5.2f, 14.8f, 9.6f, 0.8f)
        roundedRect(8.4f, 12.4f, 15.6f, 18.6f, 1.2f)
    }
}

private fun cart() = PremiumIconBuilder.make("premium.ShoppingCart") {
    stroke {
        moveTo(4.6f, 6.2f)
        lineTo(6.4f, 6.2f)
        lineTo(8.2f, 15.6f)
        lineTo(18.2f, 15.6f)
        lineTo(19.6f, 8.4f)
        lineTo(7.2f, 8.4f)
        moveTo(9.2f, 18.4f)
        circle(9.2f, 18.4f, 1.1f)
        moveTo(16.8f, 18.4f)
        circle(16.8f, 18.4f, 1.1f)
    }
}

private fun wifi() = PremiumIconBuilder.make("premium.Wifi") {
    stroke {
        moveTo(5.2f, 10.2f)
        curveTo(7.4f, 8f, 9.6f, 7f, 12f, 7f)
        curveTo(14.4f, 7f, 16.6f, 8f, 18.8f, 10.2f)
        moveTo(7.6f, 12.8f)
        curveTo(9f, 11.4f, 10.4f, 10.8f, 12f, 10.8f)
        curveTo(13.6f, 10.8f, 15f, 11.4f, 16.4f, 12.8f)
        moveTo(10.2f, 15.2f)
        curveTo(10.8f, 14.6f, 11.4f, 14.4f, 12f, 14.4f)
        curveTo(12.6f, 14.4f, 13.2f, 14.6f, 13.8f, 15.2f)
        moveTo(12f, 18.2f)
        circle(12f, 18.2f, 0.6f)
    }
}
