package com.nextpari.app.core.ui.icons

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AdsClick
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Balance
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.Casino
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ConfirmationNumber
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.CurrencyBitcoin
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Diamond
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.Gamepad
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.HeadsetMic
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Paid
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.Percent
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.outlined.SportsEsports
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material.icons.outlined.VerifiedUser
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.VpnKey
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material.icons.outlined.WifiTethering
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Exact previous Material mappings. Do not delete — Premium default can
 * roll back here with one [NextpariIconConfig.defaultVariant] change.
 */
object NextpariLegacyIcons : NextpariIconPack {
    override fun vector(key: NextpariIconKey): ImageVector = when (key) {
        NextpariIconKey.Home -> Icons.Outlined.Home
        NextpariIconKey.Popular, NextpariIconKey.Top, NextpariIconKey.Fire, NextpariIconKey.Live ->
            Icons.Outlined.LocalFireDepartment
        NextpariIconKey.Favorites, NextpariIconKey.FavoriteStarBorder -> Icons.Outlined.StarBorder
        NextpariIconKey.FavoriteStar -> Icons.Outlined.Star
        NextpariIconKey.Betslip, NextpariIconKey.Ticket -> Icons.Outlined.ConfirmationNumber
        NextpariIconKey.History -> Icons.Outlined.History
        NextpariIconKey.Menu, NextpariIconKey.Grid -> Icons.Outlined.GridView
        NextpariIconKey.Sport, NextpariIconKey.Trophy -> Icons.Outlined.EmojiEvents
        NextpariIconKey.Esports -> Icons.Outlined.SportsEsports
        NextpariIconKey.Casino -> Icons.Outlined.Casino
        NextpariIconKey.Games -> Icons.Outlined.Gamepad
        NextpariIconKey.Add -> Icons.Outlined.Add
        NextpariIconKey.Deposit, NextpariIconKey.Download -> Icons.Outlined.FileDownload
        NextpariIconKey.Wallet -> Icons.Outlined.AccountBalanceWallet
        NextpariIconKey.Withdraw, NextpariIconKey.Upload -> Icons.Outlined.FileUpload
        NextpariIconKey.Currencies -> Icons.Outlined.AccountBalanceWallet
        NextpariIconKey.Search -> Icons.Outlined.Search
        NextpariIconKey.Settings -> Icons.Outlined.Settings
        NextpariIconKey.ThemeLight -> Icons.Outlined.LightMode
        NextpariIconKey.ThemeDark -> Icons.Outlined.DarkMode
        NextpariIconKey.Profile, NextpariIconKey.Person -> Icons.Outlined.Person
        NextpariIconKey.Mail, NextpariIconKey.Email -> Icons.Outlined.MailOutline
        NextpariIconKey.Notifications -> Icons.Outlined.Notifications
        NextpariIconKey.Back -> Icons.AutoMirrored.Outlined.ArrowBack
        NextpariIconKey.Forward, NextpariIconKey.ChevronRight -> Icons.Outlined.ChevronRight
        NextpariIconKey.ChevronDown -> Icons.Outlined.KeyboardArrowDown
        NextpariIconKey.ChevronLeft -> Icons.AutoMirrored.Outlined.KeyboardArrowLeft
        NextpariIconKey.Close -> Icons.Outlined.Close
        NextpariIconKey.Share -> Icons.Outlined.Share
        NextpariIconKey.Info -> Icons.Outlined.Info
        NextpariIconKey.Support, NextpariIconKey.Headset -> Icons.Outlined.HeadsetMic
        NextpariIconKey.Promo, NextpariIconKey.Bonus -> Icons.Outlined.AutoAwesome
        NextpariIconKey.Gift -> Icons.Outlined.CardGiftcard
        NextpariIconKey.Cashback -> Icons.Outlined.Paid
        NextpariIconKey.Vip -> Icons.Outlined.WorkspacePremium
        NextpariIconKey.Security, NextpariIconKey.Shield -> Icons.Outlined.Shield
        NextpariIconKey.Authenticator -> Icons.Outlined.VerifiedUser
        NextpariIconKey.Key -> Icons.Outlined.VpnKey
        NextpariIconKey.Filter, NextpariIconKey.Tune -> Icons.Outlined.Tune
        NextpariIconKey.Copy -> Icons.Outlined.ContentCopy
        NextpariIconKey.Eye -> Icons.Outlined.Visibility
        NextpariIconKey.EyeOff -> Icons.Outlined.VisibilityOff
        NextpariIconKey.Lock -> Icons.Outlined.Lock
        NextpariIconKey.Logout -> Icons.AutoMirrored.Outlined.Logout
        NextpariIconKey.Pin -> Icons.Outlined.PushPin
        NextpariIconKey.PinFilled -> Icons.Filled.PushPin
        NextpariIconKey.Tv -> Icons.Outlined.Tv
        NextpariIconKey.Globe, NextpariIconKey.Language -> Icons.Outlined.Language
        NextpariIconKey.Bolt -> Icons.Outlined.Bolt
        NextpariIconKey.More -> Icons.Outlined.MoreVert
        NextpariIconKey.Place -> Icons.Outlined.Place
        NextpariIconKey.Payments -> Icons.Outlined.Payments
        NextpariIconKey.Bitcoin -> Icons.Outlined.CurrencyBitcoin
        NextpariIconKey.Schedule -> Icons.Outlined.Schedule
        NextpariIconKey.Check -> Icons.Outlined.CheckCircle
        NextpariIconKey.Cancel -> Icons.Outlined.Cancel
        NextpariIconKey.Warning -> Icons.Outlined.WarningAmber
        NextpariIconKey.Book -> Icons.AutoMirrored.Outlined.MenuBook
        NextpariIconKey.CreditCard -> Icons.Outlined.CreditCard
        NextpariIconKey.Percent -> Icons.Outlined.Percent
        NextpariIconKey.Verified -> Icons.Outlined.VerifiedUser
        NextpariIconKey.Diamond -> Icons.Outlined.Diamond
        NextpariIconKey.Refresh -> Icons.Outlined.Refresh
        NextpariIconKey.Heart -> Icons.Outlined.Favorite
        NextpariIconKey.HeartBorder -> Icons.Outlined.FavoriteBorder
        NextpariIconKey.Ads -> Icons.Outlined.AdsClick
        NextpariIconKey.FactCheck -> Icons.AutoMirrored.Outlined.FactCheck
        NextpariIconKey.AccountBalance -> Icons.Outlined.AccountBalance
        NextpariIconKey.LegalBalance -> Icons.Outlined.Balance
        NextpariIconKey.Phone -> Icons.Outlined.Phone
        NextpariIconKey.Save -> Icons.Outlined.Save
        NextpariIconKey.ShoppingCart -> Icons.Outlined.ShoppingCart
        NextpariIconKey.Wifi -> Icons.Outlined.WifiTethering
    }

    val filledArrowBack: ImageVector = Icons.AutoMirrored.Filled.ArrowBack
    val liveTv: ImageVector = Icons.Outlined.LiveTv
}
