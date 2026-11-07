package com.rixobet.app.domain

enum class ThemeMode(val key: String, val settingsLabel: String) {
    DarkVip("dark_vip", "Тёмная"),
    WhiteEmerald("white_emerald", "Светлая"),
    ;

    companion object {
        fun fromKey(raw: String?): ThemeMode = entries.firstOrNull { it.key == raw } ?: DarkVip
    }
}
