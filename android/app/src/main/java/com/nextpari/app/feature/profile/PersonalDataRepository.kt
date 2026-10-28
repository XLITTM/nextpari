package com.nextpari.app.feature.profile

interface PersonalDataRepository {
    fun load(): PersonalDataQuestionnaire
    suspend fun refresh(): Result<PersonalDataQuestionnaire>
    suspend fun save(fields: PersonalDataFields): Result<PersonalDataQuestionnaire>
}

class FakePersonalDataRepository : PersonalDataRepository {
    override fun load(): PersonalDataQuestionnaire = PersonalDataCatalog.EMPTY

    override suspend fun refresh(): Result<PersonalDataQuestionnaire> = Result.success(load())

    override suspend fun save(fields: PersonalDataFields): Result<PersonalDataQuestionnaire> {
        PersonalDataCatalog.validate(fields)?.let { message ->
            return Result.failure(IllegalArgumentException(message))
        }
        return Result.failure(IllegalStateException(PersonalDataCatalog.SESSION_UNAVAILABLE))
    }
}
