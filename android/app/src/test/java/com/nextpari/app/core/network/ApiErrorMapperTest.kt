package com.nextpari.app.core.network

import com.google.common.truth.Truth.assertThat
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import org.junit.Test

class ApiErrorMapperTest {
    @Test
    fun mapsTimeoutOfflineAndUnknown() {
        assertThat(ApiErrorMapper.fromThrowable(SocketTimeoutException())).isEqualTo(NetworkError.Timeout)
        assertThat(ApiErrorMapper.fromThrowable(UnknownHostException("dns"))).isEqualTo(NetworkError.Offline)
        assertThat(ApiErrorMapper.fromThrowable(IllegalStateException("boom")))
            .isEqualTo(NetworkError.Unknown("boom"))
    }

    @Test
    fun wrapSuccessAndFailure() {
        assertThat(ApiErrorMapper.wrap { 7 }).isEqualTo(ApiResult.Ok(7))
        assertThat(ApiErrorMapper.wrap<Int> { throw SocketTimeoutException() })
            .isEqualTo(ApiResult.Err(NetworkError.Timeout))
    }

    @Test
    fun userMessagesAreStable() {
        assertThat(NetworkError.Timeout.userMessage()).isEqualTo("Превышено время ожидания")
        assertThat(NetworkError.Offline.userMessage()).isEqualTo("Нет соединения с сетью")
        assertThat(NetworkError.Unauthorized.userMessage()).isEqualTo("Сессия недействительна")
        assertThat(NetworkError.Http(500, "").userMessage()).isEqualTo("Ошибка сервера (500)")
    }
}
