package com.nextpari.app.core.ui.icons

import androidx.compose.ui.graphics.vector.ImageVector
import com.nextpari.app.core.navigation.Destinations

enum class NextpariIconKey {
    Home,
    Popular,
    Favorites,
    Betslip,
    History,
    Menu,
    Top,
    Sport,
    Esports,
    Casino,
    Games,
    Add,
    Deposit,
    Wallet,
    Withdraw,
    Currencies,
    Search,
    Settings,
    ThemeLight,
    ThemeDark,
    Profile,
    Mail,
    Notifications,
    FavoriteStar,
    FavoriteStarBorder,
    Back,
    Forward,
    ChevronRight,
    ChevronDown,
    ChevronLeft,
    Close,
    Share,
    Info,
    Support,
    Promo,
    Gift,
    Bonus,
    Cashback,
    Vip,
    Security,
    Authenticator,
    Key,
    Email,
    Live,
    Trophy,
    Filter,
    Copy,
    Eye,
    EyeOff,
    Lock,
    Logout,
    Pin,
    PinFilled,
    Tv,
    Globe,
    Bolt,
    More,
    Place,
    Payments,
    Bitcoin,
    Schedule,
    Check,
    Cancel,
    Warning,
    Headset,
    Book,
    CreditCard,
    Percent,
    Language,
    Verified,
    Download,
    Upload,
    Person,
    Fire,
    Ticket,
    Grid,
    Diamond,
    Shield,
    Refresh,
    Heart,
    HeartBorder,
    Tune,
    Ads,
    FactCheck,
    AccountBalance,
    LegalBalance,
    Phone,
    Save,
    ShoppingCart,
    Wifi,
}

interface NextpariIconPack {
    fun vector(key: NextpariIconKey): ImageVector
}

object NextpariIcons {
    fun pack(variant: NextpariIconVariant = NextpariIconConfig.defaultVariant): NextpariIconPack =
        when (variant) {
            NextpariIconVariant.Legacy -> NextpariLegacyIcons
            NextpariIconVariant.Premium -> NextpariPremiumIcons
        }

    fun vector(
        key: NextpariIconKey,
        variant: NextpariIconVariant = NextpariIconConfig.defaultVariant,
    ): ImageVector = pack(variant).vector(key)

    val Home get() = vector(NextpariIconKey.Home)
    val Popular get() = vector(NextpariIconKey.Popular)
    val Favorites get() = vector(NextpariIconKey.Favorites)
    val Betslip get() = vector(NextpariIconKey.Betslip)
    val History get() = vector(NextpariIconKey.History)
    val Menu get() = vector(NextpariIconKey.Menu)
    val Top get() = vector(NextpariIconKey.Top)
    val Sport get() = vector(NextpariIconKey.Sport)
    val Esports get() = vector(NextpariIconKey.Esports)
    val Casino get() = vector(NextpariIconKey.Casino)
    val Games get() = vector(NextpariIconKey.Games)
    val Add get() = vector(NextpariIconKey.Add)
    val Deposit get() = vector(NextpariIconKey.Deposit)
    val Wallet get() = vector(NextpariIconKey.Wallet)
    val Withdraw get() = vector(NextpariIconKey.Withdraw)
    val Currencies get() = vector(NextpariIconKey.Currencies)
    val Search get() = vector(NextpariIconKey.Search)
    val Settings get() = vector(NextpariIconKey.Settings)
    val ThemeLight get() = vector(NextpariIconKey.ThemeLight)
    val ThemeDark get() = vector(NextpariIconKey.ThemeDark)
    val Profile get() = vector(NextpariIconKey.Profile)
    val Mail get() = vector(NextpariIconKey.Mail)
    val Notifications get() = vector(NextpariIconKey.Notifications)
    val FavoriteStar get() = vector(NextpariIconKey.FavoriteStar)
    val FavoriteStarBorder get() = vector(NextpariIconKey.FavoriteStarBorder)
    val Back get() = vector(NextpariIconKey.Back)
    val Forward get() = vector(NextpariIconKey.Forward)
    val ChevronRight get() = vector(NextpariIconKey.ChevronRight)
    val ChevronDown get() = vector(NextpariIconKey.ChevronDown)
    val ChevronLeft get() = vector(NextpariIconKey.ChevronLeft)
    val Close get() = vector(NextpariIconKey.Close)
    val Share get() = vector(NextpariIconKey.Share)
    val Info get() = vector(NextpariIconKey.Info)
    val Support get() = vector(NextpariIconKey.Support)
    val Promo get() = vector(NextpariIconKey.Promo)
    val Gift get() = vector(NextpariIconKey.Gift)
    val Bonus get() = vector(NextpariIconKey.Bonus)
    val Cashback get() = vector(NextpariIconKey.Cashback)
    val Vip get() = vector(NextpariIconKey.Vip)
    val Security get() = vector(NextpariIconKey.Security)
    val Authenticator get() = vector(NextpariIconKey.Authenticator)
    val Key get() = vector(NextpariIconKey.Key)
    val Email get() = vector(NextpariIconKey.Email)
    val Live get() = vector(NextpariIconKey.Live)
    val Trophy get() = vector(NextpariIconKey.Trophy)
    val Filter get() = vector(NextpariIconKey.Filter)
    val Copy get() = vector(NextpariIconKey.Copy)
    val Eye get() = vector(NextpariIconKey.Eye)
    val EyeOff get() = vector(NextpariIconKey.EyeOff)
    val Lock get() = vector(NextpariIconKey.Lock)
    val Logout get() = vector(NextpariIconKey.Logout)
    val Pin get() = vector(NextpariIconKey.Pin)
    val PinFilled get() = vector(NextpariIconKey.PinFilled)
    val Tv get() = vector(NextpariIconKey.Tv)
    val Globe get() = vector(NextpariIconKey.Globe)
    val Bolt get() = vector(NextpariIconKey.Bolt)
    val More get() = vector(NextpariIconKey.More)
    val Place get() = vector(NextpariIconKey.Place)
    val Payments get() = vector(NextpariIconKey.Payments)
    val Bitcoin get() = vector(NextpariIconKey.Bitcoin)
    val Schedule get() = vector(NextpariIconKey.Schedule)
    val Check get() = vector(NextpariIconKey.Check)
    val Cancel get() = vector(NextpariIconKey.Cancel)
    val Warning get() = vector(NextpariIconKey.Warning)
    val Headset get() = vector(NextpariIconKey.Headset)
    val Book get() = vector(NextpariIconKey.Book)
    val CreditCard get() = vector(NextpariIconKey.CreditCard)
    val Percent get() = vector(NextpariIconKey.Percent)
    val Language get() = vector(NextpariIconKey.Language)
    val Verified get() = vector(NextpariIconKey.Verified)
    val Download get() = vector(NextpariIconKey.Download)
    val Upload get() = vector(NextpariIconKey.Upload)
    val Person get() = vector(NextpariIconKey.Person)
    val Fire get() = vector(NextpariIconKey.Fire)
    val Ticket get() = vector(NextpariIconKey.Ticket)
    val Grid get() = vector(NextpariIconKey.Grid)
    val Diamond get() = vector(NextpariIconKey.Diamond)
    val Shield get() = vector(NextpariIconKey.Shield)
    val Refresh get() = vector(NextpariIconKey.Refresh)
    val Heart get() = vector(NextpariIconKey.Heart)
    val HeartBorder get() = vector(NextpariIconKey.HeartBorder)
    val Tune get() = vector(NextpariIconKey.Tune)
    val Ads get() = vector(NextpariIconKey.Ads)
    val FactCheck get() = vector(NextpariIconKey.FactCheck)
    val AccountBalance get() = vector(NextpariIconKey.AccountBalance)
    val LegalBalance get() = vector(NextpariIconKey.LegalBalance)
    val Phone get() = vector(NextpariIconKey.Phone)
    val Save get() = vector(NextpariIconKey.Save)
    val ShoppingCart get() = vector(NextpariIconKey.ShoppingCart)
    val Wifi get() = vector(NextpariIconKey.Wifi)

    fun bottomNav(route: String): ImageVector = when (route) {
        Destinations.HOME -> Popular
        Destinations.FAVORITES -> Favorites
        Destinations.HISTORY -> History
        Destinations.BETSLIP -> Betslip
        else -> Menu
    }

    fun mainTab(id: String): ImageVector = when (id) {
        "top" -> Top
        "sport" -> Sport
        "esports" -> Esports
        "casino" -> Casino
        else -> Games
    }

    fun menuTab(label: String): ImageVector = when (label) {
        "Топ" -> Top
        "Спорт" -> Sport
        "Казино" -> Casino
        "Games" -> Games
        else -> Promo
    }

    fun menuRow(label: String): ImageVector = when (label) {
        "LIVE", "Aviator" -> Live
        "Линия", "Непобедимый", "Турниры", "Экспресс дня", "Результаты", "Ставь на своих" -> Trophy
        "Киберспорт" -> Esports
        "Games" -> Games
        "Слоты", "Лайв казино", "My casino", "Категории", "Провайдеры" -> Casino
        "Промокоды", "Промо", "Promo", "Акции" -> Promo
        "Поддержка" -> Support
        "Инфо" -> Info
        "Управление счетом" -> Wallet
        "Аутентификатор", "Повысьте безопасность!" -> Authenticator
        "ТОТО" -> Trophy
        "Финставки" -> Currencies
        "Бетконструктор" -> Betslip
        "Сканер купонов" -> Search
        "Уведомления" -> Notifications
        "Стрим" -> Tv
        "Спортбук провайдера" -> Sport
        else -> Settings
    }
}
