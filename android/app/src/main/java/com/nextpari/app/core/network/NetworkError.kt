package com.nextpari.app.core.network

sealed class NetworkError {
    data class Http(val code: Int, val message: String) : NetworkError()
    data object Unauthorized : NetworkError()
    data object Timeout : NetworkError()
    data object Offline : NetworkError()
    data class Unknown(val message: String) : NetworkError()
}

fun NetworkError.userMessage(): String = when (this) {
    is NetworkError.Http -> if (message.isNotBlank()) message else "Ошибка сервера ($code)"
    NetworkError.Unauthorized -> "Сессия недействительна"
    NetworkError.Timeout -> "Превышено время ожидания"
    NetworkError.Offline -> "Нет соединения с сетью"
    is NetworkError.Unknown -> message.ifBlank { "Неизвестная ошибка" }
}
