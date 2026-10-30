import { useEffect, useState } from 'react';
import { formatApkSize, loadAndroidRelease, type AndroidReleaseView } from '../lib/androidRelease';

function deviceKind(): 'android' | 'ios' | 'desktop' {
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(agent)) return 'ios';
  if (/Android/i.test(agent)) return 'android';
  return 'desktop';
}

export function AndroidDownloadPage() {
  const [release, setRelease] = useState<AndroidReleaseView | null>(null);
  const device = deviceKind();

  useEffect(() => {
    document.title = 'Скачать Nextpari для Android';
    let alive = true;
    void loadAndroidRelease().then((next) => {
      if (alive) setRelease(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const published = release?.published ? release : null;

  return (
    <main className="min-h-screen bg-[#07140c] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-8">
        <a href="/" className="text-sm font-semibold text-emerald-200">На главную</a>
        <div className="mt-8 flex items-center gap-4">
          <img src="/25534.png" alt="" width={72} height={72} className="h-[72px] w-[72px] rounded-2xl" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Nextpari</p>
            <h1 className="text-3xl font-black">Скачать Nextpari для Android</h1>
          </div>
        </div>

        {device === 'ios' && (
          <p className="mt-6 rounded-2xl bg-white/10 px-4 py-3 text-sm leading-6">
            Этот файл предназначен только для Android. На iPhone и iPad установка APK недоступна.
          </p>
        )}

        {!published && (
          <section className="mt-8 rounded-3xl bg-white/10 p-6">
            <p className="text-2xl font-black">Скоро</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Официальный APK ещё не опубликован. Ссылка на скачивание появится здесь после выпуска, который подтвердит владелец.
            </p>
          </section>
        )}

        {published && (
          <section className="mt-8 rounded-3xl bg-white p-6 text-ink-950">
            <p className="text-sm font-bold text-emerald-700">Версия {published.versionName}</p>
            <h2 className="mt-1 text-2xl font-black">Официальный выпуск</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Дата</dt><dd className="font-semibold">{published.effectiveOn}</dd></div>
              <div><dt className="text-slate-500">Размер</dt><dd className="font-semibold">{formatApkSize(published.sizeBytes)}</dd></div>
              <div><dt className="text-slate-500">Android</dt><dd className="font-semibold">от API {published.minSdk}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">SHA-256</dt><dd className="break-all font-mono text-xs">{published.sha256}</dd></div>
            </dl>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{published.releaseNotes}</p>
            {device === 'ios' ? (
              <p className="mt-5 text-sm font-semibold text-slate-600">Кнопка загрузки скрыта: этот APK не устанавливается на iOS.</p>
            ) : (
              <a
                href={published.downloadPath}
                className="mt-5 inline-flex rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"
              >
                Скачать APK
              </a>
            )}
          </section>
        )}

        <section className="mt-8 space-y-3 text-sm leading-6 text-slate-200">
          <h2 className="text-lg font-black text-white">Установка</h2>
          <p>1. Скачайте APK только с этой страницы nextpari.net.</p>
          <p>2. Откройте файл и разрешите установку из этого источника, если Android спросит.</p>
          <p>3. Сверьте SHA-256 с значением на этой странице до установки.</p>
          <p>Приложение подписывается ключом владельца. Debug-сборки здесь не публикуются.</p>
        </section>
      </div>
    </main>
  );
}
