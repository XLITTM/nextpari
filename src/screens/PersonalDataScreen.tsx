import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, Save, Phone, Mail, CheckCircle2, Clock3, ShieldCheck,
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { EmailBindModal } from '../components/player/EmailBindModal';
import {
  EMPTY_PLAYER_PERSONAL_DATA,
  PLAYER_COUNTRY_OPTIONS,
  PLAYER_DOCUMENT_TYPE_OPTIONS,
  PLAYER_PERSONAL_DATA_AUTH_REQUIRED,
  PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_HELP,
  PLAYER_PERSONAL_DATA_LOADING,
  PLAYER_PERSONAL_DATA_LOAD_ERROR,
  PLAYER_PERSONAL_DATA_NOTICE,
  PLAYER_PERSONAL_DATA_NOTICE_EXTRA,
  PLAYER_PERSONAL_DATA_RETRY,
  PLAYER_PERSONAL_DATA_SUPPORT_FALLBACK,
  PLAYER_PERSONAL_DATA_VERIFIED_BADGE,
  canSavePlayerPersonalData,
  loadPlayerPersonalDataQuestionnaire,
  playerPersonalDataSavePayload,
  savePlayerPersonalData,
  type PlayerPersonalDataLoadState,
  type PlayerPersonalDataQuestionnaire,
} from '../lib/playerPersonalData';

interface PersonalDataScreenProps {
  onBack: () => void;
}

export function PersonalDataScreen({ onBack }: PersonalDataScreenProps) {
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [citizenship, setCitizenship] = useState('');
  const [residenceCountry, setResidenceCountry] = useState('');
  const [residenceCity, setResidenceCity] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentCountry, setDocumentCountry] = useState('');
  const [documentSeries, setDocumentSeries] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [loadState, setLoadState] = useState<PlayerPersonalDataLoadState>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  const apply = useCallback((next: PlayerPersonalDataQuestionnaire) => {
    setLoadState({ kind: 'ready', data: next });
    setFirstName(next.firstName);
    setLastName(next.lastName);
    setMiddleName(next.middleName);
    setDateOfBirth(next.dateOfBirth);
    setCitizenship(next.citizenshipCountryCode);
    setResidenceCountry(next.residenceCountryCode);
    setResidenceCity(next.residenceCity);
    setAddressLine1(next.addressLine1);
    setAddressLine2(next.addressLine2);
    setPostalCode(next.postalCode);
    setDocumentType(next.documentType);
    setDocumentCountry(next.documentIssuingCountryCode);
    setDocumentSeries(next.documentSeries);
    setDocumentNumber(next.documentNumber);
    setIssueDate(next.documentIssueDate);
    setExpiryDate(next.documentExpiryDate);
    setIssuingAuthority(next.documentIssuingAuthority);
  }, []);

  const loadQuestionnaire = useCallback(async () => {
    setLoadState({ kind: 'loading' });
    const next = await loadPlayerPersonalDataQuestionnaire();
    if (next.kind === 'ready') {
      apply(next.data);
      return;
    }
    setLoadState(next);
  }, [apply]);

  useEffect(() => {
    void loadQuestionnaire();
  }, [loadQuestionnaire]);

  const ready = loadState.kind === 'ready';
  const data = ready ? loadState.data : EMPTY_PLAYER_PERSONAL_DATA;
  const identityLocked = ready && data.identityLocked;
  const verified = ready && data.verificationStatus === 'VERIFIED';
  const saveEnabled = canSavePlayerPersonalData(loadState) && !saving;

  const handleSave = async () => {
    if (!canSavePlayerPersonalData(loadState)) return;
    setSaving(true);
    try {
      const next = await savePlayerPersonalData(playerPersonalDataSavePayload({
        firstName,
        lastName,
        middleName,
        dateOfBirth,
        citizenshipCountryCode: citizenship,
        residenceCountryCode: residenceCountry,
        residenceCity,
        addressLine1,
        addressLine2,
        postalCode,
        documentType,
        documentIssuingCountryCode: documentCountry,
        documentSeries,
        documentNumber,
        documentIssueDate: issueDate,
        documentExpiryDate: expiryDate,
        documentIssuingAuthority: issuingAuthority,
      }));
      apply(next);
      showToast(next.questionnaireComplete ? 'Анкета сохранена' : 'Черновик сохранён');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Не удалось сохранить анкету');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center gap-3 px-3 pb-3">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Личные данные</h1>
      </div>

      <div className="px-3 space-y-4">
        <div className="bg-brand-50 dark:bg-brand-600/10 rounded-2xl border border-brand-100 dark:border-brand-600/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{PLAYER_PERSONAL_DATA_NOTICE}</p>
          <p className="text-xs text-gray-600 dark:text-gray-300">{PLAYER_PERSONAL_DATA_NOTICE_EXTRA}</p>
        </div>

        {loadState.kind === 'loading' ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{PLAYER_PERSONAL_DATA_LOADING}</p>
          </div>
        ) : null}

        {loadState.kind === 'error' ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{loadState.message || PLAYER_PERSONAL_DATA_LOAD_ERROR}</p>
            <button
              type="button"
              onClick={() => void loadQuestionnaire()}
              className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3 rounded-xl"
            >
              {PLAYER_PERSONAL_DATA_RETRY}
            </button>
          </div>
        ) : null}

        {loadState.kind === 'auth' ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{PLAYER_PERSONAL_DATA_AUTH_REQUIRED}</p>
          </div>
        ) : null}

        {ready ? (
          <>
        {verified ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-600/15 px-2 py-1 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              {PLAYER_PERSONAL_DATA_VERIFIED_BADGE}
            </span>
            {identityLocked ? (
              <>
                <p className="text-xs text-gray-600 dark:text-gray-300">{PLAYER_PERSONAL_DATA_IDENTITY_LOCKED_HELP}</p>
                {data.supportConfigured && data.supportMailto ? (
                  <a href={data.supportMailto} className="text-xs font-bold text-brand-700 dark:text-brand-400">
                    Написать в поддержку
                  </a>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{PLAYER_PERSONAL_DATA_SUPPORT_FALLBACK}</p>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Личные данные</h2>
          <FieldInput label="Имя" value={firstName} onChange={setFirstName} placeholder="Иван" locked={identityLocked} />
          <FieldInput label="Фамилия" value={lastName} onChange={setLastName} placeholder="Иванов" locked={identityLocked} />
          <FieldInput label="Отчество / второе имя" value={middleName} onChange={setMiddleName} placeholder="Иванович" locked={identityLocked} />
          <DateInput label="Дата рождения" value={dateOfBirth} onChange={setDateOfBirth} locked={identityLocked} />
          <CountrySelect label="Гражданство" value={citizenship} onChange={setCitizenship} locked={identityLocked} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Адрес проживания</h2>
          <CountrySelect label="Страна проживания" value={residenceCountry} onChange={setResidenceCountry} />
          <FieldInput label="Город" value={residenceCity} onChange={setResidenceCity} placeholder="Ашхабад" />
          <FieldInput label="Адрес" value={addressLine1} onChange={setAddressLine1} placeholder="Улица, дом" />
          <FieldInput label="Дополнительная строка адреса" value={addressLine2} onChange={setAddressLine2} placeholder="Квартира, корпус" />
          <FieldInput label="Почтовый индекс" value={postalCode} onChange={setPostalCode} placeholder="744000" />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Документ</h2>
          <SelectInput
            label="Тип документа"
            value={documentType}
            onChange={setDocumentType}
            options={PLAYER_DOCUMENT_TYPE_OPTIONS}
            locked={identityLocked}
          />
          <CountrySelect label="Страна выдачи" value={documentCountry} onChange={setDocumentCountry} locked={identityLocked} />
          <FieldInput label="Серия (если применимо)" value={documentSeries} onChange={setDocumentSeries} placeholder="Необязательно" locked={identityLocked} />
          <FieldInput label="Номер документа" value={documentNumber} onChange={setDocumentNumber} placeholder="Номер" locked={identityLocked} />
          <DateInput label="Дата выдачи" value={issueDate} onChange={setIssueDate} locked={identityLocked} />
          <DateInput label="Дата окончания действия (если применимо)" value={expiryDate} onChange={setExpiryDate} locked={identityLocked} />
          <FieldInput label="Кем выдан" value={issuingAuthority} onChange={setIssuingAuthority} placeholder="Необязательно" locked={identityLocked} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Номер телефона</h2>
            {data.phoneVerified && <VerifiedBadge />}
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="tel"
              value={data.phone}
              readOnly
              placeholder="Указан при регистрации"
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl pl-9 pr-4 py-3 outline-none border border-gray-200 dark:border-gray-600"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-300">
            Телефон из аккаунта. Изменить его в этой анкете нельзя.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Электронная почта</h2>
            {data.emailVerified && data.email ? <VerifiedBadge /> : null}
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={data.email}
              readOnly
              placeholder="Почта не привязана"
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl pl-9 pr-4 py-3 outline-none border border-gray-200 dark:border-gray-600"
            />
          </div>
          {data.email && data.emailVerified ? (
            <p className="text-xs text-gray-500 dark:text-gray-300">
              {data.email} · Подтверждена ✓
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-300">
              Почта из аккаунта. Привязка выполняется отдельно и не через эту анкету.
            </p>
          )}
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3 rounded-xl"
          >
            {data.email && data.emailVerified ? 'Изменить почту' : 'Привязать почту'}
          </button>
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={!saveEnabled}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-base"
        >
          {saving ? (
            <>
              <Clock3 className="w-5 h-5 animate-spin" />
              Сохранение...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Сохранить данные
            </>
          )}
        </button>
          </>
        ) : null}
      </div>
      <EmailBindModal
        open={emailOpen}
        verifiedEmail={data.emailVerified ? data.email : ''}
        onClose={() => setEmailOpen(false)}
        onVerified={() => {
          setEmailOpen(false);
          void loadQuestionnaire();
        }}
      />
    </div>
  );
}

function fieldClass(locked?: boolean): string {
  return `w-full ${locked ? 'bg-gray-200 dark:bg-gray-700/70' : 'bg-gray-100 dark:bg-gray-700'} text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors`;
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  locked?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">{label}</label>
      <input
        type="text"
        value={value}
        readOnly={locked}
        onChange={(e) => {
          if (!locked) onChange(e.target.value);
        }}
        placeholder={placeholder}
        className={fieldClass(locked)}
      />
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">{label}</label>
      <input
        type="date"
        value={value}
        readOnly={locked}
        onChange={(e) => {
          if (!locked) onChange(e.target.value);
        }}
        className={fieldClass(locked)}
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  locked?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">{label}</label>
      <select
        value={value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass(locked)}
      >
        {options.map((option) => (
          <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function CountrySelect({
  label,
  value,
  onChange,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  locked?: boolean;
}) {
  const known = PLAYER_COUNTRY_OPTIONS.some((option) => option.value === value);
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">{label}</label>
      <select
        value={value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className={fieldClass(locked)}
      >
        {PLAYER_COUNTRY_OPTIONS.map((option) => (
          <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
        ))}
        {!known && value ? <option value={value}>{value}</option> : null}
      </select>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-600/15 px-2 py-1 rounded-full">
      <CheckCircle2 className="w-3 h-3" />
      Подтверждён
    </span>
  );
}
