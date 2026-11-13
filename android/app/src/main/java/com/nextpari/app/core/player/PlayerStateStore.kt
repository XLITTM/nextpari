package com.nextpari.app.core.player

import com.nextpari.app.feature.profile.PersonalDataCatalog
import com.nextpari.app.feature.profile.PersonalDataQuestionnaire
import com.nextpari.app.feature.wallets.PlayerWalletRow
import com.nextpari.app.feature.wallets.WalletsCatalog

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

data class WalletRead internal constructor(internal val session: Long, internal val order: Long, val playerId: String?)

data class VerifiedWallet(
    val walletId: String,
    val currency: String,
    val balance: Double,
    val revision: Long,
)

class PlayerStateStore {
    private val lock = Any()
    private var me: PlayerMeSnapshot? = null
    private var wallets: List<PlayerWalletRow> = emptyList()
    private var profile: PersonalDataQuestionnaire = PersonalDataCatalog.EMPTY
    private var session = 0L
    private var nextOrder = 0L
    private val revision = MutableStateFlow(0L)
    val walletRevision = revision.asStateFlow()

    fun me(): PlayerMeSnapshot? = synchronized(lock) { me }

    fun wallets(): List<PlayerWalletRow> = synchronized(lock) { wallets.toList() }

    fun profile(): PersonalDataQuestionnaire = synchronized(lock) { profile }

    fun beginWalletRead(): WalletRead = synchronized(lock) {
        WalletRead(session, ++nextOrder, me?.playerPublicId)
    }

    fun isCurrentSession(read: WalletRead): Boolean = synchronized(lock) {
        read.session == session && read.playerId == me?.playerPublicId
    }

    fun isCurrentWalletRead(read: WalletRead): Boolean = synchronized(lock) {
        isCurrentSession(read) && read.order > revision.value
    }

    fun hydrate(
        read: WalletRead,
        snapshot: PlayerMeSnapshot,
        serverProfile: PersonalDataQuestionnaire?,
        serverWallets: List<MappedWalletRow>?,
    ): Boolean = synchronized(lock) {
        if (!isCurrentSession(read) || snapshot.playerPublicId.isBlank()
            || (read.playerId != null && read.playerId != snapshot.playerPublicId)
        ) return@synchronized false
        val previous = me
        me = if (previous == null) snapshot else snapshot.copy(wallet = previous.wallet)
        profile = (serverProfile ?: profile).mergeIdentity(snapshot.profile)
        if (serverWallets != null && read.order > revision.value) {
            replaceWallets(read.order, serverWallets)
        }
        true
    }

    fun applyWalletRead(read: WalletRead, rows: List<MappedWalletRow>): Boolean = synchronized(lock) {
        if (read.playerId == null || !isCurrentWalletRead(read)) return@synchronized false
        replaceWallets(read.order, rows)
    }

    fun applyProfile(questionnaire: PersonalDataQuestionnaire) {
        synchronized(lock) { profile = questionnaire }
    }

    fun verifiedWallet(): VerifiedWallet? = synchronized(lock) {
        val current = me ?: return@synchronized null
        val active = wallets.singleOrNull { it.isActive } ?: return@synchronized null
        val currency = WalletsCatalog.storageCurrency(active.currency) ?: return@synchronized null
        if (currency != WalletsCatalog.storageCurrency(current.wallet.currency)) return@synchronized null
        VerifiedWallet(active.walletId, active.currency, current.wallet.balance, revision.value)
    }

    fun applyBalanceAfter(balanceAfter: Double, expected: VerifiedWallet): Boolean = synchronized(lock) {
        if (!balanceAfter.isFinite() || balanceAfter < 0.0 || verifiedWallet() != expected) return@synchronized false
        val current = me ?: return@synchronized false
        me = current.copy(wallet = current.wallet.copy(balance = balanceAfter))
        wallets = wallets.map { row ->
            if (row.walletId == expected.walletId) row.copy(availableBalance = formatServerBalance(balanceAfter)) else row
        }
        revision.value = ++nextOrder
        true
    }

    fun clear() {
        synchronized(lock) {
            session++
            me = null
            wallets = emptyList()
            profile = PersonalDataCatalog.EMPTY
            revision.value = ++nextOrder
        }
    }

    private fun replaceWallets(order: Long, rows: List<MappedWalletRow>): Boolean {
        // A stable wallet ID must never change currencies within a player session.
        val oldById = wallets.associateBy { it.walletId }
        if (rows.any { row ->
            oldById[row.walletId]?.let {
                WalletsCatalog.storageCurrency(it.currency) != WalletsCatalog.storageCurrency(row.currency)
            } == true
        }) return false
        val active = rows.singleOrNull { it.isActive }
        val current = checkNotNull(me)
        if (active != null) {
            me = current.copy(wallet = current.wallet.copy(
                balance = active.availableBalance,
                currency = WalletsCatalog.displayCurrency(active.currency),
            ))
        }
        wallets = mappedWalletsToRows(rows)
        revision.value = order
        return true
    }
}

fun mappedWalletsToRows(rows: List<MappedWalletRow>): List<PlayerWalletRow> =
    rows.map { row ->
        PlayerWalletRow(
            walletId = row.walletId,
            currency = WalletsCatalog.displayCurrency(row.currency),
            displayNameRu = WalletsCatalog.displayNameRu(row.currency),
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
