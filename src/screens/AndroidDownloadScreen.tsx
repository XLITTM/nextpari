import { ChevronLeft, Download } from 'lucide-react';
import { ANDROID_APK, formatAndroidApkSize } from '../lib/androidApk';

interface AndroidDownloadScreenProps {
  onBack: () => void;
}

function AndroidMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.6 9.48l1.84-3.18a.5.5 0 0 0-.2-.68.5.5 0 0 0-.68.2l-1.86 3.22A7.4 7.4 0 0 0 12 8.25a7.4 7.4 0 0 0-4.7 1.79L5.44 6.82a.5.5 0 0 0-.68-.2.5.5 0 0 0-.2.68l1.84 3.18A7.46 7.46 0 0 0 4.5 15.5v.75c0 .69.56 1.25 1.25 1.25h.5V19a1.5 1.5 0 0 0 3 0v-1.5h5.5V19a1.5 1.5 0 0 0 3 0v-1.5h.5c.69 0 1.25-.56 1.25-1.25v-.75a7.46 7.46 0 0 0-2.4-6.02ZM9.25 13.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm5.5 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
      />
    </svg>
  );
}

export function AndroidDownloadScreen({ onBack }: AndroidDownloadScreenProps) {
  const sizeLabel = formatAndroidApkSize();

  return (
    <div className="min-h-full bg-white dark:bg-gray-900 pb-28">
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
          <h1 className="flex-1 text-center text-lg font-bold text-gray-900 dark:text-white pr-10">
            Скачать Android
          </h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-4">
        <section className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-5 shadow-sm text-center">
          <img
            src="/logo.png"
            alt="NextPari"
            className="mx-auto h-12 w-auto"
          />
          <div className="mt-4 mx-auto w-14 h-14 rounded-2xl bg-[#3DDC84]/15 text-[#3DDC84] flex items-center justify-center">
            <AndroidMark className="w-8 h-8" />
          </div>
          <p className="mt-4 text-base font-extrabold text-gray-900 dark:text-white">NextPari для Android</p>
          <p className="mt-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
            {ANDROID_APK.testNotice}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-300">
            Отладочная сборка для авторизованных тестировщиков. Это не публичный релиз Google Play.
          </p>
        </section>

        <section className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-300">Версия</span>
            <span className="font-bold text-gray-900 dark:text-white tabular-nums">{ANDROID_APK.versionName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-300">Размер</span>
            <span className="font-bold text-gray-900 dark:text-white tabular-nums">{sizeLabel}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-300">Пакет</span>
            <span className="font-semibold text-gray-900 dark:text-white break-all">{ANDROID_APK.packageName}</span>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-300">SHA-256</p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed break-all text-gray-700 dark:text-gray-200">
              {ANDROID_APK.sha256}
            </p>
          </div>
        </section>

        <a
          href={ANDROID_APK.publicPath}
          download={ANDROID_APK.fileName}
          className="flex items-center justify-center gap-2 w-full bg-brand-600 text-white font-bold rounded-2xl py-3.5 px-4 active:scale-[0.98] transition-transform"
        >
          <Download className="w-5 h-5" />
          Скачать APK · {sizeLabel}
        </a>

        <section className="bg-gray-50 dark:bg-[#1e293b] rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Как установить</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            <li>Скачайте APK по кнопке выше.</li>
            <li>Разрешите установку из этого источника, если Android спросит.</li>
            <li>Откройте загруженный файл и подтвердите установку.</li>
            <li>Приложение подписано debug-сертификатом и предназначено только для теста.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
