package com.nextpari.app.feature.home

data class HomeSport(val id: String, val name: String)

data class HomePromo(val title: String, val route: String)

data class EsportsDiscipline(val id: String, val name: String)

data class HubGame(val id: String, val name: String, val route: String)

interface HomeCatalogRepository {
    fun sports(): List<HomeSport>
    fun promos(): List<HomePromo>
    fun liveTitles(): List<String>
    fun lineTitles(): List<String>
    fun championships(): List<String>
    fun esportsDisciplines(): List<EsportsDiscipline>
    fun hubGames(): List<HubGame>
}

/**
 * DEV presentation catalog copied from current web labels.
 * Empty match lists on purpose: no real odds and no production feed.
 */
class FakeHomeCatalogRepository : HomeCatalogRepository {
    override fun sports(): List<HomeSport> = listOf(
        HomeSport("all", "Все"),
        HomeSport("football", "Футбол"),
        HomeSport("tennis", "Теннис"),
        HomeSport("basketball", "Баскетбол"),
        HomeSport("hockey", "Хоккей"),
        HomeSport("volleyball", "Волейбол"),
        HomeSport("esports", "КиберСпорт"),
        HomeSport("table-tennis", "Настольный теннис"),
        HomeSport("badminton", "Бадминтон"),
        HomeSport("baseball", "Бейсбол"),
        HomeSport("polo", "Поло"),
        HomeSport("cricket", "Крикет"),
        HomeSport("beach-volleyball", "Пляжный волейбол"),
        HomeSport("snooker", "Снукер"),
        HomeSport("futsal", "Футзал"),
        HomeSport("elections", "Выборы США"),
        HomeSport("pickleball", "Пиклбол"),
        HomeSport("fifa", "FIFA"),
        HomeSport("mk", "Mortal Kombat"),
        HomeSport("polybet", "Polybet"),
        HomeSport("ufc", "UFC"),
        HomeSport("filter", "Фильтр"),
    )

    override fun promos(): List<HomePromo> = listOf(
        HomePromo("Марафон Экспрессов", "promo-marathon"),
        HomePromo("100% Бонус на депозит", "promo-details"),
        HomePromo("Приветственный пакет", "promo-welcome"),
        HomePromo("Непобедимый", "promo-unbeatable"),
    )

    override fun liveTitles(): List<String> = emptyList()
    override fun lineTitles(): List<String> = emptyList()
    override fun championships(): List<String> = emptyList()

    override fun esportsDisciplines(): List<EsportsDiscipline> = listOf(
        EsportsDiscipline("d1", "CS 2"),
        EsportsDiscipline("d2", "Dota 2"),
        EsportsDiscipline("d3", "League of Legends"),
        EsportsDiscipline("d4", "Valorant"),
    )

    override fun hubGames(): List<HubGame> = listOf(
        HubGame("apples", "Apple of Fortune", "apples"),
        HubGame("aviator", "Aviator", "aviator"),
        HubGame("blackjack", "21 / Очко", "blackjack"),
        HubGame("crystal", "Crystal", "crystal"),
        HubGame("dice", "Dice", "dice"),
        HubGame("pharaoh", "Сокровища Фараона", "pharaoh"),
    )
}
