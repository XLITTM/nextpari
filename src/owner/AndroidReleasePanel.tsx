import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { AndroidDownloadBanner } from '../components/AndroidDownloadBanner';

type ReleaseRow = {
  versionCode: number;
  versionName: string;
  releaseNotes: string;
  sha256: string;
  sizeBytes: number;
  minSdk: number;
  status: 'draft' | 'published' | 'superseded' | 'retired';
  effectiveOn: string;
  certificateSha256: string;
};

type Settings = {
  bannerEnabled: boolean;
  bannerTitle: string;
  bannerBody: string;
  updateMode: 'none' | 'recommended';
  minimumVersionCode: number;
};

type OwnerState = {
  releases: ReleaseRow[];
  settings: Settings;
  storageReady: boolean;
  signingReady: boolean;
};

const EMPTY: OwnerState = {
  releases: [],
  settings: {
    bannerEnabled: false,
    bannerTitle: 'Nextpari для Android',
    bannerBody: 'Скачайте официальное приложение',
    updateMode: 'none',
    minimumVersionCode: 0,
  },
  storageReady: false,
  signingReady: false,
};

async function ownerFetch(path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'ANDROID_RELEASE_REQUEST_FAILED');
  }
  return payload as { ok: boolean; error?: string };
}

export function AndroidReleasePanel() {
  const [state, setState] = useState<OwnerState>(EMPTY);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    versionCode: '',
    versionName: '',
    releaseNotes: '',
    sha256: '',
    sizeBytes: '',
    minSdk: '26',
    certificateSha256: '',
    effectiveOn: '2026-10-28',
  });
  const [banner, setBanner] = useState(EMPTY.settings);
  const [policy, setPolicy] = useState({ mode: 'none' as 'none' | 'recommended', minimumVersionCode: '0' });

  const load = async () => {
    const payload = await ownerFetch('/api/owner/android-releases');
    const next: OwnerState = {
      releases: (payload.releases as ReleaseRow[]) ?? [],
      settings: (payload.settings as Settings) ?? EMPTY.settings,
      storageReady: payload.storageReady === true,
      signingReady: payload.signingReady === true,
    };
    setState(next);
    setBanner(next.settings);
    setPolicy({ mode: next.settings.updateMode, minimumVersionCode: String(next.settings.minimumVersionCode) });
  };

  useEffect(() => {
    void load().catch((error: unknown) => {
      const code = error instanceof Error ? error.message : '';
      setNotice(code === 'NOT_FOUND' || code === 'ANDROID_RELEASE_STORE_NOT_READY'
        ? 'Каталог выпусков ещё не включён на сервере. Публичная загрузка остаётся закрытой.'
        : (code || 'Не удалось загрузить выпуски'));
    });
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    try {
      await action();
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Операция отклонена');
    } finally {
      setBusy(false);
    }
  };

  const published = state.releases.find((row) => row.status === 'published');

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">Android</p>
        <h2 className="text-2xl font-extrabold text-ink-900">Приложение и обновления</h2>
      </div>

      {notice && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{notice}</p>}
      {!state.signingReady && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Публикация закрыта: на сервере не задан SHA-256 сертификата владельца. Приватный ключ сюда не загружается.
        </p>
      )}
      {!state.storageReady && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Хранилище APK не настроено. Публичная ссылка остаётся выключенной, пока объект не будет проверен.
        </p>
      )}

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-extrabold text-ink-900">Выпуски</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-400">
              <tr><th className="py-2">Код</th><th>Версия</th><th>Статус</th><th>SHA-256</th><th></th></tr>
            </thead>
            <tbody>
              {state.releases.length === 0 && <tr><td className="py-3 text-gray-500" colSpan={5}>Выпусков пока нет</td></tr>}
              {state.releases.map((row) => (
                <tr key={row.versionCode} className="border-t border-gray-100">
                  <td className="py-2 font-semibold">{row.versionCode}</td>
                  <td>{row.versionName}</td>
                  <td>{row.status}</td>
                  <td className="max-w-[220px] truncate font-mono text-xs">{row.sha256}</td>
                  <td className="space-x-2 text-right">
                    {row.status === 'draft' && (
                      <button type="button" disabled={busy} className="font-bold text-emerald-700" onClick={() => void run(async () => { await ownerFetch('/api/owner/android-releases/publish', 'POST', { versionCode: row.versionCode }); })}>Опубликовать</button>
                    )}
                    {row.status === 'published' && (
                      <button type="button" disabled={busy} className="font-bold text-red-700" onClick={() => void run(async () => { await ownerFetch('/api/owner/android-releases/retire', 'POST', { versionCode: row.versionCode }); })}>Снять</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" disabled={busy || !published} className="mt-3 text-sm font-bold text-ink-700" onClick={() => void run(async () => { await ownerFetch('/api/owner/android-releases/rollback', 'POST', {}); })}>
          Вернуть предыдущий опубликованный выпуск
        </button>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-extrabold text-ink-900">Черновик</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ['versionCode', 'versionCode'],
            ['versionName', 'versionName'],
            ['sha256', 'SHA-256 APK'],
            ['sizeBytes', 'Размер в байтах'],
            ['minSdk', 'Минимальный Android API'],
            ['certificateSha256', 'SHA-256 сертификата'],
            ['effectiveOn', 'Дата, ГГГГ-ММ-ДД'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-xs font-semibold text-gray-500">
              {label}
              <input value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} className="mt-1 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-ink-900" />
            </label>
          ))}
          <label className="text-xs font-semibold text-gray-500 sm:col-span-2">
            Заметки о выпуске
            <textarea value={draft.releaseNotes} onChange={(event) => setDraft({ ...draft, releaseNotes: event.target.value })} className="mt-1 h-24 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-ink-900" />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          className="mt-4 rounded-xl bg-ink-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          onClick={() => void run(async () => {
            await ownerFetch('/api/owner/android-releases', 'POST', {
              versionCode: Number(draft.versionCode),
              versionName: draft.versionName.trim(),
              releaseNotes: draft.releaseNotes.trim(),
              sha256: draft.sha256.trim().toLowerCase(),
              sizeBytes: Number(draft.sizeBytes),
              minSdk: Number(draft.minSdk),
              certificateSha256: draft.certificateSha256.trim().toLowerCase(),
              effectiveOn: draft.effectiveOn.trim(),
            });
          })}
        >
          Создать черновик
        </button>
        <p className="mt-3 text-xs leading-5 text-gray-500">
          Файл APK не выбирается с произвольного адреса. Его кладут в закрытое хранилище по ключу com.nextpari.app/versionCode/sha256.apk, а сервер сверяет байты перед публикацией.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-extrabold text-ink-900">Баннер на сайте</h3>
        <p className="mt-1 text-sm text-gray-500">Сейчас опубликован: {published ? published.versionName : 'нет'}</p>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={banner.bannerEnabled} onChange={(event) => setBanner({ ...banner, bannerEnabled: event.target.checked })} />
          Показывать баннер
        </label>
        <input value={banner.bannerTitle} onChange={(event) => setBanner({ ...banner, bannerTitle: event.target.value })} className="mt-3 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold" />
        <input value={banner.bannerBody} onChange={(event) => setBanner({ ...banner, bannerBody: event.target.value })} className="mt-3 w-full rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold" />
        <button type="button" disabled={busy} className="mt-4 rounded-xl bg-ink-900 px-4 py-3 text-sm font-bold text-white" onClick={() => void run(async () => { await ownerFetch('/api/owner/android-releases/banner', 'PUT', { enabled: banner.bannerEnabled, title: banner.bannerTitle, body: banner.bannerBody }); })}>
          Сохранить баннер
        </button>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-gray-400">Телефон</p>
            <div className="relative h-40 overflow-hidden rounded-2xl bg-slate-200">
              <AndroidDownloadBanner preview={{ published: true, versionCode: published?.versionCode ?? 2, versionName: published?.versionName ?? '0.3.0', releaseNotes: '', sizeBytes: 1, releasedAt: '', effectiveOn: '', sha256: 'ab'.repeat(32), minSdk: 26, downloadPath: '/api/android/release/download', banner: { enabled: true, title: banner.bannerTitle, body: banner.bannerBody }, update: { mode: 'none', minimumVersionCode: 0 } }} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase text-gray-400">Компьютер</p>
            <div className="relative h-40 overflow-hidden rounded-2xl bg-slate-200">
              <AndroidDownloadBanner preview={{ published: true, versionCode: published?.versionCode ?? 2, versionName: published?.versionName ?? '0.3.0', releaseNotes: '', sizeBytes: 1, releasedAt: '', effectiveOn: '', sha256: 'ab'.repeat(32), minSdk: 26, downloadPath: '/api/android/release/download', banner: { enabled: true, title: banner.bannerTitle, body: banner.bannerBody }, update: { mode: 'none', minimumVersionCode: 0 } }} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h3 className="font-extrabold text-ink-900">Политика обновления</h3>
        <p className="mt-1 text-sm text-gray-500">Принудительное обновление не включается из этого кабинета.</p>
        <select value={policy.mode} onChange={(event) => setPolicy({ ...policy, mode: event.target.value as 'none' | 'recommended' })} className="mt-3 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold">
          <option value="none">Не предлагать</option>
          <option value="recommended">Рекомендовать обновление</option>
        </select>
        <label className="mt-3 block text-xs font-semibold text-gray-500">
          Минимальная поддерживаемая версия
          <input value={policy.minimumVersionCode} onChange={(event) => setPolicy({ ...policy, minimumVersionCode: event.target.value })} className="mt-1 w-40 rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-ink-900" />
        </label>
        <button type="button" disabled={busy} className="mt-4 rounded-xl bg-ink-900 px-4 py-3 text-sm font-bold text-white" onClick={() => void run(async () => { await ownerFetch('/api/owner/android-releases/policy', 'PUT', { mode: policy.mode, minimumVersionCode: Number(policy.minimumVersionCode) }); })}>
          Сохранить политику
        </button>
      </section>
      <p className="flex items-center gap-2 text-xs text-gray-400"><Smartphone className="h-4 w-4" /> Управление выпуском не меняет балансы игроков.</p>
    </div>
  );
}
