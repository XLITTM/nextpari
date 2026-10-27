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
    val registerError: String? = null,
    val registerNotice: String? = null,
    val recoveryNotice: String? = null,
    val pendingNavigation: String? = null,
    val oneClickPlayerId: String? = null,
    val oneClickPassword: String? = null,
    val oneClickCanEnter: Boolean = false,
)

class AuthViewModel(
    private val authRepository: AuthRepository,
    sessionRepository: SessionRepository,
) : ViewModel() {
    val session = sessionRepository.session
    val sessionReady = sessionRepository.ready
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

    fun registerEmail(email: String, password: String, ageConfirmed: Boolean, currency: String) {
        submitRegistration(
            RegistrationRequest(
                method = "email",
                email = email,
                password = password,
                ageConfirmed = ageConfirmed,
                currency = currency,
            ),
        )
    }

    fun registerPhone(phone: String, password: String, ageConfirmed: Boolean, currency: String) {
        submitRegistration(
            RegistrationRequest(
                method = "phone",
                phone = phone,
                password = password,
                ageConfirmed = ageConfirmed,
                currency = currency,
            ),
        )
    }

    fun registerOneClick(ageConfirmed: Boolean, currency: String) {
        submitRegistration(
            RegistrationRequest(
                method = "one_click",
                ageConfirmed = ageConfirmed,
                currency = currency,
            ),
        )
    }

    fun continueOneClick() {
        if (ui.value.loading) return
        viewModelScope.launch {
            ui.value = ui.value.copy(loading = true, registerError = null)
            when (val result = authRepository.continueOneClick()) {
                is OneClickContinue.Entered -> ui.value = ui.value.copy(
                    loading = false,
                    oneClickPlayerId = null,
                    oneClickPassword = null,
                    oneClickCanEnter = false,
                )
                is OneClickContinue.NeedLogin -> {
                    val playerId = ui.value.oneClickPlayerId.orEmpty()
                    val issued = ui.value.oneClickPassword.orEmpty()
                    ui.value = ui.value.copy(
                        loading = false,
                        mode = LoginMode.IDENTIFIER,
                        identifier = playerId.ifBlank { ui.value.identifier },
                        password = issued.ifBlank { ui.value.password },
                        oneClickPlayerId = null,
                        oneClickPassword = null,
                        oneClickCanEnter = false,
                        registerNotice = result.notice,
                        pendingNavigation = "one_click_login",
                    )
                }
                is OneClickContinue.Failed -> ui.value = ui.value.copy(
                    loading = false,
                    registerError = result.error.userMessage(),
                )
            }
        }
    }

    fun dismissOneClick() {
        ui.value = ui.value.copy(
            oneClickPlayerId = null,
            oneClickPassword = null,
            oneClickCanEnter = false,
            pendingNavigation = null,
        )
    }

    fun consumeNavigation(): String? {
        val value = ui.value.pendingNavigation ?: return null
        ui.value = ui.value.copy(pendingNavigation = null)
        return value
    }

    private fun submitRegistration(request: RegistrationRequest) {
        if (ui.value.loading) return
        viewModelScope.launch {
            ui.value = ui.value.copy(loading = true, registerError = null, pendingNavigation = null)
            when (val result = authRepository.register(request)) {
                is RegistrationResult.Authenticated -> ui.value = ui.value.copy(loading = false, password = "")
                is RegistrationResult.EmailConfirmationRequired -> ui.value = ui.value.copy(
                    loading = false,
                    password = "",
                    error = null,
                    registerNotice = RegistrationCopy.CONFIRM_EMAIL,
                    pendingNavigation = "email_confirmation",
                )
                is RegistrationResult.OneClickIssued -> ui.value = ui.value.copy(
                    loading = false,
                    password = "",
                    error = null,
                    oneClickPlayerId = result.playerId,
                    oneClickPassword = result.password,
                    oneClickCanEnter = result.canEnter,
                    pendingNavigation = "one_click",
                )
                is RegistrationResult.Failed -> ui.value = ui.value.copy(
                    loading = false,
                    registerError = result.error.userMessage(),
                )
            }
        }
    }

    fun markRecoveryPlaceholder() {
        ui.value = ui.value.copy(
            recoveryNotice = "Для восстановления пароля обратитесь в поддержку.",
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
