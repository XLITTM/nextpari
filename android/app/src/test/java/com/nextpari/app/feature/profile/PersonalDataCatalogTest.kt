package com.nextpari.app.feature.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File
import java.time.LocalDate

class PersonalDataCatalogTest {
    @Test
    fun cardsFieldsAndDocumentTypesMatchProduction() {
        assertThat(PersonalDataCatalog.cardOrder).containsExactly(
            "Личные данные",
            "Адрес проживания",
            "Документ",
            "Номер телефона",
            "Электронная почта",
        ).inOrder()
        assertThat(PersonalDataCatalog.identityFields).containsExactly(
            "Имя", "Фамилия", "Отчество / второе имя", "Дата рождения", "Гражданство",
        ).inOrder()
        assertThat(PersonalDataCatalog.addressFields).containsExactly(
            "Страна проживания", "Город", "Адрес", "Дополнительная строка адреса", "Почтовый индекс",
        ).inOrder()
        assertThat(PersonalDataCatalog.documentFields).containsExactly(
            "Тип документа",
            "Страна выдачи",
            "Серия (если применимо)",
            "Номер документа",
            "Дата выдачи",
            "Дата окончания действия (если применимо)",
            "Кем выдан",
        ).inOrder()
        assertThat(PersonalDataCatalog.documentTypes.map { it.value }).containsExactly(
            "", "passport", "national_id", "residence_permit", "driver_license", "other",
        ).inOrder()
        assertThat(PersonalDataCatalog.documentTypes.map { it.label }).containsExactly(
            "Не выбрано",
            "Паспорт",
            "Национальное удостоверение",
            "Вид на жительство",
            "Водительское удостоверение",
            "Другой документ",
        ).inOrder()
        assertThat(PersonalDataCatalog.PHONE_HELPER).isEqualTo("Телефон из аккаунта. Изменить его в этой анкете нельзя.")
        assertThat(PersonalDataCatalog.SAVE).isEqualTo("Сохранить данные")
        assertThat(PersonalDataCatalog.VERIFIED_BADGE).isEqualTo("Личность подтверждена")
        assertThat(PersonalDataCatalog.IDENTITY_LOCKED_HELP).contains("службу поддержки")
        assertThat(PersonalDataCatalog.SUPPORT_FALLBACK).contains("Свяжитесь со службой поддержки")
    }

    @Test
    fun isoCountryCatalogIsNotTruncated() {
        assertThat(Iso3166Countries.unsorted).hasSize(249)
        assertThat(Iso3166Countries.playerOptions).hasSize(250)
        assertThat(Iso3166Countries.unsorted.first().value).isEqualTo("AD")
        assertThat(Iso3166Countries.unsorted.last().value).isEqualTo("ZW")
        assertThat(Iso3166Countries.playerOptions.first()).isEqualTo(IsoCountry("", "Не выбрано"))
        assertThat(Iso3166Countries.unsorted.map { it.value }.toSet()).hasSize(249)
        assertThat(PersonalDataCatalog.isIsoCountry("")).isTrue()
        assertThat(PersonalDataCatalog.isIsoCountry("TM")).isTrue()
        assertThat(PersonalDataCatalog.isIsoCountry("XX")).isFalse()
    }

    @Test
    fun emptyRuntimeHasNoFakeIdentityAndNoProductionHttp() {
        val empty = FakePersonalDataRepository().load()
        assertThat(empty).isEqualTo(PersonalDataCatalog.EMPTY)
        assertThat(empty.firstName).isEmpty()
        assertThat(empty.lastName).isEmpty()
        assertThat(empty.phone).isEmpty()
        assertThat(empty.email).isEmpty()
        assertThat(empty.identityLocked).isFalse()
        assertThat(empty.verificationStatus).isNull()
        assertThat(empty.emailVerified).isFalse()
        assertThat(empty.phoneVerified).isFalse()
        val vm = PersonalDataViewModel(FakePersonalDataRepository())
        assertThat(vm.uiState.value.fields.firstName).isEmpty()
        assertThat(vm.uiState.value.questionnaire.verificationStatus).isNull()
        vm.save()
        assertThat(vm.uiState.value.notice).isEqualTo(PersonalDataCatalog.SESSION_UNAVAILABLE)
        assertThat(vm.uiState.value.notice).doesNotContain("сохранен")
        assertThat(vm.uiState.value.notice).doesNotContain("сохранена")

        val sources = listOf(
            "src/main/java/com/nextpari/app/feature/profile/PersonalDataScreen.kt",
            "src/main/java/com/nextpari/app/feature/profile/PersonalDataViewModel.kt",
            "src/main/java/com/nextpari/app/feature/profile/PersonalDataRepository.kt",
            "src/main/java/com/nextpari/app/feature/profile/PersonalDataModels.kt",
        ).joinToString("\n") { moduleFile(it).readText() }
        assertThat(sources).doesNotContain("/api/player/personal-data")
        assertThat(sources).doesNotContain("Supabase")
        assertThat(sources).doesNotContain("service_role")
        assertThat(sources).contains("Личные данные")
        val runtime = moduleFile("src/main/java/com/nextpari/app/feature/profile/PersonalDataRepository.kt").readText() +
            moduleFile("src/main/java/com/nextpari/app/feature/profile/PersonalDataViewModel.kt").readText()
        assertThat(runtime).doesNotContain("DEV001")
        assertThat(runtime).doesNotContain("Иван")
    }

    @Test
    fun localValidationMirrorsProductionDateAndCatalogRules() {
        val tomorrow = LocalDate.now().plusDays(1).toString()
        val today = LocalDate.now().toString()
        val yesterday = LocalDate.now().minusDays(1).toString()
        val lastYear = LocalDate.now().minusYears(20).toString()
        assertThat(PersonalDataCatalog.validate(PersonalDataFields(dateOfBirth = today))).isEqualTo(PersonalDataCatalog.DOB_PAST)
        assertThat(PersonalDataCatalog.validate(PersonalDataFields(dateOfBirth = tomorrow))).isEqualTo(PersonalDataCatalog.DOB_PAST)
        assertThat(PersonalDataCatalog.validate(PersonalDataFields(dateOfBirth = lastYear))).isNull()
        assertThat(PersonalDataCatalog.validate(PersonalDataFields(documentIssueDate = tomorrow))).isEqualTo(PersonalDataCatalog.ISSUE_NOT_FUTURE)
        assertThat(
            PersonalDataCatalog.validate(
                PersonalDataFields(documentIssueDate = yesterday, documentExpiryDate = yesterday),
            ),
        ).isEqualTo(PersonalDataCatalog.EXPIRY_AFTER_ISSUE)
        assertThat(PersonalDataCatalog.validate(PersonalDataFields(citizenshipCountryCode = "NOPE"))).isEqualTo(PersonalDataCatalog.COUNTRY_ISO)
        assertThat(PersonalDataCatalog.validate(PersonalDataFields(documentType = "id_card"))).isEqualTo(PersonalDataCatalog.DOCUMENT_TYPE_INVALID)
        assertThat(PersonalDataCatalog.validate(PersonalDataFields(documentType = "passport", citizenshipCountryCode = "TM"))).isNull()
        val invalid = FakePersonalDataRepository().save(PersonalDataFields(dateOfBirth = today))
        assertThat(invalid.exceptionOrNull()?.message).isEqualTo(PersonalDataCatalog.DOB_PAST)
    }

    private fun moduleFile(relative: String): File {
        val candidates = listOf(File(relative), File("app/$relative"), File("android/app/$relative"))
        return candidates.firstOrNull { it.exists() } ?: File(relative)
    }
}
