package com.nextpari.app.core.player

import com.nextpari.app.feature.profile.PersonalDataCatalog
import com.nextpari.app.feature.profile.PersonalDataQuestionnaire
import com.nextpari.app.feature.wallets.PlayerWalletRow
import com.nextpari.app.feature.wallets.WalletsCatalog

class PlayerStateStore {
    private val lock = Any()
    private var me: PlayerMeSnapshot? = null
    private var wallets: List<PlayerWalletRow> = emptyList()
    private var profile: PersonalDataQuestionnaire = PersonalDataCatalog.EMPTY

    fun me(): PlayerMeSnapshot? = synchronized(lock) { me }

    fun wallets(): List<PlayerWalletRow> = synchronized(lock) { wallets.toList() }

    fun profile(): PersonalDataQuestionnaire = synchronized(lock) { profile }

    fun applyMe(snapshot: PlayerMeSnapshot) {
        synchronized(lock) {
            me = snapshot
            profile = profile.mergeIdentity(snapshot.profile)
        }
    }

    fun applyWallets(rows: List<PlayerWalletRow>) {
        synchronized(lock) { wallets = rows.toList() }
    }

    fun applyProfile(questionnaire: PersonalDataQuestionnaire) {
        synchronized(lock) { profile = questionnaire }
    }

    fun applyBalanceAfter(balanceAfter: Double) {
        if (!balanceAfter.isFinite() || balanceAfter < 0) return
        synchronized(lock) {
            val current = me ?: return
            me = current.copy(wallet = current.wallet.copy(balance = balanceAfter))
            wallets = wallets.map { row ->
                if (row.isActive) row.copy(availableBalance = formatServerBalance(balanceAfter)) else row
            }
        }
    }

    fun clear() {
        synchronized(lock) {
            me = null
            wallets = emptyList()
            profile = PersonalDataCatalog.EMPTY
        }
    }
}

fun mappedWalletsToRows(rows: List<MappedWalletRow>): List<PlayerWalletRow> =
    rows.map { row ->
        PlayerWalletRow(
            walletId = row.walletId,
            currency = WalletsCatalog.displayCurrency(row.currency),
            displayNameRu = row.displayNameRu,
            availableBalance = formatServerBalance(row.availableBalance),
            isActive = row.isActive,
        )
    }

fun PersonalDataQuestionnaire.mergeIdentity(snapshot: PlayerProfileSnapshot): PersonalDataQuestionnaire =
    copy(
        firstName = snapshot.firstName,
        lastName = snapshot.lastName,
        middleName = snapshot.middleName,
        dateOfBirth = snapshot.birthDate,
        email = snapshot.email,
        emailVerified = snapshot.emailVerified,
        phone = snapshot.phone,
        phoneVerified = snapshot.phoneVerified,
        hasRow = snapshot.firstName.isNotBlank() || snapshot.lastName.isNotBlank() || snapshot.email.isNotBlank(),
        questionnaireComplete = isPlayerProfileComplete(snapshot),
    )

fun PlayerProfileSnapshot.toQuestionnaire(): PersonalDataQuestionnaire =
    PersonalDataCatalog.EMPTY.mergeIdentity(this)
