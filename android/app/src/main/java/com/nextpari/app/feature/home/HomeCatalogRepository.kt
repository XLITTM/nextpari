package com.nextpari.app.feature.home

interface HomeCatalogRepository {
    fun sports(): List<HomeSport>
    fun promos(): List<HomePromo>
    fun liveTitles(): List<String>
    fun lineTitles(): List<String>
    fun championships(): List<String>
    fun esportsDisciplines(): List<EsportsDiscipline>
}

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

    override fun promos(): List<HomePromo> = HomePromoCatalog.items
    override fun liveTitles(): List<String> = emptyList()
    override fun lineTitles(): List<String> = emptyList()
    override fun championships(): List<String> = emptyList()
    override fun esportsDisciplines(): List<EsportsDiscipline> = EsportsCatalog.disciplines
}
