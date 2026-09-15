import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Lock, Mail, Phone, Smartphone, Zap } from 'lucide-react';
import {
  signInPlayer,
  signUpPlayer,
  signUpPlayerByPhone,
  signUpPlayerOneClick,
  startPlayerPasswordRecovery,
  validatePlayerEmail,
  validatePlayerPassword,
  validatePlayerPasswordReset,
  validatePlayerPhone,
  verifyPlayerPasswordRecovery,
  resetPlayerPasswordWithTicket,
  PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE,
  PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE,
  PLAYER_PASSWORD_RECOVERY_START_MESSAGE,
  PlayerPasswordRecoveryError,
} from '../lib/playerAuth';
import { authBackView, authShowsBack, oneClickCopyAllText, planOneClickContinue, type AuthView } from '../lib/authUiFlow';
import { PLAYER_REGISTRATION_CURRENCY_OPTIONS } from '../lib/playerCurrency';
import { AuthHero, AUTH_SPORTS_BG } from '../components/auth/AuthHero';
import { AuthSheet } from '../components/auth/AuthSheet';
import { AuthInput } from '../components/auth/AuthInput';
import { RegistrationMethodCard } from '../components/auth/RegistrationMethodCard';

interface AuthScreenProps {
  onAuthSuccess: () => void | Promise<void>;
  notice?: string | null;
}

function playerFacingAuthError(raw: string): string {
  const text = raw.toLowerCase();
  if (
    text.includes('invalid credentials')
    || text.includes('invalid login')
    || text.includes('auth_failed')
    || text.includes('неверный логин')
  ) {
    return 'Неверный логин или пароль.';
  }
  if (text.includes('password too short')) return 'Пароль слишком короткий';
  if (text.includes('invalid phone')) return 'Неверный номер телефона';
  if (text.includes('invalid email')) return 'Неверный email';
  if (text.includes('age required')) return 'Подтвердите, что вам есть 18 лет';
  if (text.includes('currency required')) return 'Выберите валюту счёта';
  if (text.includes('registration failed')) return 'Не удалось зарегистрироваться с этими данными.';
  if (/[а-яё]/i.test(raw)) return raw;
  return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

function PrimaryButton({
  children,
  disabled,
}: {
  children: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-2 flex h-[60px] w-full items-center justify-center rounded-[18px] bg-brand-600 text-[17px] font-extrabold text-white transition-transform active:scale-[0.99] disabled:opacity-50 max-[480px]:mt-1 max-[480px]:h-14"
    >
      {children}
    </button>
  );
}

function CurrencyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-bold text-slate-600">Валюта счёта</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[52px] w-full rounded-[16px] border border-slate-200 bg-white px-4 text-[16px] font-semibold text-ink-900"
      >
        <option value="">Выберите валюту</option>
        {PLAYER_REGISTRATION_CURRENCY_OPTIONS.map((row) => (
          <option key={row.value} value={row.value}>{row.label}</option>
        ))}
      </select>
    </label>
  );
}

function AgeCheck({
  agreed,
  onToggle,
}: {
  agreed: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={agreed}
        onChange={onToggle}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-2 focus:ring-brand-600/30"
      />
      <span className="text-[13px] font-medium leading-snug text-ink-600">
        Я подтверждаю, что мне есть 18 лет
      </span>
    </label>
  );
}

function LoginModeSwitch({
  mode,
  onChange,
}: {
  mode: 'identifier' | 'phone';
  onChange: (mode: 'identifier' | 'phone') => void;
}) {
  return (
    <div className="grid grid-cols-2 rounded-[16px] bg-[#F4F6FA] p-1">
      <button
        type="button"
        onClick={() => onChange('identifier')}
        className={`h-11 rounded-[12px] text-[14px] font-extrabold transition-colors max-[480px]:h-10 ${
          mode === 'identifier' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500'
        }`}
      >
        Email / ID
      </button>
      <button
        type="button"
        onClick={() => onChange('phone')}
        className={`h-11 rounded-[12px] text-[14px] font-extrabold transition-colors max-[480px]:h-10 ${
          mode === 'phone' ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-500'
        }`}
      >
        Телефон
      </button>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-[#E6EBF2] bg-[#F8FAFC] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-500">{label}</p>
          <p className="mt-1 break-all text-[16px] font-extrabold text-ink-900">{value}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-bold text-brand-600"
        >
          <Copy className="h-4 w-4" />
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
    </div>
  );
}

export function AuthScreen({ onAuthSuccess, notice: initialNotice }: AuthScreenProps) {
  const [view, setView] = useState<AuthView>('login');
  const [loginMode, setLoginMode] = useState<'identifier' | 'phone'>('identifier');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [regCurrency, setRegCurrency] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialNotice ?? '');
  const [busy, setBusy] = useState(false);
  const [issuedId, setIssuedId] = useState('');
  const [issuedSecret, setIssuedSecret] = useState('');
  const [issuedAuthenticated, setIssuedAuthenticated] = useState(false);
  const [copied, setCopied] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'start' | 'code' | 'reset'>('start');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryChallengeId, setRecoveryChallengeId] = useState('');
  const [recoveryTicket, setRecoveryTicket] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoveryCooldown, setRecoveryCooldown] = useState(0);
  const [recoveryInfo, setRecoveryInfo] = useState('');

  useEffect(() => {
    if (recoveryCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setRecoveryCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [recoveryCooldown]);

  const resetRecovery = () => {
    setRecoveryStep('start');
    setRecoveryIdentifier('');
    setRecoveryCode('');
    setRecoveryChallengeId('');
    setRecoveryTicket('');
    setRecoveryPassword('');
    setRecoveryConfirm('');
    setRecoveryCooldown(0);
    setRecoveryInfo('');
  };

  const go = (next: AuthView) => {
    setError('');
    setNotice('');
    setCopied('');
    if (next !== 'register-one-click-result') {
      setIssuedId('');
      setIssuedSecret('');
      setIssuedAuthenticated(false);
    }
    resetRecovery();
    setView(next);
  };

  const goLoginWithNotice = (message: string) => {
    setError('');
    setView('login');
    setNotice(message);
  };

  const handleLogin = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const session = loginMode === 'phone'
        ? await signInPlayer({ mode: 'phone', phone: loginPhone, password: loginPassword })
        : await signInPlayer({
          mode: 'identifier',
          identifier: loginIdentifier.trim(),
          password: loginPassword,
        });
      if (!session?.user) {
        setError('Неверный логин или пароль.');
        return;
      }
      await onAuthSuccess();
    } catch (err) {
      setError(playerFacingAuthError(err instanceof Error ? err.message : 'invalid credentials'));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailRegister = async () => {
    setError('');
    setNotice('');
    if (!agreed) {
      setError('Подтвердите, что вам есть 18 лет');
      return;
    }
    if (!regCurrency) {
      setError('Выберите валюту счёта');
      return;
    }
    setBusy(true);
    try {
      const result = await signUpPlayer({
        email: regEmail.trim(),
        password: regPassword,
        ageConfirmed: true,
        currency: regCurrency,
      });
      if (result.needsEmailConfirmation || !result.session?.user) {
        goLoginWithNotice('Подтвердите Email, затем войдите.');
        return;
      }
      await onAuthSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid credentials';
      if (message === 'email confirmation required') {
        goLoginWithNotice('Подтвердите Email, затем войдите.');
        return;
      }
      setError(playerFacingAuthError(message));
    } finally {
      setBusy(false);
    }
  };

  const handlePhoneRegister = async () => {
    setError('');
    setNotice('');
    if (!agreed) {
      setError('Подтвердите, что вам есть 18 лет');
      return;
    }
    if (!regCurrency) {
      setError('Выберите валюту счёта');
      return;
    }
    setBusy(true);
    try {
      const result = await signUpPlayerByPhone({
        phone: regPhone,
        password: regPassword,
        ageConfirmed: true,
        currency: regCurrency,
      });
      if (!result.session?.user) {
        setError('Не удалось зарегистрироваться с этими данными.');
        return;
      }
      await onAuthSuccess();
    } catch (err) {
      setError(playerFacingAuthError(err instanceof Error ? err.message : 'registration failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleOneClick = async () => {
    setError('');
    if (!agreed || busy) return;
    if (!regCurrency) {
      setError('Выберите валюту счёта');
      return;
    }
    setBusy(true);
    try {
      const result = await signUpPlayerOneClick({ ageConfirmed: true, currency: regCurrency });
      setIssuedId(result.playerId);
      setIssuedSecret(result.generatedPassword);
      setIssuedAuthenticated(result.authenticated);
      setView('register-one-click-result');
    } catch (err) {
      setError(playerFacingAuthError(err instanceof Error ? err.message : 'registration failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleOneClickContinue = async () => {
    const plan = planOneClickContinue({
      authenticated: issuedAuthenticated,
      playerId: issuedId,
    });
    setIssuedSecret('');
    setIssuedAuthenticated(false);
    setCopied('');
    if (plan.kind === 'enter-app') {
      setIssuedId('');
      await onAuthSuccess();
      return;
    }
    setLoginMode('identifier');
    setLoginIdentifier(plan.playerId);
    setLoginPassword('');
    setIssuedId('');
    setError('');
    setView('login');
    setNotice(plan.notice);
  };

  const handleRecoveryStart = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await startPlayerPasswordRecovery(recoveryIdentifier);
      setRecoveryChallengeId(result.challengeId);
      setRecoveryCooldown(result.resendAfterSeconds);
      setRecoveryInfo(PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
      setRecoveryStep('code');
    } catch (err) {
      setRecoveryInfo(PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
      setRecoveryStep('code');
      void err;
    } finally {
      setBusy(false);
    }
  };

  const handleRecoveryResend = async () => {
    if (busy || recoveryCooldown > 0) return;
    setError('');
    setBusy(true);
    try {
      const result = await startPlayerPasswordRecovery(recoveryIdentifier);
      if (result.challengeId) setRecoveryChallengeId(result.challengeId);
      setRecoveryCooldown(result.resendAfterSeconds);
      setRecoveryInfo(PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
    } catch {
      setRecoveryInfo(PLAYER_PASSWORD_RECOVERY_START_MESSAGE);
      setRecoveryCooldown(60);
    } finally {
      setBusy(false);
    }
  };

  const handleRecoveryVerify = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await verifyPlayerPasswordRecovery({
        challengeId: recoveryChallengeId,
        code: recoveryCode,
      });
      setRecoveryTicket(result.resetTicket);
      setRecoveryCode('');
      setRecoveryStep('reset');
    } catch (err) {
      setError(err instanceof PlayerPasswordRecoveryError ? err.message : PLAYER_PASSWORD_RECOVERY_INVALID_CODE_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const handleRecoveryReset = async () => {
    setError('');
    const local = validatePlayerPasswordReset({
      newPassword: recoveryPassword,
      confirmPassword: recoveryConfirm,
    });
    if (!local.ok) {
      setError(local.message);
      return;
    }
    setBusy(true);
    try {
      const result = await resetPlayerPasswordWithTicket({
        resetTicket: recoveryTicket,
        newPassword: recoveryPassword,
        confirmPassword: recoveryConfirm,
      });
      resetRecovery();
      goLoginWithNotice(result.message || PLAYER_PASSWORD_RECOVERY_DONE_MESSAGE);
    } catch (err) {
      setError(err instanceof PlayerPasswordRecoveryError ? err.message : 'Не удалось изменить пароль. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
    } catch {
      setCopied('');
    }
  };

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="flex h-10 w-10 items-center justify-center text-slate-400"
      aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
    >
      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );

  return (
    <div
      className={
        view === 'login'
          ? 'relative min-h-[100svh] h-[100svh] overflow-x-hidden overflow-y-auto overscroll-y-contain'
          : 'relative min-h-[100svh] overflow-x-hidden overflow-y-auto'
      }
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `url('${AUTH_SPORTS_BG}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
        }}
      />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/35" />

      <div
        className={
          view === 'login'
            ? 'relative z-10 mx-auto flex h-full min-h-0 max-w-[560px] flex-col'
            : 'relative z-10 mx-auto flex min-h-[100svh] max-w-[560px] flex-col'
        }
      >
        <AuthHero
          showBack={authShowsBack(view)}
          onBack={() => go(authBackView(view))}
        />

        <AuthSheet>
          {error && (
            <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-red-600">{error}</p>
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2.5">
              <p className="text-[13px] font-semibold text-emerald-800">{notice}</p>
            </div>
          )}

          {view === 'login' && (
            <form
              onSubmit={(event) => { event.preventDefault(); if (!busy) void handleLogin(); }}
              className="space-y-4 max-[480px]:space-y-3 [@media(max-width:480px)_and_(max-height:740px)]:space-y-2"
            >
              <h2 className="text-[34px] font-extrabold leading-none tracking-tight text-ink-900 max-[480px]:text-[28px]">Авторизация</h2>
              <LoginModeSwitch mode={loginMode} onChange={setLoginMode} />
              {loginMode === 'identifier' ? (
                <AuthInput
                  label="Email или ID игрока"
                  icon={<Mail className="h-5 w-5" />}
                  placeholder="Email или ID игрока"
                  value={loginIdentifier}
                  onChange={setLoginIdentifier}
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  name="username"
                />
              ) : (
                <AuthInput
                  label="Номер телефона"
                  icon={<Phone className="h-5 w-5" />}
                  placeholder="Номер телефона"
                  value={loginPhone}
                  onChange={setLoginPhone}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                />
              )}
              <AuthInput
                label="Пароль"
                icon={<Lock className="h-5 w-5" />}
                placeholder="Пароль"
                value={loginPassword}
                onChange={setLoginPassword}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                trailing={passwordToggle}
              />
              <PrimaryButton disabled={busy}>{busy ? 'Вход…' : 'Войти'}</PrimaryButton>
              <button
                type="button"
                onClick={() => go('forgot-password')}
                className="block w-full pt-1 text-center text-[15px] font-bold text-brand-600 max-[480px]:pt-0"
              >
                Забыли пароль?
              </button>
              <p className="pt-2 text-center text-[14px] font-medium text-slate-500 max-[480px]:pt-0">
                Нет аккаунта?{' '}
                <button type="button" onClick={() => go('register-menu')} className="font-bold text-brand-600">
                  Зарегистрируйтесь
                </button>
              </p>
            </form>
          )}

          {view === 'register-menu' && (
            <div>
              <h2 className="mb-5 text-[34px] font-extrabold leading-none tracking-tight text-ink-900">Регистрация</h2>
              <div className="space-y-3">
                <RegistrationMethodCard
                  icon={<Zap className="h-5 w-5" strokeWidth={2.3} />}
                  title="В один клик"
                  description="Быстрая регистрация за несколько секунд"
                  onClick={() => go('register-one-click')}
                />
                <RegistrationMethodCard
                  icon={<Smartphone className="h-5 w-5" strokeWidth={2.3} />}
                  title="По телефону"
                  description="Регистрация по номеру мобильного телефона"
                  onClick={() => go('register-phone')}
                />
                <RegistrationMethodCard
                  icon={<Mail className="h-5 w-5" strokeWidth={2.3} />}
                  title="По Email"
                  description="Классическая регистрация через электронную почту"
                  onClick={() => go('register-email')}
                />
              </div>
              <p className="mt-6 text-center text-[14px] font-medium text-slate-500">
                Уже есть аккаунт?{' '}
                <button type="button" onClick={() => go('login')} className="font-bold text-brand-600">
                  Войти
                </button>
              </p>
            </div>
          )}

          {view === 'register-one-click' && (
            <form
              onSubmit={(event) => { event.preventDefault(); if (!busy) void handleOneClick(); }}
              className="space-y-4"
            >
              <h2 className="text-[30px] font-extrabold leading-tight tracking-tight text-ink-900">
                Регистрация в один клик
              </h2>
              <p className="text-[15px] font-medium leading-snug text-slate-500">
                Мы создадим ID игрока и безопасный пароль автоматически.
              </p>
              <CurrencyPicker value={regCurrency} onChange={setRegCurrency} />
              <AgeCheck agreed={agreed} onToggle={() => setAgreed(!agreed)} />
              <PrimaryButton disabled={busy || !agreed}>
                {busy ? 'Создание…' : 'Создать аккаунт'}
              </PrimaryButton>
            </form>
          )}

          {view === 'register-one-click-result' && (
            <div className="space-y-4">
              <h2 className="text-[30px] font-extrabold leading-tight tracking-tight text-ink-900">
                Аккаунт создан
              </h2>
              <p className="text-[15px] font-medium leading-snug text-slate-500">
                Сохраните эти данные сейчас. Пароль больше не будет показан.
              </p>
              <CredentialRow
                label="ID игрока"
                value={issuedId}
                copied={copied === 'id'}
                onCopy={() => void copyText('id', issuedId)}
              />
              <CredentialRow
                label="Пароль"
                value={issuedSecret}
                copied={copied === 'secret'}
                onCopy={() => void copyText('secret', issuedSecret)}
              />
              <button
                type="button"
                onClick={() => void copyText('all', oneClickCopyAllText(issuedId, issuedSecret))}
                className="w-full text-center text-[15px] font-bold text-brand-600"
              >
                {copied === 'all' ? 'Скопировано' : 'Скопировать всё'}
              </button>
              <button
                type="button"
                onClick={() => { void handleOneClickContinue(); }}
                className="flex h-[60px] w-full items-center justify-center rounded-[18px] bg-brand-600 text-[16px] font-extrabold text-white"
              >
                Продолжить
              </button>
            </div>
          )}

          {view === 'register-email' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                const emailError = validatePlayerEmail(regEmail.trim());
                if (emailError) {
                  setError(playerFacingAuthError(emailError));
                  return;
                }
                const passwordError = validatePlayerPassword(regPassword);
                if (passwordError) {
                  setError(playerFacingAuthError(passwordError));
                  return;
                }
                if (!agreed) {
                  setError('Подтвердите, что вам есть 18 лет');
                  return;
                }
                void handleEmailRegister();
              }}
              className="space-y-4"
            >
              <h2 className="text-[34px] font-extrabold leading-none tracking-tight text-ink-900">Регистрация</h2>
              <AuthInput
                label="Email"
                icon={<Mail className="h-5 w-5" />}
                placeholder="Email"
                value={regEmail}
                onChange={setRegEmail}
                type="email"
                inputMode="email"
                autoComplete="email"
              />
              <AuthInput
                label="Пароль"
                icon={<Lock className="h-5 w-5" />}
                placeholder="Пароль"
                value={regPassword}
                onChange={setRegPassword}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                trailing={passwordToggle}
              />
              <CurrencyPicker value={regCurrency} onChange={setRegCurrency} />
              <AgeCheck agreed={agreed} onToggle={() => setAgreed(!agreed)} />
              <PrimaryButton disabled={busy || !agreed}>
                {busy ? 'Регистрация…' : 'Зарегистрироваться'}
              </PrimaryButton>
            </form>
          )}

          {view === 'register-phone' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                const phoneError = validatePlayerPhone(regPhone);
                if (phoneError) {
                  setError(playerFacingAuthError(phoneError));
                  return;
                }
                const passwordError = validatePlayerPassword(regPassword);
                if (passwordError) {
                  setError(playerFacingAuthError(passwordError));
                  return;
                }
                if (!agreed) {
                  setError('Подтвердите, что вам есть 18 лет');
                  return;
                }
                void handlePhoneRegister();
              }}
              className="space-y-4"
            >
              <h2 className="text-[34px] font-extrabold leading-none tracking-tight text-ink-900">Регистрация</h2>
              <AuthInput
                label="Номер телефона"
                icon={<Phone className="h-5 w-5" />}
                placeholder="Номер телефона"
                value={regPhone}
                onChange={setRegPhone}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />
              <AuthInput
                label="Пароль"
                icon={<Lock className="h-5 w-5" />}
                placeholder="Пароль"
                value={regPassword}
                onChange={setRegPassword}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                trailing={passwordToggle}
              />
              <CurrencyPicker value={regCurrency} onChange={setRegCurrency} />
              <AgeCheck agreed={agreed} onToggle={() => setAgreed(!agreed)} />
              <PrimaryButton disabled={busy || !agreed}>
                {busy ? 'Регистрация…' : 'Зарегистрироваться'}
              </PrimaryButton>
            </form>
          )}

          {view === 'forgot-password' && (
            <div>
              <h2 className="text-[30px] font-extrabold leading-tight tracking-tight text-ink-900">
                Восстановление пароля
              </h2>
              {recoveryStep === 'start' && (
                <form
                  onSubmit={(event) => { event.preventDefault(); if (!busy) void handleRecoveryStart(); }}
                  className="mt-4 space-y-4"
                >
                  <AuthInput
                    label="ID игрока или подтверждённая почта"
                    icon={<Mail className="h-5 w-5" />}
                    placeholder="ID игрока или подтверждённая почта"
                    value={recoveryIdentifier}
                    onChange={setRecoveryIdentifier}
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                  />
                  <PrimaryButton disabled={busy}>{busy ? 'Отправка…' : 'Получить код'}</PrimaryButton>
                </form>
              )}
              {recoveryStep === 'code' && (
                <form
                  onSubmit={(event) => { event.preventDefault(); if (!busy) void handleRecoveryVerify(); }}
                  className="mt-4 space-y-4"
                >
                  <p className="text-[15px] font-medium leading-snug text-slate-500">
                    {recoveryInfo || PLAYER_PASSWORD_RECOVERY_START_MESSAGE}
                  </p>
                  <AuthInput
                    label="Код из письма"
                    icon={<Lock className="h-5 w-5" />}
                    placeholder="6-значный код"
                    value={recoveryCode}
                    onChange={setRecoveryCode}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  <PrimaryButton disabled={busy}>{busy ? 'Проверка…' : 'Подтвердить код'}</PrimaryButton>
                  <button
                    type="button"
                    disabled={busy || recoveryCooldown > 0}
                    onClick={() => { void handleRecoveryResend(); }}
                    className="block w-full pt-1 text-center text-[15px] font-bold text-brand-600 disabled:opacity-50"
                  >
                    {recoveryCooldown > 0 ? `Отправить код снова (${recoveryCooldown})` : 'Отправить код снова'}
                  </button>
                </form>
              )}
              {recoveryStep === 'reset' && (
                <form
                  onSubmit={(event) => { event.preventDefault(); if (!busy) void handleRecoveryReset(); }}
                  className="mt-4 space-y-4"
                >
                  <AuthInput
                    label="Новый пароль"
                    icon={<Lock className="h-5 w-5" />}
                    placeholder="Новый пароль"
                    value={recoveryPassword}
                    onChange={setRecoveryPassword}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    trailing={passwordToggle}
                  />
                  <AuthInput
                    label="Повторите новый пароль"
                    icon={<Lock className="h-5 w-5" />}
                    placeholder="Повторите новый пароль"
                    value={recoveryConfirm}
                    onChange={setRecoveryConfirm}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                  />
                  <PrimaryButton disabled={busy}>{busy ? 'Сохранение…' : 'Изменить пароль'}</PrimaryButton>
                </form>
              )}
            </div>
          )}
        </AuthSheet>
      </div>
    </div>
  );
}
