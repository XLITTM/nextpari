const messages: Record<string, string> = {
  CASINO_ACCOUNT_BLOCKED: 'Аккаунт заблокирован. Казино недоступно.',
  CASINO_SECURITY_RESTRICTED: 'Служба безопасности ограничила доступ к казино.',
  CASINO_KNOWN_UNDERAGE: 'Казино недоступно: по сохранённой дате рождения игроку меньше 18 лет.',
  CASINO_WALLET_UNAVAILABLE: 'Кошелёк недоступен.',
  CASINO_STANDARD_RATE_UNAVAILABLE: 'Курс временно недоступен.',
  CASINO_COUNTRY_NOT_ON_FILE: 'Провайдер запросил страну, а в аккаунте она не сохранена.',
  CASINO_GAME_COUNTRY_UNAVAILABLE: 'Эта игра недоступна для страны, сохранённой в аккаунте.',
  CASINO_STANDARD_DISABLED: 'Игры SoftAggregator временно недоступны.',
  CASINO_STANDARD_UNAVAILABLE: 'Казино временно недоступно.',
};

export function casinoAvailabilityText(code: string | null | undefined, fallback = 'Казино временно недоступно.') {
  if (!code || !messages[code]) return fallback;
  return messages[code];
}
