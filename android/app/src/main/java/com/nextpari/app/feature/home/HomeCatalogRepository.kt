package com.nextpari.app.feature.home

interface HomeCatalogRepository {
    fun sports(): List<HomeSport>
    fun promos(): List<HomePromo>
    fun liveMatches(): List<MatchCardModel>
    fun lineMatches(): List<MatchCardModel>
    fun esportsLiveMatches(): List<MatchCardModel>
    fun esportsLineMatches(): List<MatchCardModel>
    fun esportsTournaments(): List<EsportsTournament>
    fun esportsDisciplines(): List<EsportsDiscipline>
    fun casinoFeatures(): List<CasinoFeatureCard>
    fun casinoTournaments(): List<CasinoTournament>
    fun casinoCategories(): List<CasinoCategoryCard>
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
    override fun liveMatches(): List<MatchCardModel> = emptyList()
    override fun lineMatches(): List<MatchCardModel> = emptyList()
    override fun esportsLiveMatches(): List<MatchCardModel> = emptyList()
    override fun esportsLineMatches(): List<MatchCardModel> = emptyList()
    override fun esportsTournaments(): List<EsportsTournament> = emptyList()
    override fun esportsDisciplines(): List<EsportsDiscipline> = EsportsCatalog.disciplines
    override fun casinoFeatures(): List<CasinoFeatureCard> = CasinoHomeCatalog.features
    override fun casinoTournaments(): List<CasinoTournament> = CasinoHomeCatalog.tournaments
    override fun casinoCategories(): List<CasinoCategoryCard> = CasinoHomeCatalog.categories
}
