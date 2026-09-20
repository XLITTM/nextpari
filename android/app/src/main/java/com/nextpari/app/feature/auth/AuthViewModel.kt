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

enum class LoginMode { IDENTIFIER, PHONE }

data class AuthUiState(
    val mode: LoginMode = LoginMode.IDENTIFIER,
    val identifier: String = "",
    val password: String = "",
    val passwordVisible: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
    val registerNotice: String? = null,
    val recoveryNotice: String? = null,
)

class AuthViewModel(
    private val authRepository: AuthRepository,
    sessionRepository: SessionRepository,
) : ViewModel() {
    val session = sessionRepository.session
    private val ui = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = ui.asStateFlow()

    fun setMode(mode: LoginMode) {
        ui.value = ui.value.copy(mode = mode, error = null)
    }

    fun setIdentifier(value: String) {
        ui.value = ui.value.copy(identifier = value, error = null)
    }

    fun setPassword(value: String) {
        ui.value = ui.value.copy(password = value, error = null)
    }

    fun togglePasswordVisible() {
        ui.value = ui.value.copy(passwordVisible = !ui.value.passwordVisible)
    }

    fun login() {
        val current = ui.value
        viewModelScope.launch {
            ui.value = current.copy(loading = true, error = null)
            val identifier = when (current.mode) {
                LoginMode.PHONE -> LoginIdentifier.Phone(current.identifier)
                LoginMode.IDENTIFIER -> {
                    val trimmed = current.identifier.trim()
                    if (trimmed.all { it.isDigit() } && trimmed.isNotEmpty()) {
                        LoginIdentifier.PlayerId(trimmed)
                    } else {
                        LoginIdentifier.Email(trimmed)
                    }
                }
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

    fun markRecoveryPlaceholder() {
        ui.value = ui.value.copy(
            recoveryNotice = "Восстановление пароля будет подключено позже. Production API не вызывается.",
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
