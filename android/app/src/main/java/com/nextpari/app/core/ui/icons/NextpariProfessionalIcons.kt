package com.nextpari.app.core.ui.icons

import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Active Premium pack: official Phosphor vectors from [ProfessionalPremiumIcons].
 * Unmapped semantic keys reuse the closest generated glyph — never Cursor-drawn geometry.
 */
internal object NextpariProfessionalIcons : NextpariIconPack {
    override fun vector(key: NextpariIconKey): ImageVector = when (key) {
        NextpariIconKey.Home -> ProfessionalPremiumIcons.BottomPopular
        NextpariIconKey.Popular, NextpariIconKey.Fire -> ProfessionalPremiumIcons.BottomPopular
        NextpariIconKey.Favorites,
        NextpariIconKey.FavoriteStar,
        NextpariIconKey.FavoriteStarBorder,
        NextpariIconKey.Heart,
        NextpariIconKey.HeartBorder,
        -> ProfessionalPremiumIcons.BottomFavorites
        NextpariIconKey.Betslip, NextpariIconKey.Ticket -> ProfessionalPremiumIcons.BottomBetslip
        NextpariIconKey.History, NextpariIconKey.Schedule, NextpariIconKey.Refresh ->
            ProfessionalPremiumIcons.BottomHistory
        NextpariIconKey.Menu, NextpariIconKey.Grid -> ProfessionalPremiumIcons.BottomMenu
        NextpariIconKey.Top -> ProfessionalPremiumIcons.TabTop
        NextpariIconKey.Sport -> ProfessionalPremiumIcons.TabSport
        NextpariIconKey.Esports -> ProfessionalPremiumIcons.TabEsports
        NextpariIconKey.Casino -> ProfessionalPremiumIcons.TabCasino
        NextpariIconKey.Games -> ProfessionalPremiumIcons.TabGames
        NextpariIconKey.Add -> ProfessionalPremiumIcons.Add
        NextpariIconKey.Deposit, NextpariIconKey.Download -> ProfessionalPremiumIcons.Download
        NextpariIconKey.Wallet,
        NextpariIconKey.CreditCard,
        NextpariIconKey.AccountBalance,
        NextpariIconKey.LegalBalance,
        NextpariIconKey.ShoppingCart,
        NextpariIconKey.Payments,
        -> ProfessionalPremiumIcons.Wallet
        NextpariIconKey.Withdraw, NextpariIconKey.Upload -> ProfessionalPremiumIcons.Upload
        NextpariIconKey.Currencies, NextpariIconKey.Cashback, NextpariIconKey.Bitcoin ->
            ProfessionalPremiumIcons.MenuCashback
        NextpariIconKey.Search -> ProfessionalPremiumIcons.Search
        NextpariIconKey.Settings, NextpariIconKey.More -> ProfessionalPremiumIcons.MenuSettings
        NextpariIconKey.ThemeLight -> ProfessionalPremiumIcons.ThemeLight
        NextpariIconKey.ThemeDark -> ProfessionalPremiumIcons.ThemeDark
        NextpariIconKey.Profile, NextpariIconKey.Person -> ProfessionalPremiumIcons.MenuProfile
        NextpariIconKey.Mail, NextpariIconKey.Email -> ProfessionalPremiumIcons.MenuMessages
        NextpariIconKey.Notifications -> ProfessionalPremiumIcons.Notifications
        NextpariIconKey.Back, NextpariIconKey.ChevronLeft -> ProfessionalPremiumIcons.Back
        NextpariIconKey.Forward, NextpariIconKey.ChevronRight -> ProfessionalPremiumIcons.ChevronDown
        NextpariIconKey.ChevronDown -> ProfessionalPremiumIcons.ChevronDown
        NextpariIconKey.Close, NextpariIconKey.Cancel -> ProfessionalPremiumIcons.Close
        NextpariIconKey.Share -> ProfessionalPremiumIcons.Share
        NextpariIconKey.Info,
        NextpariIconKey.Book,
        NextpariIconKey.Warning,
        NextpariIconKey.Globe,
        NextpariIconKey.Language,
        NextpariIconKey.Check,
        NextpariIconKey.FactCheck,
        -> ProfessionalPremiumIcons.Info
        NextpariIconKey.Support, NextpariIconKey.Headset, NextpariIconKey.Phone ->
            ProfessionalPremiumIcons.MenuSupport
        NextpariIconKey.Promo, NextpariIconKey.Gift, NextpariIconKey.Bonus, NextpariIconKey.Ads,
        NextpariIconKey.Percent,
        -> ProfessionalPremiumIcons.MenuPromo
        NextpariIconKey.Vip, NextpariIconKey.Diamond, NextpariIconKey.Verified ->
            ProfessionalPremiumIcons.MenuVip
        NextpariIconKey.Security, NextpariIconKey.Shield, NextpariIconKey.Lock ->
            ProfessionalPremiumIcons.Security
        NextpariIconKey.Authenticator, NextpariIconKey.Key -> ProfessionalPremiumIcons.Authenticator
        NextpariIconKey.Live, NextpariIconKey.Tv, NextpariIconKey.Wifi, NextpariIconKey.Bolt ->
            ProfessionalPremiumIcons.MenuLive
        NextpariIconKey.Trophy -> ProfessionalPremiumIcons.Trophy
        NextpariIconKey.Filter, NextpariIconKey.Tune -> ProfessionalPremiumIcons.SportFilter
        NextpariIconKey.Copy -> ProfessionalPremiumIcons.Copy
        NextpariIconKey.Eye -> ProfessionalPremiumIcons.Eye
        NextpariIconKey.EyeOff -> ProfessionalPremiumIcons.EyeOff
        NextpariIconKey.Logout -> ProfessionalPremiumIcons.Logout
        NextpariIconKey.Pin, NextpariIconKey.PinFilled, NextpariIconKey.Place, NextpariIconKey.Save ->
            ProfessionalPremiumIcons.Pin
    }
}
