package com.nextpari.app.feature.home

import com.nextpari.app.R

data class HubCategory(val id: String, val label: String)

data class GamesLobbyTab(val id: String, val label: String)

data class HubGame(
    val id: String,
    val name: String,
    val route: String,
    val badge: String? = null,
    val winLabel: String? = null,
    val drawableName: String,
    val categories: List<String>,
) {
    val coverRes: Int
        get() = when (drawableName) {
            "game_apples" -> R.drawable.game_apples
            "game_aviator" -> R.drawable.game_aviator
            "game_blackjack" -> R.drawable.game_blackjack
            "game_crystal" -> R.drawable.game_crystal
            "game_dice" -> R.drawable.game_dice
            "game_pharaoh" -> R.drawable.game_pharaoh
            else -> R.drawable.game_apples
        }
}

object GamesCatalog {
    val categories: List<HubCategory> = listOf(
        HubCategory("all", "Все"),
        HubCategory("foryou", "Для Вас"),
        HubCategory("best", "Лучшее"),
        HubCategory("crash", "Crash / Быстрые"),
        HubCategory("cards", "Карты"),
        HubCategory("lottery", "Лотереи"),
    )

    val lobbyTabs: List<GamesLobbyTab> = listOf(
        GamesLobbyTab("all", "Все игры"),
        GamesLobbyTab("bonuses", "Бонусы"),
        GamesLobbyTab("cashback", "Кешбэк"),
        GamesLobbyTab("favorites", "Избранное"),
    )

    val games: List<HubGame> = listOf(
        HubGame(
            id = "apples",
            name = "Apple of Fortune",
            route = "apples",
            badge = "HOT",
            winLabel = "x349",
            drawableName = "game_apples",
            categories = listOf("all", "foryou", "best", "crash"),
        ),
        HubGame(
            id = "aviator",
            name = "Aviator",
            route = "aviator",
            badge = "BEST",
            winLabel = "x100+",
            drawableName = "game_aviator",
            categories = listOf("all", "foryou", "best", "crash"),
        ),
        HubGame(
            id = "blackjack",
            name = "21 / Очко",
            route = "blackjack",
            badge = "HOT",
            winLabel = "x2",
            drawableName = "game_blackjack",
            categories = listOf("all", "foryou", "cards"),
        ),
        HubGame(
            id = "crystal",
            name = "Crystal",
            route = "crystal",
            badge = "BEST",
            drawableName = "game_crystal",
            categories = listOf("all", "best", "lottery"),
        ),
        HubGame(
            id = "dice",
            name = "Dice",
            route = "dice",
            badge = "HOT",
            winLabel = "x2",
            drawableName = "game_dice",
            categories = listOf("all", "foryou", "best", "crash"),
        ),
        HubGame(
            id = "pharaoh",
            name = "Сокровища Фараона",
            route = "pharaoh",
            badge = "HOT",
            winLabel = "x10000",
            drawableName = "game_pharaoh",
            categories = listOf("all", "foryou", "best", "lottery"),
        ),
    )

    fun visibleGames(
        category: String,
        lobby: String,
        query: String,
        favorites: Set<String>,
        sortAz: Boolean,
    ): List<HubGame> {
        val trimmed = query.trim()
        var list = games.filter { game ->
            val matchesQuery = trimmed.isEmpty() || game.name.contains(trimmed, ignoreCase = true)
            if (!matchesQuery) return@filter false
            when (lobby) {
                "favorites" -> game.id in favorites
                else -> category == "all" || game.categories.contains(category)
            }
        }
        if (sortAz) list = list.sortedBy { it.name }
        return list
    }
}
