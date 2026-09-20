package com.nextpari.app.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class PersonalDataViewModel(
    private val repository: PersonalDataRepository,
) : ViewModel() {
    private val ui = MutableStateFlow(initialState())
    val uiState: StateFlow<PersonalDataUiState> = ui.asStateFlow()

    fun update(transform: (PersonalDataFields) -> PersonalDataFields) {
        ui.update { it.copy(fields = transform(it.fields), notice = null) }
    }

    fun save() {
        val current = ui.value
        if (current.saving) return
        ui.update { it.copy(saving = true, notice = null) }
        val result = repository.save(current.fields)
        ui.update {
            it.copy(
                saving = false,
                notice = result.exceptionOrNull()?.message ?: PersonalDataCatalog.SESSION_UNAVAILABLE,
            )
        }
    }

    fun openEmail() {
        ui.update { it.copy(emailOpen = true, notice = null) }
    }

    fun closeEmail() {
        ui.update { it.copy(emailOpen = false) }
    }

    fun consumeNotice() {
        ui.update { it.copy(notice = null) }
    }

    private fun initialState(): PersonalDataUiState {
        val questionnaire = repository.load()
        return PersonalDataUiState(
            questionnaire = questionnaire,
            fields = PersonalDataFields(
                firstName = questionnaire.firstName,
                lastName = questionnaire.lastName,
                middleName = questionnaire.middleName,
                dateOfBirth = questionnaire.dateOfBirth,
                citizenshipCountryCode = questionnaire.citizenshipCountryCode,
                residenceCountryCode = questionnaire.residenceCountryCode,
                residenceCity = questionnaire.residenceCity,
                addressLine1 = questionnaire.addressLine1,
                addressLine2 = questionnaire.addressLine2,
                postalCode = questionnaire.postalCode,
                documentType = questionnaire.documentType,
                documentIssuingCountryCode = questionnaire.documentIssuingCountryCode,
                documentSeries = questionnaire.documentSeries,
                documentNumber = questionnaire.documentNumber,
                documentIssueDate = questionnaire.documentIssueDate,
                documentExpiryDate = questionnaire.documentExpiryDate,
                documentIssuingAuthority = questionnaire.documentIssuingAuthority,
            ),
        )
    }

    companion object {
        val Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return PersonalDataViewModel(FakePersonalDataRepository()) as T
            }
        }
    }
}
