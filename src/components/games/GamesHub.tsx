import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Dices,
  Gift,
  Heart,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Wallet,
  X,
} from 'lucide-react';
import { useToast } from '../../ToastContext';
import { useWallet } from '../../WalletContext';
import type { Screen } from '../../types';
import { DepositModal } from './DepositModal';
import { preloadGameAssets } from '../../lib/preloadGameAssets';
import { CASINO_COVERS } from '../../lib/casinoCovers';

interface GamesHubProps {
  onBack: () => void;
  onNavigate: (screen: Screen) => void;
}

type HubCategory = 'all' | 'foryou' | 'best' | 'crash' | 'cards' | 'slots' | 'lottery';
type LobbyTab = 'all' | 'bonuses' | 'cashback' | 'favorites';
type GameBadge = 'BEST' | 'HOT';

interface HubGame {
  id: string;
  name: string;
  badge?: GameBadge;
  winLabel: string;
  cover?: string;
  gradient: string;
  route?: Screen;
  categories: HubCategory[];
}

const FAVORITES_KEY = 'nextpari-game-favorites';

const CATEGORIES: { id: HubCategory; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'foryou', label: 'Для Вас' },
  { id: 'best', label: 'Лучшее' },
  { id: 'crash', label: 'Crash / Быстрые' },
  { id: 'cards', label: 'Карты' },
  { id: 'slots', label: 'Слоты' },
  { id: 'lottery', label: 'Лотереи' },
];

const GAMES: HubGame[] = [
  {
    id: 'apples',
    name: 'Apple of Fortune',
    badge: 'HOT',
    winLabel: 'x349',
    cover: '/images/25924.png',
    gradient: 'from-emerald-700 to-lime-900',
    route: { name: 'apples' },
    categories: ['all', 'foryou', 'best', 'crash'],
  },
  {
    id: 'aviator',
    name: 'Aviator',
    badge: 'BEST',
    winLabel: 'x100+',
    cover: '/images/25910.png',
    gradient: 'from-violet-700 to-orange-700',
    route: { name: 'aviator' },
    categories: ['all', 'foryou', 'best', 'crash'],
  },
  {
    id: 'blackjack',
    name: '21 / Очко',
    badge: 'HOT',
    winLabel: 'x2',
    cover: '/images/25901.png',
    gradient: 'from-teal-800 to-emerald-950',
    route: { name: 'blackjack' },
    categories: ['all', 'foryou', 'cards'],
  },
  {
    id: 'crystal',
    name: 'Crystal',
    badge: 'BEST',
    winLabel: 'x500',
    cover: '/images/25953.png',
    gradient: 'from-cyan-500 via-fuchsia-600 to-indigo-900',
    route: { name: 'crystal' },
    categories: ['all', 'best', 'lottery'],
  },
  {
    id: 'dice',
    name: 'Dice',
    badge: 'HOT',
    winLabel: 'x2',
    cover: '/images/26164.png',
    gradient: 'from-emerald-800 via-lime-700 to-green-950',
    route: { name: 'dice' },
    categories: ['all', 'foryou', 'best', 'crash'],
  },
  {
    id: 'pharaoh',
    name: 'Сокровища Фараона',
    badge: 'HOT',
    winLabel: 'x10000',
    cover: '/assets/games/pharaoh/cover.png',
    gradient: 'from-amber-700 via-yellow-800 to-stone-950',
    route: { name: 'pharaoh' },
    categories: ['all', 'foryou', 'best', 'lottery'],
  },
  {
    id: 'western-slot',
    name: 'Western Slot',
    badge: 'HOT',
    winLabel: 'x250',
    cover: CASINO_COVERS['western-slot'],
    gradient: 'from-amber-600 via-orange-800 to-stone-900',
    categories: ['all', 'slots'],
  },
  {
    id: 'burning-hot',
    name: 'Burning Hot',
    badge: 'BEST',
    winLabel: 'x1000',
    cover: CASINO_COVERS['burning-hot'],
    gradient: 'from-red-600 via-orange-600 to-yellow-700',
    categories: ['all', 'best', 'slots'],
  },
  {
    id: 'indian-poker',
    name: 'Indian Poker',
    badge: 'HOT',
    winLabel: 'x50',
    cover: CASINO_COVERS['indian-poker'],
    gradient: 'from-purple-700 via-amber-700 to-rose-900',
    categories: ['all', 'cards'],
  },
];

const LOBBY_TABS: { id: LobbyTab; label: string; icon: typeof Dices }[] = [
  { id: 'all', label: 'Все игры', icon: Dices },
  { id: 'bonuses', label: 'Бонусы', icon: Settings2 },
  { id: 'cashback', label: 'Кешбэк', icon: RefreshCw },
  { id: 'favorites', label: 'Избранное', icon: Star },
];

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function GamesHub({ onBack, onNavigate }: GamesHubProps) {
  const { showToast } = useToast();
  const { balance, publicId } = useWallet();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [category, setCategory] = useState<HubCategory>('all');
  const [lobby, setLobby] = useState<LobbyTab>('all');
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [depositOpen, setDepositOpen] = useState(false);
  const [walletMenu, setWalletMenu] = useState(false);
  const [sortAz, setSortAz] = useState(false);

  useEffect(() => {
    preloadGameAssets();
  }, []);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const openGame = (game: HubGame) => {
    if (game.route) {
      onNavigate(game.route);
      return;
    }
    showToast('Скоро будет доступно');
  };

  const visibleGames = useMemo(() => {
    let list = GAMES.filter((game) => {
      const matchesQuery = game.name.toLowerCase().includes(query.trim().toLowerCase());
      if (!matchesQuery) return false;
      if (lobby === 'favorites') return favorites.includes(game.id);
      if (category === 'all') return true;
      return game.categories.includes(category);
    });
    if (sortAz) list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return list;
  }, [category, favorites, lobby, query, sortAz]);

  const formattedBalance = balance.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0c1018] text-white">
      <header className="shrink-0 border-b border-white/5 bg-[#121826] pt-[env(safe-area-inset-top,0px)]">
        <div className="flex h-12 items-center gap-1 px-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 min-w-10 items-center justify-center gap-0.5 rounded-xl text-slate-200 active:scale-95"
            aria-label="Назад"
          >
            <ChevronLeft className="h-6 w-6" />
            <span className="pr-1 text-[11px] font-semibold text-slate-300">Назад</span>
          </button>
          {searchOpen ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-black/40 px-3 ring-1 ring-white/10">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск игр"
                className="h-9 w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-500"
              />
            </div>
          ) : (
            <h1 className="min-w-0 flex-1 text-center text-[15px] font-black tracking-tight">Nextpari Games</h1>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchOpen((open) => {
                if (open) setQuery('');
                return !open;
              });
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-200 active:scale-95"
            aria-label="Поиск"
          >
            {searchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 pb-3 pt-1">
          <button
            type="button"
            onClick={() => setWalletMenu((open) => !open)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-[#1b2333] px-3 py-2.5 ring-1 ring-white/10"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
              <Wallet className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-black tabular-nums">{formattedBalance} TMTM</span>
              {publicId && (
                <span className="block text-[10px] font-semibold text-slate-400">ID #{publicId.replace(/\D/g, '')}</span>
              )}
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${walletMenu ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setDepositOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-[#1a1f2b] px-3 py-2.5 text-sm font-bold ring-1 ring-white/10 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Пополнить
          </button>
        </div>
        {walletMenu && (
          <div className="px-3 pb-3">
            <div className="rounded-xl bg-[#1b2333] px-3 py-2 text-xs font-semibold text-slate-300 ring-1 ring-white/10">
              Основной счёт · TMTM{publicId ? ` · #${publicId.replace(/\D/g, '')}` : ''}
            </div>
          </div>
        )}
      </header>

      {lobby === 'all' && (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-3 py-2">
          <button
            type="button"
            onClick={() => setSortAz((value) => !value)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/10 ${
              sortAz ? 'bg-[#c89247] text-white' : 'bg-[#1b2333] text-slate-300'
            }`}
            aria-label="Фильтр"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          {CATEGORIES.map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`shrink-0 rounded-full px-3 py-2 text-[12px] font-bold whitespace-nowrap ${
                  active ? 'bg-[#c89247] text-white' : 'bg-[#1b2333] text-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {lobby === 'bonuses' ? (
          <LobbyPanel
            title="Бонусы"
            text="Приветственный бонус, фриспины и промокоды — в разделе Promo."
            action="Открыть Promo"
            onAction={() => onNavigate({ name: 'promo' })}
          />
        ) : lobby === 'cashback' ? (
          <LobbyPanel
            title="VIP кешбэк"
            text="Повышайте уровень и забирайте кешбэк — от Медного до статуса VIP."
            action="Открыть VIP кешбэк"
            onAction={() => onNavigate({ name: 'vip-cashback' })}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 px-3">
            {visibleGames.length === 0 && (
              <p className="col-span-2 py-10 text-center text-sm font-semibold text-slate-400">
                {lobby === 'favorites' ? 'В избранном пока пусто' : 'Игры не найдены'}
              </p>
            )}
            {visibleGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                liked={favorites.includes(game.id)}
                onOpen={() => openGame(game)}
                onToggleLike={() => toggleFavorite(game.id)}
              />
            ))}
          </div>
        )}
      </div>

      <nav className="shrink-0 border-t border-white/10 bg-[#121826] pb-[max(0.4rem,env(safe-area-inset-bottom,8px))]">
        <div className="grid grid-cols-4">
          {LOBBY_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = lobby === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLobby(tab.id)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${
                  active ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {depositOpen && (
        <DepositModal
          publicId={publicId}
          onClose={() => setDepositOpen(false)}
          onWallet={() => {
            setDepositOpen(false);
            onNavigate({ name: 'wallet' });
          }}
        />
      )}
    </div>
  );
}

function GameCard({
  game,
  liked,
  onOpen,
  onToggleLike,
}: {
  game: HubGame;
  liked: boolean;
  onOpen: () => void;
  onToggleLike: () => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const isCrystal = game.id === 'crystal';
  const showCover = Boolean(game.cover) && !coverFailed;
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className={`group relative aspect-[16/10] w-full cursor-pointer overflow-hidden rounded-2xl shadow-lg ${
          isCrystal
            ? 'border border-cyan-500/30 hover:border-cyan-400'
            : 'border border-white/5'
        }`}
      >
        {showCover ? (
          <img
            src={game.cover}
            alt=""
            onError={() => setCoverFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${game.gradient}`}>
            <span className="absolute inset-0 flex items-center justify-center text-3xl">
              {game.id === 'western-slot' ? '🤠' : game.id === 'burning-hot' ? '🔥' : '🃏'}
            </span>
          </div>
        )}
        {game.badge && (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-black">
            {game.badge}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-left">
          <p className="text-[11px] font-semibold text-white">
            Выигрыш до <span className="font-bold text-yellow-400">{game.winLabel}</span>
          </p>
        </div>
      </button>
      <div className="mt-1.5 flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-[12px] font-bold">{game.name}</p>
        <button
          type="button"
          onClick={onToggleLike}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg active:scale-90"
          aria-label="Избранное"
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-rose-500 text-rose-500' : 'text-slate-400'}`} />
        </button>
      </div>
    </div>
  );
}

function LobbyPanel({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="px-3 pt-2">
      <div className="rounded-2xl bg-[#1b2333] p-4 ring-1 ring-white/10">
        <div className="mb-2 flex items-center gap-2">
          <Gift className="h-5 w-5 text-amber-400" />
          <h2 className="text-base font-black">{title}</h2>
        </div>
        <p className="text-sm font-medium leading-relaxed text-slate-300">{text}</p>
        <button
          type="button"
          onClick={onAction}
          className="mt-4 w-full rounded-xl bg-[#c89247] py-2.5 text-sm font-black text-white active:scale-[0.98]"
        >
          {action}
        </button>
      </div>
    </div>
  );
}
