package com.nextpari.app.feature.profile

import com.nextpari.app.core.player.PlayerStateStore

class RemotePersonalDataRepository(
    private val store: PlayerStateStore,
) : PersonalDataRepository {
    override fun load(): PersonalDataQuestionnaire = store.profile()

    override fun save(fields: PersonalDataFields): Result<PersonalDataQuestionnaire> {
        PersonalDataCatalog.validate(fields)?.let { message ->
            return Result.failure(IllegalArgumentException(message))
        }
        return Result.failure(IllegalStateException(PersonalDataCatalog.SESSION_UNAVAILABLE))
    }
}
