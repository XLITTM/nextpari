package com.nextpari.app.feature.promo

data class VipTier(
    val id: Int,
    val name: String,
    val cashbackLabel: String,
    val cashbackPeriod: String?,
    val from: Long,
    val mid: Long,
    val to: Long,
    val glow: Long,
)

object VipCatalog {
    val tigerRes = com.nextpari.app.R.drawable.vip_tiger_hero_reference
    val coinRes = com.nextpari.app.R.drawable.vip_cashback_coin_reference
    val subtitle = "Привилегии, кешбэк и особые награды"
    val cashbackLead = "Часть проигранных средств может возвращаться игроку в рамках VIP-программы."
    val previewNotice =
        "VIP-программа пока находится в режиме предварительного просмотра. Проценты и график начисления описывают планируемую программу и пока не зачисляются автоматически. Уровни, кешбэк и награды начнут работать только после официального запуска."
    val levelsNotice = "Условия и награды будут доступны после запуска VIP-программы."
    val privileges = listOf(
        "Персональные предложения" to "Эксклюзивные бонусы и акции",
        "Повышенные VIP-привилегии" to "Больше возможностей и приоритет",
        "Дополнительные награды" to "Особые возможности программы",
    )
    val levels: List<VipTier> = listOf(
        VipTier(1, "Медный", "5%", "Раз в 7 дней", 0xFF3A1E15, 0xFF9A4F2C, 0xFFD08554, 0xFFD08554),
        VipTier(2, "Бронзовый", "6%", "Раз в 6 дней", 0xFF352313, 0xFF8C5A29, 0xFFC18A48, 0xFFC18A48),
        VipTier(3, "Серебряный", "7%", "Раз в 5 дней", 0xFF242A31, 0xFF737F8C, 0xFFD9E0E6, 0xFFD9E0E6),
        VipTier(4, "Золотой", "8%", "Раз в 4 дня", 0xFF17130B, 0xFFA77A1B, 0xFFF3D36F, 0xFFF3D36F),
        VipTier(5, "Рубиновый", "9%", "Раз в 3 дня", 0xFF22090C, 0xFF761927, 0xFFE23852, 0xFFE23852),
        VipTier(6, "Сапфировый", "10%", "Раз в 2 дня", 0xFF071426, 0xFF123A72, 0xFF398CFF, 0xFF398CFF),
        VipTier(7, "Бриллиантовый", "11%", "Ежедневно", 0xFF121A1E, 0xFF9AB8C4, 0xFFE9FAFF, 0xFFE9FAFF),
        VipTier(8, "Статус VIP", "0.05–0.25%", null, 0xFF06110D, 0xFF126844, 0xFFD5AE54, 0xFFD5AE54),
    )
}
