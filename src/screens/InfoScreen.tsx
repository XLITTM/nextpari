import { useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Building2,
  Headphones,
  Scale,
  CreditCard,
  BookOpen,
  Ban,
  Mail,
  Send,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface InfoScreenProps {
  onBack: () => void;
}

type InfoView = 'root' | 'about' | 'contacts' | 'rules' | 'payments' | 'howto' | 'stoplist';

const STOP_LIST = [
  'Aviator (Spribe)',
  'JetX (SmartSoft)',
  'Lucky Jet',
  'Mines',
  'Plinko',
  'Blackjack',
  'Baccarat',
  'Рулетка (все столы)',
  'Poker',
  'TV Bet',
  'Crazy Time',
  'Monopoly Live',
];

export function InfoScreen({ onBack }: InfoScreenProps) {
  const [view, setView] = useState<InfoView>('root');
  const { showToast } = useToast();

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} скопирован`);
    } catch {
      showToast(value);
    }
  };

  if (view === 'about') {
    return (
      <SubPage title="О нас" onBack={() => setView('root')}>
        <article className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm text-sm leading-relaxed text-gray-700 dark:text-gray-200 space-y-3">
          <p>
            <span className="font-bold text-gray-900 dark:text-white">Nextpari</span> — международная букмекерская
            платформа для ставок на спорт, киберспорт и казино.
          </p>
          <p>
            Мы работаем с 2024 года и предлагаем живую линию, высокие коэффициенты, быстрые выплаты и круглосуточную
            поддержку.
          </p>
          <p>
            Играйте ответственно. Сервис доступен только лицам старше 18 лет.
          </p>
        </article>
      </SubPage>
    );
  }

  if (view === 'contacts') {
    return (
      <SubPage title="Контакты" onBack={() => setView('root')}>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => copy('support@nextpari.com', 'Email')}
            className="w-full flex items-center gap-3 bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm text-left active:scale-[0.99] transition-transform"
          >
            <span className="w-11 h-11 rounded-2xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-gray-900 dark:text-white">Email поддержки</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">support@nextpari.com</span>
            </span>
            <Copy className="w-4 h-4 text-gray-400 shrink-0" />
          </button>

          <a
            href="https://t.me/nextpari"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-3 bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm text-left active:scale-[0.99] transition-transform"
          >
            <span className="w-11 h-11 rounded-2xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 flex items-center justify-center shrink-0">
              <Send className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-gray-900 dark:text-white">Telegram-чат</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">@nextpari · ответ 24/7</span>
            </span>
            <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
          </a>
        </div>
      </SubPage>
    );
  }

  if (view === 'rules') {
    return (
      <SubPage title="Правила" onBack={() => setView('root')}>
        <article className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm text-sm leading-relaxed text-gray-700 dark:text-gray-200 space-y-3">
          <p className="font-bold text-gray-900 dark:text-white">Юридические условия</p>
          <p>Регистрируясь, вы подтверждаете, что вам исполнилось 18 лет и вы действуете от своего имени.</p>
          <p>Один аккаунт на человека. Мультиаккаунтинг, арбитраж и использование ботов запрещены.</p>
          <p>Компания вправе приостановить выплаты при подозрении на мошенничество до завершения проверки.</p>
          <p>Полная версия правил публикуется на сайте и имеет приоритет над кратким описанием в приложении.</p>
        </article>
      </SubPage>
    );
  }

  if (view === 'payments') {
    return (
      <SubPage title="Платежи" onBack={() => setView('root')}>
        <div className="space-y-3">
          <InfoCard title="Пополнение" text="Карты, криптовалюта и электронные кошельки. Комиссия со стороны Nextpari не взимается. Минимальный депозит — 10 EUR." />
          <InfoCard title="Вывод" text="Заявка обрабатывается от 15 минут до 24 часов в рабочие дни. Минимальная сумма вывода — 20 EUR." />
          <InfoCard title="Комиссии" text="Комиссия платёжной системы может удерживаться провайдером. При выводе в криптовалюту возможна сетевая комиссия сети." />
        </div>
      </SubPage>
    );
  }

  if (view === 'howto') {
    return (
      <SubPage title="Как сделать ставку?" onBack={() => setView('root')}>
        <ol className="space-y-3">
          {[
            'Выберите событие в LIVE или Линии.',
            'Нажмите на коэффициент — исход попадёт в купон.',
            'Укажите сумму ставки. Можно использовать быстрые суммы.',
            'Проверьте тип пари (ординар / экспресс) и нажмите «Заключить».',
            'Статус купона смотрите в разделе «История».',
          ].map((step, i) => (
            <li key={step} className="flex gap-3 bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm">
              <span className="w-7 h-7 rounded-full bg-brand-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed pt-0.5">{step}</p>
            </li>
          ))}
        </ol>
      </SubPage>
    );
  }

  if (view === 'stoplist') {
    return (
      <SubPage title="Стоп-лист игр" onBack={() => setView('root')}>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 px-1">
          Эти игры не участвуют в отыгрыше бонуса. Ставки по ним не засчитываются в вейджер.
        </p>
        <div className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700 shadow-sm">
          {STOP_LIST.map((game) => (
            <div key={game} className="flex items-center gap-3 px-4 py-3">
              <Ban className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{game}</span>
            </div>
          ))}
        </div>
      </SubPage>
    );
  }

  return (
    <div className="min-h-full bg-white dark:bg-gray-900 pb-28">
      <PageHeader title="Инфо" onBack={onBack} />
      <div className="px-4 py-6">
        <div className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700 shadow-sm">
          <InfoRow
            icon={Building2}
            iconClass="bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400"
            label="О нас"
            onClick={() => setView('about')}
          />
          <InfoRow
            icon={Headphones}
            iconClass="bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400"
            label="Контакты"
            onClick={() => setView('contacts')}
          />
          <InfoRow
            icon={Scale}
            iconClass="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400"
            label="Правила"
            onClick={() => setView('rules')}
          />
          <InfoRow
            icon={CreditCard}
            iconClass="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
            label="Платежи"
            onClick={() => setView('payments')}
          />
          <InfoRow
            icon={BookOpen}
            iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
            label="Как сделать ставку?"
            onClick={() => setView('howto')}
          />
          <InfoRow
            icon={Ban}
            iconClass="bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-400"
            label="Стоп-лист игр для отыгрыша"
            onClick={() => setView('stoplist')}
          />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">{title}</h3>
      <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{text}</p>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  iconClass,
  label,
  onClick,
}: {
  icon: typeof Building2;
  iconClass: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3.5 text-left active:bg-gray-100 dark:active:bg-[#0f172a] transition-colors"
    >
      <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon className="w-5 h-5" strokeWidth={2.1} />
      </span>
      <span className="flex-1 text-sm font-semibold text-gray-900 dark:text-white">{label}</span>
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
    </button>
  );
}

function SubPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="min-h-full bg-white dark:bg-gray-900 pb-28">
      <PageHeader title={title} onBack={onBack} />
      <div className="px-4 py-6">{children}</div>
    </div>
  );
}

function PageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 px-2 h-14">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center text-gray-700 dark:text-gray-200 active:scale-90"
          aria-label="Назад"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-gray-900 dark:text-white pr-10">{title}</h1>
      </div>
    </div>
  );
}
