package com.nextpari.app.feature.wallet

enum class WalletWithdrawMethod(val id: String, val label: String, val placeholder: String) {
    CRYPTO("crypto", "Crypto / Web3", "Адрес кошелька (USDT-TRC20)"),
    EWALLET("ewallet", "Электронный кошелёк", "Номер кошелька"),
    CASH("cash", "Наличные (Mobcash)", "Точка выдачи"),
}

enum class WalletHistoryTab(val id: String, val label: String) {
    WITHDRAWALS("withdrawals", "Заявки на вывод"),
    DEPOSITS("deposits", "Пополнения"),
}

enum class WithdrawalStatus(val id: String, val label: String) {
    PENDING("pending", "В обработке"),
    APPROVED("approved", "Одобрено"),
    PAID("paid", "Выплачено"),
    REJECTED("rejected", "Отклонено"),
    CANCELLED("cancelled", "Отменено"),
    EXPIRED("expired", "Истекло"),
}

data class WalletSnapshot(
    val displayBalance: String,
    val currency: String,
)

data class WalletUiState(
    val balanceLabel: String,
    val currency: String,
    val publicId: String,
    val available: Double?,
    val profileComplete: Boolean,
    val loading: Boolean,
    val depositOpen: Boolean = false,
    val withdrawalFormOpen: Boolean = false,
    val restrictionOpen: Boolean = false,
    val withdrawMethod: WalletWithdrawMethod = WalletWithdrawMethod.CRYPTO,
    val amount: String = "",
    val detail: String = "",
    val cashCity: String = "",
    val cashPointId: String = "",
    val cashDestinations: List<PayoutDestinationUiModel> = emptyList(),
    val cashDestinationsLoading: Boolean = false,
    val cashDestinationsLoaded: Boolean = false,
    val cashDestinationsError: String = "",
    val submitting: Boolean = false,
    val historyTab: WalletHistoryTab = WalletHistoryTab.WITHDRAWALS,
    val withdrawals: List<WithdrawalUiModel> = emptyList(),
    val depositHistoryAvailable: Boolean = false,
    val notice: String? = null,
    val copiedPlayerId: Boolean = false,
)

data class WithdrawalUiModel(
    val id: String,
    val method: String,
    val methodLabel: String,
    val amount: Double,
    val status: WithdrawalStatus,
    val createdAt: String,
    val pinCode: String? = null,
    val city: String? = null,
    val point: String? = null,
    val playerNoticeCode: String? = null,
    val rejectionReason: String? = null,
)

data class PayoutDestinationUiModel(
    val id: String,
    val city: String,
    val label: String,
)

data class UsdtQuoteTarget(
    val walletId: String,
    val currency: String,
    val rate: Double,
)

object WalletCatalog {
    const val TITLE = "Управление счётом"
    const val AVAILABLE_BALANCE = "Доступный баланс"
    const val DEPOSIT = "Пополнить"
    const val WITHDRAW = "Вывести"
    const val WITHDRAW_FORM_TITLE = "Запрос на вывод средств"
    const val AMOUNT_LABEL = "Сумма вывода (TMTM)"
    const val MAX_AMOUNT = "Макс. сумма"
    const val METHOD_LABEL = "Способ вывода"
    const val REQUEST_WITHDRAW = "Запросить вывод"
    const val FINANCIAL_OPS = "Финансовые операции"
    const val EMPTY_WITHDRAWALS = "Нет заявок на вывод"
    const val DEPOSITS_UNAVAILABLE = "История пополнений пока недоступна"
    const val LOADING_WITHDRAWALS = "Загрузка заявок..."
    const val LOADING_CASHIERS = "Загрузка доступных касс..."
    const val DESTINATIONS_ERROR = "Не удалось загрузить доступные кассы. Попробуйте обновить."
    const val NO_CASHIERS = "Сейчас нет доступных касс для выдачи."
    const val RETRY = "Обновить"
    const val CITY = "Город"
    const val POINT = "Улица / Касса"
    const val CASH_HELPER = "Паспортные данные для наличных не нужны. Минимальная сумма — 40.00 TMTM."
    const val CASH_HINT = "Выберите город, кассу и сумму от 40.00 TMTM"
    const val MIN_CASH = 40.00
    const val CURRENCY = "TMTM"
    const val UNAVAILABLE_BALANCE = "—"
    const val PLAYER_ID_PREFIX = "ID игрока · "
    const val DEPOSIT_TITLE = "Пополнение через Mobcash"
    const val DEPOSIT_DESC = "Пополните счёт через агента Mobcash. Назовите ID игрока кассиру."
    const val PLAYER_ID_LABEL = "ID игрока"
    const val PLAYER_ID_UNAVAILABLE = "недоступен"
    const val COPY_ID_UNAVAILABLE = "ID игрока недоступен"
    const val COPIED = "Скопировано"
    const val USDT_TITLE = "Криптовалюта → USDT"
    const val USDT_HINT = "Только котировка. Реальный платёж провайдера не создаётся."
    const val ADD_CURRENCY_FIRST = "Сначала добавьте валюту в разделе Кошелёк и валюты."
    const val GET_QUOTE = "Получить котировку"
    const val OPEN_WALLET = "Открыть кошелёк"
    const val RESTRICTION = "Для вывода средств необходимо заполнить личные данные"
    const val FILL_PROFILE = "Заполнить данные"
    const val LATER = "Позже"
    const val UNDER_REVIEW = "Заявка на вывод находится на рассмотрении."
    const val PIN_HELPER = "Назовите этот код кассиру на точке выдачи"
    const val CASHIER_PROPORTION_REJECTION =
        "Вывод отклонён. Сумма вывода должна быть пропорциональна сумме пополнений через выбранную кассу. Для дополнительной информации обратитесь в поддержку."
    const val SESSION_UNAVAILABLE = "Операция станет доступна после подключения безопасной сессии аккаунта."
    const val INVALID_AMOUNT = "Введите корректную сумму"
    const val INSUFFICIENT = "Недостаточно средств на балансе"
    const val FILL_DETAILS = "Заполните реквизиты для вывода"
    const val SELECT_CITY_POINT = "Выберите город и точку выдачи"
    const val NOTICE_UNDER_REVIEW = "under_review"
    const val NOTICE_CASHIER_PROPORTION = "rejected_cashier_proportion"

    val methods: List<WalletWithdrawMethod> = WalletWithdrawMethod.entries
    val historyTabs: List<WalletHistoryTab> = WalletHistoryTab.entries
    val statuses: List<WithdrawalStatus> = WithdrawalStatus.entries

    fun minCashLabel(): String = String.format(java.util.Locale.US, "%.2f", MIN_CASH)

    fun balanceText(displayBalance: String, currency: String): String = "$displayBalance $currency"

    fun availableHelper(available: Double?, currency: String, cash: Boolean): String {
        val availableText = "Доступно: ${formatAmount(available)} $currency"
        return if (cash) "Мин. ${minCashLabel()} $currency · $availableText" else availableText
    }

    fun formatAmount(value: Double?): String =
        if (value == null) UNAVAILABLE_BALANCE else String.format(java.util.Locale("ru", "RU"), "%,.0f", value).replace(',', ' ').trim()

    fun formatMoney(value: Double): String =
        String.format(java.util.Locale("ru", "RU"), "%,.0f", value).replace('\u00A0', ' ').trim()

    fun digitsId(publicId: String): String = publicId.filter(Char::isDigit)

    fun playerIdLabel(publicId: String): String {
        val digits = digitsId(publicId)
        return digits.ifBlank { PLAYER_ID_UNAVAILABLE }
    }

    fun showsPin(model: WithdrawalUiModel): Boolean =
        !model.pinCode.isNullOrBlank() &&
            model.status == WithdrawalStatus.PENDING &&
            model.playerNoticeCode != NOTICE_UNDER_REVIEW

    fun showsUnderReview(model: WithdrawalUiModel): Boolean =
        model.playerNoticeCode == NOTICE_UNDER_REVIEW && model.status == WithdrawalStatus.PENDING

    fun rejectionCopy(model: WithdrawalUiModel): String? {
        if (model.status != WithdrawalStatus.REJECTED) return null
        return if (model.playerNoticeCode == NOTICE_CASHIER_PROPORTION) {
            CASHIER_PROPORTION_REJECTION
        } else {
            "Причина: ${model.rejectionReason ?: "Отклонено"}"
        }
    }

    fun cashDestinationsReady(
        loaded: Boolean,
        loading: Boolean,
        error: String,
        destinations: List<PayoutDestinationUiModel>,
    ): Boolean = loaded && !loading && error.isBlank() && destinations.isNotEmpty()

    fun cashReady(
        method: WalletWithdrawMethod,
        amountRaw: String,
        available: Double?,
        city: String,
        pointId: String,
        destinations: List<PayoutDestinationUiModel>,
        loaded: Boolean,
        loading: Boolean,
        error: String,
    ): Boolean {
        if (method != WalletWithdrawMethod.CASH) return false
        if (!cashDestinationsReady(loaded, loading, error, destinations)) return false
        val amount = amountRaw.replace(',', '.').toDoubleOrNull() ?: return false
        val selected = destinations.any { it.city == city && it.id == pointId }
        return city.isNotBlank() && selected && amount >= MIN_CASH && available != null && amount <= available
    }
}

object WalletActions {
    fun validateWithdraw(state: WalletUiState): String? {
        val amount = state.amount.replace(',', '.').toDoubleOrNull()
        if (amount == null || amount <= 0.0) return WalletCatalog.INVALID_AMOUNT
        val available = state.available
        if (available != null && amount > available) return WalletCatalog.INSUFFICIENT
        if (state.withdrawMethod == WalletWithdrawMethod.CASH) {
            if (amount < WalletCatalog.MIN_CASH) {
                return "Минимальная сумма вывода — ${WalletCatalog.minCashLabel()} TMTM"
            }
            if (!WalletCatalog.cashDestinationsReady(
                    state.cashDestinationsLoaded,
                    state.cashDestinationsLoading,
                    state.cashDestinationsError,
                    state.cashDestinations,
                )
            ) {
                return state.cashDestinationsError.ifBlank { WalletCatalog.NO_CASHIERS }
            }
            val point = state.cashDestinations.firstOrNull { it.city == state.cashCity && it.id == state.cashPointId }
            if (state.cashCity.isBlank() || point == null) return WalletCatalog.SELECT_CITY_POINT
            if (available == null) return WalletCatalog.SESSION_UNAVAILABLE
            return null
        }
        if (!state.profileComplete) return null
        if (state.detail.isBlank()) return WalletCatalog.FILL_DETAILS
        if (available == null) return WalletCatalog.SESSION_UNAVAILABLE
        return null
    }
}
