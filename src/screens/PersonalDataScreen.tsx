import { useState, useEffect } from 'react';
import {
  ChevronLeft, Save, Phone, Mail, CheckCircle2, Clock3,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../ToastContext';
import { useProfile } from '../ProfileContext';
import type { PersonalData } from '../types';

interface PersonalDataScreenProps {
  onBack: () => void;
}

export function PersonalDataScreen({ onBack }: PersonalDataScreenProps) {
  const { showToast } = useToast();
  const { personalData, refresh } = useProfile();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [passport, setPassport] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const [saving, setSaving] = useState(false);

  // SMS verification flow
  const [showSmsInput, setShowSmsInput] = useState(false);
  const [smsCode, setSmsCode] = useState('');
  const [verifyingSms, setVerifyingSms] = useState(false);

  // Email verification flow
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  useEffect(() => {
    setFirstName(personalData.first_name);
    setLastName(personalData.last_name);
    setMiddleName(personalData.middle_name);
    setBirthDate(personalData.birth_date);
    setPhone(personalData.phone);
    setEmail(personalData.email);
    setPassport(personalData.passport);
    setPhoneVerified(personalData.phone_verified);
    setEmailVerified(personalData.email_verified);
  }, [personalData]);

  const handleSendSms = () => {
    if (!phone.trim()) {
      showToast('Введите номер телефона');
      return;
    }
    setShowSmsInput(true);
    showToast('Код отправлен на номер ' + phone);
  };

  const handleConfirmSms = () => {
    if (smsCode.trim().length < 4) {
      showToast('Введите код из SMS');
      return;
    }
    setVerifyingSms(true);
    setTimeout(() => {
      setVerifyingSms(false);
      setPhoneVerified(true);
      setShowSmsInput(false);
      setSmsCode('');
      showToast('Телефон подтверждён');
    }, 800);
  };

  const handleSendEmailCode = () => {
    if (!email.trim() || !email.includes('@')) {
      showToast('Введите корректный email');
      return;
    }
    setEmailCodeSent(true);
    setShowEmailInput(true);
    showToast('Код отправлен на ' + email);
  };

  const handleConfirmEmail = () => {
    if (emailCode.trim().length < 4) {
      showToast('Введите код из письма');
      return;
    }
    setVerifyingEmail(true);
    setTimeout(() => {
      setVerifyingEmail(false);
      setEmailVerified(true);
      setShowEmailInput(false);
      setEmailCode('');
      showToast('Email подтверждён');
    }, 800);
  };

  const handleSave = async () => {
    if (!lastName.trim() || !firstName.trim() || !middleName.trim()) {
      showToast('Заполните ФИО');
      return;
    }
    if (!birthDate) {
      showToast('Выберите дату рождения');
      return;
    }
    if (!phone.trim() || !phoneVerified) {
      showToast('Подтвердите номер телефона');
      return;
    }
    if (!email.trim() || !emailVerified) {
      showToast('Подтвердите email');
      return;
    }
    if (!passport.trim()) {
      showToast('Заполните паспортные данные');
      return;
    }

    setSaving(true);
    const payload: PersonalData = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      middle_name: middleName.trim(),
      birth_date: birthDate,
      phone: phone.trim(),
      phone_verified: phoneVerified,
      email: email.trim(),
      email_verified: emailVerified,
      passport: passport.trim(),
    };

    const { error } = await supabase.from('personal_data').insert(payload);
    setSaving(false);

    if (error) {
      showToast('Ошибка при сохранении');
      return;
    }

    showToast('Данные сохранены');
    refresh();
    onBack();
  };

  return (
    <div className="pt-2 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 pb-3">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-white active:scale-90 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Личные данные</h1>
      </div>

      {/* Form */}
      <div className="px-3 space-y-4">
        {/* FIO */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">ФИО</h2>
          <FieldInput label="Фамилия" value={lastName} onChange={setLastName} placeholder="Иванов" />
          <FieldInput label="Имя" value={firstName} onChange={setFirstName} placeholder="Иван" />
          <FieldInput label="Отчество" value={middleName} onChange={setMiddleName} placeholder="Иванович" />
        </div>

        {/* Birth date */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Дата рождения</h2>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
          />
        </div>

        {/* Phone */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Номер телефона</h2>
            {phoneVerified && <VerifiedBadge />}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); if (phoneVerified) setPhoneVerified(false); }}
                placeholder="+993 6X XX XX XX"
                className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl pl-9 pr-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
              />
            </div>
            {!phoneVerified && (
              <button
                onClick={handleSendSms}
                className="px-4 bg-brand-600 text-white text-sm font-bold rounded-xl active:scale-95 transition-transform whitespace-nowrap"
              >
                Подтвердить
              </button>
            )}
          </div>

          {showSmsInput && !phoneVerified && (
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                placeholder="Код из SMS"
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors text-center tracking-widest"
              />
              <button
                onClick={handleConfirmSms}
                disabled={verifyingSms}
                className="px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold rounded-xl active:scale-95 transition-transform whitespace-nowrap disabled:opacity-50"
              >
                {verifyingSms ? '...' : 'OK'}
              </button>
            </div>
          )}
        </div>

        {/* Email */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Электронная почта</h2>
            {emailVerified && <VerifiedBadge />}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailVerified) setEmailVerified(false); }}
                placeholder="example@mail.com"
                className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl pl-9 pr-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors"
              />
            </div>
            {!emailVerified && (
              <button
                onClick={handleSendEmailCode}
                className="px-4 bg-brand-600 text-white text-sm font-bold rounded-xl active:scale-95 transition-transform whitespace-nowrap"
              >
                Подтвердить
              </button>
            )}
          </div>

          {showEmailInput && !emailVerified && (
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                placeholder="Код из письма"
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-semibold rounded-xl px-4 py-3 outline-none border border-gray-200 dark:border-gray-600 focus:border-brand-600 transition-colors text-center tracking-widest"
              />
              <button
                onClick={handleConfirmEmail}
                disabled={verifyingEmail}
                className="px-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold rounded-xl active:scale-95 transition-transform whitespace-nowrap disabled:opacity-50"
              >
                {verifyingEmail ? '...' : 'OK'}
              </button>
            </div>
          )}
          {emailCodeSent && !emailVerified && !showEmailInput && (
            <button
              onClick={() => setShowEmailInput(true)}
              className="text-xs font-bold text-brand-600"
            >
              Ввести код повторно
            </button>
          )}
        </div>

        {/* Passport */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Паспортные данные</h2>
          <FieldInput label="Серия и номер паспорта" value={passport} onChange={setPassport} placeholder="AB1234567" />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
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
