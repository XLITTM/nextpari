import { useState, useEffect } from 'react';
import {
  ChevronLeft, Save, Phone, Mail, CheckCircle2, Clock3,
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { useProfile } from '../ProfileContext';

interface PersonalDataScreenProps {
  onBack: () => void;
}

export function PersonalDataScreen({ onBack }: PersonalDataScreenProps) {
  const { showToast } = useToast();
  const { personalData, refresh, save } = useProfile();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [passport, setPassport] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setFirstName(personalData.first_name);
    setLastName(personalData.last_name);
    setMiddleName(personalData.middle_name);
    setBirthDate(personalData.birth_date);
    setPassport(personalData.passport);
  }, [personalData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleName: middleName.trim(),
        birthDate,
        passport: passport.trim(),
      });
      await refresh();
      showToast('Данные сохранены');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Не удалось сохранить профиль');
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
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">ФИО</h2>
          <FieldInput label="Фамилия" value={lastName} onChange={setLastName} placeholder="Иванов" />
          <FieldInput label="Имя" value={firstName} onChange={setFirstName} placeholder="Иван" />
          <FieldInput label="Отчество" value={middleName} onChange={setMiddleName} placeholder="Иванович" />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Дата рождения</h2>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Номер телефона</h2>
            {personalData.phone_verified && <VerifiedBadge />}
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="tel"
              value={personalData.phone}
              readOnly
              placeholder="Указан при регистрации"
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl pl-9 pr-4 py-3 outline-none border border-gray-200 dark:border-gray-600"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-300">
            Телефон из регистрации. SMS-подтверждение пока не подключено.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Электронная почта</h2>
            {personalData.email_verified && <VerifiedBadge />}
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={personalData.email}
              readOnly
              placeholder="Указан при регистрации"
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl pl-9 pr-4 py-3 outline-none border border-gray-200 dark:border-gray-600"
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-300">
            Email из аккаунта. Подтверждение только по фактическому состоянию Auth.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Паспортные данные</h2>
          <FieldInput label="Серия и номер паспорта" value={passport} onChange={setPassport} placeholder="AB1234567" />
        </div>

        <button
          onClick={() => void handleSave()}
          disabled={saving}
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
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-300 mb-1.5 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
      />
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
