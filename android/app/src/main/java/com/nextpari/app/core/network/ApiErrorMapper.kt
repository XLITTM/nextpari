package com.nextpari.app.core.network

import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import retrofit2.HttpException

object ApiErrorMapper {
    fun fromThrowable(throwable: Throwable): NetworkError = when (throwable) {
        is SocketTimeoutException -> NetworkError.Timeout
        is UnknownHostException -> NetworkError.Offline
        is IOException -> NetworkError.Offline
        is HttpException -> {
            if (throwable.code() == 401 || throwable.code() == 403) {
                NetworkError.Unauthorized
            } else {
                NetworkError.Http(throwable.code(), throwable.message())
            }
        }
        else -> NetworkError.Unknown(throwable.message ?: throwable::class.java.simpleName)
    }

    fun <T> wrap(block: () -> T): ApiResult<T> = try {
        ApiResult.Ok(block())
    } catch (error: Throwable) {
        ApiResult.Err(fromThrowable(error))
    }
}
