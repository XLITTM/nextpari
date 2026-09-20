package com.nextpari.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.nextpari.app.core.AppGraph
import com.nextpari.app.core.network.ApiResult
import com.nextpari.app.core.network.userMessage
import com.nextpari.app.core.session.SessionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class LoginMethod { EMAIL, PHONE, PLAYER_ID }

data class AuthUiState(
    val method: LoginMethod = LoginMethod.EMAIL,
    val identifier: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
    val registerNotice: String? = null,
)

class AuthViewModel(
    private val authRepository: AuthRepository,
    sessionRepository: SessionRepository,
) : ViewModel() {
    val session = sessionRepository.session
    private val ui = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = ui.asStateFlow()

    fun setMethod(method: LoginMethod) {
        ui.value = ui.value.copy(method = method, error = null)
    }

    fun setIdentifier(value: String) {
        ui.value = ui.value.copy(identifier = value, error = null)
    }

    fun setPassword(value: String) {
        ui.value = ui.value.copy(password = value, error = null)
    }

    fun login() {
        val current = ui.value
        viewModelScope.launch {
            ui.value = current.copy(loading = true, error = null)
            val identifier = when (current.method) {
                LoginMethod.EMAIL -> LoginIdentifier.Email(current.identifier)
                LoginMethod.PHONE -> LoginIdentifier.Phone(current.identifier)
                LoginMethod.PLAYER_ID -> LoginIdentifier.PlayerId(current.identifier)
            }
            when (val result = authRepository.login(identifier, current.password)) {
                is ApiResult.Ok -> ui.value = ui.value.copy(loading = false, password = "")
                is ApiResult.Err -> ui.value = ui.value.copy(
                    loading = false,
                    error = result.error.userMessage(),
                )
            }
        }
    }

    fun logout() {
        viewModelScope.launch { authRepository.logout() }
    }

    fun markRegisterPrepared(kind: String) {
        ui.value = ui.value.copy(
            registerNotice = "Регистрация ($kind) будет подключена к Nextpari API. Пользователь не создан.",
        )
    }

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return AuthViewModel(AppGraph.authRepository, AppGraph.sessionRepository) as T
            }
        }
    }
}
