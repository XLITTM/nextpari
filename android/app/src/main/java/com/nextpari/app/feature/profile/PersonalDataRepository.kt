package com.nextpari.app.feature.profile

interface PersonalDataRepository {
    fun load(): PersonalDataQuestionnaire
    fun save(fields: PersonalDataFields): Result<PersonalDataQuestionnaire>
}

class FakePersonalDataRepository : PersonalDataRepository {
    override fun load(): PersonalDataQuestionnaire = PersonalDataCatalog.EMPTY

    override fun save(fields: PersonalDataFields): Result<PersonalDataQuestionnaire> {
        PersonalDataCatalog.validate(fields)?.let { message ->
            return Result.failure(IllegalArgumentException(message))
        }
        return Result.failure(IllegalStateException(PersonalDataCatalog.SESSION_UNAVAILABLE))
    }
}
