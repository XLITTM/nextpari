export const casinoDemoPath = '/casino/demo';
export const casinoDemoApi = '/api/player/casino/demo';

export const casinoCategories = {
  slots: 'Слоты', live: 'Лайв казино', crash: 'Crash', table: 'Настольные',
  instant: 'Моментальные', bingo: 'Бинго', keno: 'Кено', fishing: 'Рыбалка', other: 'Другие',
} as const;

export interface CasinoDemoGame {
  id: string;
  title: string;
  provider: string;
  studio: string;
  category: keyof typeof casinoCategories;
  image: string | null;
  demo: true;
  mobile: boolean | null;
}

export interface CasinoDemoCatalog {
  games: CasinoDemoGame[];
  providers: { id: string; name: string }[];
  categories: (keyof typeof casinoCategories)[];
  total: number;
  nextPage: number | null;
}

export const validCasinoDemoId = (id: string) => /^sa-[a-f0-9]{32}$/.test(id);
