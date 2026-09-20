package com.nextpari.app.feature.menu

data class MenuItem(
    val label: String,
    val desc: String,
    val route: String? = null,
    val availability: String = if (route == null) "soon" else "available",
    val special: String? = null,
) {
    val soon: Boolean get() = availability == "soon" || route == null
}

object MenuCatalog {
    val subTabs = listOf("Топ", "Спорт", "Казино", "Games", "Разное")

    val top = listOf(
        MenuItem("LIVE", "Ставь на события в прямом эфире", DestinationsSports.LIVE),
        MenuItem("Линия", "Ставь на предстоящие события", DestinationsSports.LINE),
        MenuItem("Киберспорт", "CS2, Dota 2, LoL и другие", DestinationsSports.CYBERS),
        MenuItem("Слоты", "Игры появятся после подключения провайдера", "slots"),
        MenuItem("Лайв казино", "Столы появятся после подключения провайдера", "live-casino"),
        MenuItem("Games", "Мини-игры и аркады", "games"),
        MenuItem("Промокоды", "Акции и бонусная программа", "promo", special = "teal"),
        MenuItem("Непобедимый", "Экспрессы — розыгрыш $9,000", "promo-unbeatable"),
        MenuItem("Поддержка", "Помощь, правила и контакты", "info"),
        MenuItem("Аутентификатор", "Защити свой аккаунт"),
    )

    val sport = listOf(
        MenuItem("LIVE", "Ставь на события в прямом эфире", DestinationsSports.LIVE),
        MenuItem("Линия", "Ставь на предстоящие события", DestinationsSports.LINE),
        MenuItem("Экспресс дня", "Ставки на выгодные экспрессы"),
        MenuItem("Стрим", "Игры с онлайн-трансляцией"),
        MenuItem("Киберспорт", "Лучшие киберспортивные события", DestinationsSports.CYBERS),
        MenuItem("Спортбук провайдера", "Откроется во встроенном окне после подключения", "provider-sportsbook"),
        MenuItem("Результаты", "Итоги прошедших событий"),
        MenuItem("Ставь на своих", "События любимых стран"),
    )

    val casino = listOf(
        MenuItem("Лайв казино", "Столы появятся после подключения провайдера", "live-casino"),
        MenuItem("Слоты", "Игры появятся после подключения провайдера", "slots"),
        MenuItem("My casino", "Личные акции, турниры, избранное"),
        MenuItem("Категории", "Игры казино на любой вкус"),
        MenuItem("Турниры", "Все турниры казино"),
        MenuItem("Промо", "Подарки, бонусы и акции", "promo"),
        MenuItem("Провайдеры", "Лучшие провайдеры в одном месте"),
    )

    val games = listOf(
        MenuItem("Games", "Мини-игры и аркады", "games"),
        MenuItem("Aviator", "Crash-игра", "aviator"),
    )

    val misc = listOf(
        MenuItem("Повысьте безопасность!", "Получите надежную защиту вашего аккаунта!", special = "security"),
        MenuItem("Акции", "Все акции, бонусы и специальные предложения", "promo", special = "orange"),
        MenuItem("Управление счетом", "Пополнение, вывод, история", "wallet"),
        MenuItem("Promo", "Акции и бонусная программа", "promo"),
        MenuItem("Аутентификатор", "Двухфакторная аутентификация"),
        MenuItem("ТОТО", "Тотализатор и джекпоты"),
        MenuItem("Финставки", "Ставки на финансовые рынки"),
        MenuItem("Бетконструктор", "Создай свою ставку"),
        MenuItem("Сканер купонов", "Проверь билет по коду"),
        MenuItem("Уведомления", "Настройки оповещений"),
        MenuItem("Поддержка", "Помощь, правила и контакты", "info"),
        MenuItem("Инфо", "О компании, правила, помощь", "info"),
    )

    fun itemsFor(tab: String): List<MenuItem> = when (tab) {
        "Топ" -> top
        "Спорт" -> sport
        "Казино" -> casino
        "Games" -> games
        else -> misc
    }
}

private object DestinationsSports {
    const val LIVE = "sports/live"
    const val LINE = "sports/line"
    const val CYBERS = "sports/cybers"
}
