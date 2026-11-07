package com.rixobet.app.domain

enum class FixtureMode {
    /** Labeled sample layout for debug screenshots. Never a wallet or a live line. */
    Demo,

    /** Release and disconnected runtime. No cash figures and no odds. */
    Unavailable,
}

data class DemoEvent(
    val league: String,
    val home: String,
    val away: String,
    val homeMark: String,
    val awayMark: String,
    val odds: List<Pair<String, String>>,
)

data class LiveDemo(
    val minute: String,
    val home: String,
    val away: String,
    val homeScore: String,
    val awayScore: String,
    val odds: List<Pair<String, String>>,
)

data class CatalogGame(
    val title: String,
    val group: String,
    val accent: Long,
)

object Fixtures {
    const val demoBanner = "Демонстрация. Это не баланс, не линия и не выигрыш."

    val balanceDemo = "12 500.00"
    val profileNameDemo = "Aziz_90"
    val profileIdDemo = "10045887"
    val sampleEmail = "yourmail@gmail.com"
    val sampleCode = "472911"

    val popularEvent = DemoEvent(
        league = "Лига чемпионов",
        home = "Real Madrid",
        away = "Barcelona",
        homeMark = "RM",
        awayMark = "B",
        odds = listOf("1" to "1.87", "X" to "3.75", "2" to "4.20"),
    )

    val liveEvents = listOf(
        LiveDemo("46'", "Манчестер Сити", "Арсенал", "2", "1", listOf("1" to "1.42", "X" to "4.10", "2" to "7.50")),
        LiveDemo("78'", "ПСЖ", "Лион", "3", "0", listOf("1" to "1.03", "X" to "12.00", "2" to "36.00")),
    )

    val casinoGames = listOf(
        CatalogGame("Сердце", "slots", 0xFFFF4FA3),
        CatalogGame("Олимп", "slots", 0xFFC8962E),
        CatalogGame("Нил", "new", 0xFFE2B15A),
        CatalogGame("Улов", "new", 0xFF1EC98A),
        CatalogGame("Корона", "live", 0xFF6A00FF),
        CatalogGame("Неон", "slots", 0xFFD100FF),
    )

    val miniGames = listOf(
        "21 / Очко",
        "Яблоко",
        "Полёт",
        "Кристалл",
        "Кости",
        "Сокровища",
    )

    fun showsNumbers(mode: FixtureMode): Boolean = mode == FixtureMode.Demo
}

object Catalog {
    val bottomNav = listOf("Главная", "Спорт", "Казино", "Акции", "Профиль")

    val leagues = listOf(
        "Топ лиги" to "top",
        "Лига чемпионов" to "football",
        "Лига Европы" to "football",
        "АПЛ" to "football",
        "Ла Лига" to "football",
        "Серия А" to "football",
    )

    val sportFilters = listOf("Все", "Футбол", "Теннис", "Баскетбол")

    val promotions = listOf(
        "Бонус на первый депозит" to "до 100%",
        "Кэшбэк" to "до 15%",
        "Фрибеты" to "на спорт",
        "Турниры" to "и розыгрыши",
    )

    val vipPerks = listOf(
        "Повышенный кэшбэк 5%",
        "Быстрые выплаты",
        "Личный менеджер",
    )

    val vipLevels = listOf("Bronze", "Silver", "Gold", "Platinum")
}
