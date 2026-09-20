package com.nextpari.app.feature.promo

import com.nextpari.app.R
import com.nextpari.app.core.navigation.Destinations
import com.nextpari.app.feature.home.HomePromoCatalog

data class PromoMenuItem(
    val label: String,
    val desc: String,
    val iconBg: Long,
    val route: String? = null,
    val soon: Boolean = route == null,
)

data class PromoArticle(
    val route: String,
    val headline: String,
    val lead: String,
    val warning: String,
    val heroRes: Int,
    val sections: List<PromoSection>,
)

data class PromoSection(
    val title: String,
    val ordered: Boolean = false,
    val bullets: List<String>,
    val prizeRows: List<Pair<String, String>> = emptyList(),
)

object PromoCatalog {
    val menuItems: List<PromoMenuItem> = listOf(
        PromoMenuItem("Бонусные игры", "Играйте и получайте призы", 0xFFF59E0B, soon = true),
        PromoMenuItem("Проверка промокода", "Промокоды появятся после подключения бонусной системы", 0xFF059669, soon = true),
        PromoMenuItem("Кешбэк", "Информация о будущей программе кешбэка", 0xFFF59E0B, route = Destinations.VIP_CASHBACK),
        PromoMenuItem("VIP кешбэк", "Информация о VIP-программе", 0xFF059669, route = Destinations.VIP_CASHBACK),
        PromoMenuItem("Участие в акциях", "Турниры и конкурсы прогнозов", 0xFFF59E0B, soon = true),
        PromoMenuItem("Бонусы", "Подарки и поощрения для игроков", 0xFF059669, soon = true),
    )

    val heroSummary = "Акции и бонусы появятся после подключения бонусной системы"
    val carousel = HomePromoCatalog.items
    val nativeRoutes = listOf(
        Destinations.PROMO,
        Destinations.VIP_CASHBACK,
        Destinations.PROMO_DETAILS,
        Destinations.PROMO_MARATHON,
        Destinations.PROMO_WELCOME,
        Destinations.PROMO_UNBEATABLE,
    )

    val details = PromoArticle(
        route = Destinations.PROMO_DETAILS,
        headline = "100%-й бонус на первый депозит",
        lead = "Зарегистрируйся на платформе Nextpari и получи 100%-й бонус за первое пополнение!",
        warning = "Предварительные условия будущей акции. Участие и начисление бонусов пока недоступны.",
        heroRes = R.drawable.promo_tiger,
        sections = listOf(
            PromoSection(
                "Как получить бонус?",
                ordered = true,
                bullets = listOf(
                    "Зарегистрируйтесь на сайте Nextpari.",
                    "Заполните все поля с персональными данными в личном кабинете.",
                    "Пополните свой баланс.",
                    "Бонус автоматически начисляется после пополнения.",
                ),
            ),
            PromoSection(
                "Правила и условия",
                bullets = listOf(
                    "Пользователь имеет право получить только 1 бонус.",
                    "Перед пополнением счета необходимо дать согласие на получение бонуса в настройках.",
                    "Проставьте сумму бонуса в 5-ти кратном размере ставками типа экспресс. В каждом экспрессе должно быть не менее 3-х событий с коэффициентом не ниже 1.40.",
                    "До выполнения условий акции вывод денежных средств невозможен.",
                    "Бонус полностью адаптирован и доступен для депозитов в криптовалюте.",
                    "Nextpari оставляет за собой право отменить акцию или заморозить счет при подозрении на мошенничество (мультиаккаунтинг).",
                ),
            ),
        ),
    )

    val marathon = PromoArticle(
        route = Destinations.PROMO_MARATHON,
        headline = "Марафон экспрессов",
        lead = "Готовы проверить свою удачу? Делайте ставки типа «Экспресс» каждый день и получайте фрибеты до $75!",
        warning = "Предварительные условия будущей акции. Участие и начисление фрибетов пока недоступны.",
        heroRes = R.drawable.promo_marathon,
        sections = listOf(
            PromoSection(
                "Как получить бонус",
                ordered = true,
                bullets = listOf(
                    "Зарегистрируйтесь на сайте Nextpari и дайте согласие на участие в акциях.",
                    "В течение 30 дней подряд делайте экспресс-ставки. В каждом экспрессе должно быть минимум 4 события с коэффициентом от 1.5.",
                    "Сумма ставки — не менее $1. Ставку необходимо делать за собственные средства.",
                ),
            ),
            PromoSection(
                "Механика начисления фрибетов",
                bullets = listOf(
                    "На 6-й день: фрибет 25% от средней суммы ставок (до $5).",
                    "На 11-й день: фрибет 75% от средней суммы ставок (до $10).",
                    "На 16-й день: фрибет 150% от средней суммы ставок (до $25).",
                    "На 31-й день: фрибет 300% от средней суммы ставок за 30 дней (до $75).",
                ),
            ),
            PromoSection(
                "Важные условия акции",
                bullets = listOf(
                    "Если в один из дней вы не делаете ставку или она не соответствует правилам, ваш прогресс обнуляется, и отсчет 30 дней начинается заново.",
                    "В акции не участвуют ставки на форы и тоталы, возвраты, отмененные ставки и ставки с бонусного счета.",
                    "Условия отыгрыша фрибета: проставьте полученную сумму ставкой типа экспресс (от 4 событий, кэф от 1.5) в течение 72 часов.",
                ),
            ),
        ),
    )

    val welcome = PromoArticle(
        route = Destinations.PROMO_WELCOME,
        headline = "Приветственный пакет до 1500 € + 150 FS",
        lead = "Вноси депозиты и получай бонусы!",
        warning = "Предварительные условия будущей акции. Участие и начисление бонусов пока недоступны.",
        heroRes = R.drawable.promo_welcome,
        sections = listOf(
            PromoSection(
                "Как получить бонус?",
                ordered = true,
                bullets = listOf(
                    "Создайте аккаунт, введите все анкетные данные и активируйте номер телефона.",
                    "Внесите депозит (минимум 10 EUR для первого, 15 EUR для 2-4 депозитов).",
                    "Бонус будет начислен автоматически.",
                ),
            ),
            PromoSection(
                "Бонусы и фриспины",
                bullets = listOf(
                    "На 1-й депозит: 100% (до 300 EUR) и 30 FS в игре Reliquary of Ra.",
                    "На 2-й депозит: 50% (до 350 EUR) и 35 FS в игре Admiral.",
                    "На 3-й депозит: 25% (до 400 EUR) и 40 FS в игре Juicy Fruits 27 Ways.",
                    "На 4-й депозит: 25% (до 450 EUR) и 45 FS в игре Rich of the Mermaid Hold and Spin.",
                ),
            ),
            PromoSection(
                "Правила и условия",
                bullets = listOf(
                    "Перед пополнением счета необходимо проставить согласие на получение бонуса на казино в Личном кабинете.",
                    "Если вы переключаетесь между типами бонусов, отказываетесь от них или получаете бонус противоположного типа, вы теряете право на участие в бонусных предложениях на последующие депозиты.",
                    "Фриспины доступны только после полного отыгрыша денежного бонуса на депозит.",
                    "Все бонусы на депозит подлежат отыгрышу х35 размера бонуса в течение 7 дней после активации. При отыгрыше запрещено превышать ставку 5 EUR.",
                    "При активном бонусе ставки из раздела Nextpari Games, идущие в зачет отыгрыша, засчитываются в двойном размере (за исключением некоторых игр, список которых доступен на сайте).",
                    "Каждый новый бонус доступен после отыгрыша либо завершения предыдущего.",
                    "Вся сумма бонуса должна быть проставлена перед тем, как можно будет вывести все деньги с игрового счета.",
                ),
            ),
        ),
    )

    val unbeatable = PromoArticle(
        route = Destinations.PROMO_UNBEATABLE,
        headline = "Непобедимый",
        lead = "Делай экспресс-ставки — участвуй в розыгрыше $9,000!",
        warning = "Предварительные условия будущей акции. Участие и начисление призов пока недоступны.",
        heroRes = R.drawable.promo_unbeatable,
        sections = listOf(
            PromoSection(
                "Как участвовать",
                ordered = true,
                bullets = listOf(
                    "Делайте ставки типа «Экспресс» в период проведения акции.",
                    "За каждый купон «Экспресс» система автоматически генерирует уникальный 7-значный код.",
                    "Чем больше экспрессов — тем больше кодов и выше шансы на победу!",
                ),
            ),
            PromoSection(
                "Призовой фонд",
                bullets = emptyList(),
                prizeRows = listOf("1 место" to "$5,000", "2 место" to "$3,000", "3 место" to "$1,000"),
            ),
        ),
    )
}
