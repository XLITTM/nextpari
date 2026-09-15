export function StaffPlayerPersonalDataCard({
  data,
}: {
  data: {
    hasRow: boolean;
    questionnaireComplete: boolean;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    citizenshipCountryCode: string;
    residenceCountryCode: string;
    residenceCity: string;
    documentType: string;
    documentNumberMasked: string;
    updatedAt: string | null;
  } | null;
}) {
  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
      <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Личные данные</p>
      {!data || !data.hasRow ? (
        <p className="text-sm text-gray-500">Анкета не заполнялась</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink-900">
            {data.questionnaireComplete ? 'Анкета заполнена' : 'Анкета неполная'}
          </p>
          <p className="text-sm text-gray-700">
            {[data.lastName, data.firstName].filter(Boolean).join(' ') || 'Имя не указано'}
          </p>
          <p className="text-xs text-gray-600">Дата рождения: {data.dateOfBirth || '—'}</p>
          <p className="text-xs text-gray-600">Гражданство: {data.citizenshipCountryCode || '—'}</p>
          <p className="text-xs text-gray-600">
            Проживание: {[data.residenceCountryCode, data.residenceCity].filter(Boolean).join(', ') || '—'}
          </p>
          <p className="text-xs text-gray-600">Документ: {data.documentType || '—'}</p>
          <p className="text-xs text-gray-600">Номер документа: {data.documentNumberMasked || '—'}</p>
          {data.updatedAt ? (
            <p className="text-xs text-gray-500">Обновлено: {data.updatedAt}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
