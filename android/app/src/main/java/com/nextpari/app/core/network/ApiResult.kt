package com.nextpari.app.core.network

sealed class ApiResult<out T> {
    data class Ok<T>(val data: T) : ApiResult<T>()
    data class Err(val error: NetworkError) : ApiResult<Nothing>()
}

inline fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Ok)?.data

fun ApiResult<*>.errorOrNull(): NetworkError? = (this as? ApiResult.Err)?.error
