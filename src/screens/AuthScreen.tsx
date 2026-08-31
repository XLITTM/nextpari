import { useState } from 'react';
import { Eye, EyeOff, Mail, Phone, Lock, Check } from 'lucide-react';
import { signInPlayer, signUpPlayer } from '../lib/playerAuth';

interface AuthScreenProps {
  onAuthSuccess: () => void | Promise<void>;
}

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const session = await signInPlayer(loginEmail, loginPassword);
      if (!session?.user) {
        setError('invalid credentials');
        return;
      }
      await onAuthSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'invalid credentials');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    setNotice('');
    if (!agreed) {
      setError('Подтвердите, что вам есть 18 лет');
      return;
    }
    setBusy(true);
    try {
      const result = await signUpPlayer({
        email: regEmail,
        password: regPassword,
        phone: regPhone,
      });
      if (result.needsEmailConfirmation || !result.session?.user) {
        setNotice('Подтвердите email, затем войдите.');
        setTab('login');
        return;
      }
      await onAuthSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid credentials';
      if (message === 'email confirmation required') {
        setNotice('Подтвердите email, затем войдите.');
        setTab('login');
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-ink-900 via-ink-850 to-ink-950 relative overflow-hidden">
      <div className="absolute top-[-120px] left-[-80px] w-72 h-72 rounded-full bg-brand-600/20 blur-3xl" />
      <div className="absolute bottom-[-100px] right-[-60px] w-64 h-64 rounded-full bg-accent-500/15 blur-3xl" />

      <div className="shrink-0 pt-14 pb-6 flex flex-col items-center gap-2 relative z-10">
        <img src="/logo.png" alt="Nextpari" className="w-14 h-14 object-cover rounded-2xl" />
        <h1 className="text-2xl font-extrabold text-white tracking-tight">NextPari</h1>
        <p className="text-xs text-ink-400 font-medium">Ставки на спорт онлайн</p>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 relative z-10">
        <div className="w-full max-w-sm">
          <div className="bg-white dark:bg-ink-800 rounded-2xl shadow-2xl shadow-black/30 overflow-hidden animate-slide-up">
            <div className="flex border-b border-ink-100 dark:border-ink-700">
              <button
                onClick={() => { setTab('login'); setError(''); setNotice(''); }}
                className={`flex-1 py-3.5 text-sm font-bold transition-colors relative ${
                  tab === 'login'
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-ink-500 dark:text-ink-400'
                }`}
              >
                Вход
                {tab === 'login' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600" />
                )}
              </button>
              <button
                onClick={() => { setTab('register'); setError(''); setNotice(''); }}
                className={`flex-1 py-3.5 text-sm font-bold transition-colors relative ${
                  tab === 'register'
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-ink-500 dark:text-ink-400'
                }`}
              >
                Регистрация
                {tab === 'register' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600" />
                )}
              </button>
            </div>

            <div className="p-5">
              {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              {notice && (
                <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">{notice}</p>
                </div>
              )}

              {tab === 'login' ? (
                <LoginForm
                  loginEmail={loginEmail}
                  setLoginEmail={setLoginEmail}
                  loginPassword={loginPassword}
                  setLoginPassword={setLoginPassword}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  busy={busy}
                  onSubmit={() => void handleLogin()}
                />
              ) : (
                <RegisterForm
                  regPhone={regPhone}
                  setRegPhone={setRegPhone}
                  regEmail={regEmail}
                  setRegEmail={setRegEmail}
                  regPassword={regPassword}
                  setRegPassword={setRegPassword}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  agreed={agreed}
                  setAgreed={setAgreed}
                  busy={busy}
                  onSubmit={() => void handleRegister()}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="shrink-0 pb-6 text-center text-xs text-ink-500 relative z-10">
        Играйте ответственно. 18+
      </p>
    </div>
  );
}

function LoginForm({
  loginEmail, setLoginEmail,
  loginPassword, setLoginPassword,
  showPassword, setShowPassword,
  busy,
  onSubmit,
}: {
  loginEmail: string;
  setLoginEmail: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit(); }}
      className="space-y-4"
    >
      <Field
        icon={<Mail className="w-4 h-4" />}
        placeholder="Email"
        value={loginEmail}
        onChange={setLoginEmail}
        type="email"
      />
      <Field
        icon={<Lock className="w-4 h-4" />}
        placeholder="Пароль"
        value={loginPassword}
        onChange={setLoginPassword}
        type={showPassword ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm py-3.5 rounded-xl transition-colors active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? 'Вход…' : 'Войти'}
      </button>
    </form>
  );
}

function RegisterForm({
  regPhone, setRegPhone,
  regEmail, setRegEmail,
  regPassword, setRegPassword,
  showPassword, setShowPassword,
  agreed, setAgreed,
  busy,
  onSubmit,
}: {
  regPhone: string;
  setRegPhone: (v: string) => void;
  regEmail: string;
  setRegEmail: (v: string) => void;
  regPassword: string;
  setRegPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit(); }}
      className="space-y-4"
    >
      <Field
        icon={<Phone className="w-4 h-4" />}
        placeholder="Номер телефона"
        value={regPhone}
        onChange={setRegPhone}
        type="tel"
      />
      <Field
        icon={<Mail className="w-4 h-4" />}
        placeholder="Email"
        value={regEmail}
        onChange={setRegEmail}
        type="email"
      />
      <Field
        icon={<Lock className="w-4 h-4" />}
        placeholder="Пароль"
        value={regPassword}
        onChange={setRegPassword}
        type={showPassword ? 'text' : 'password'}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <button
        type="button"
        onClick={() => setAgreed(!agreed)}
        className="flex items-start gap-2.5 w-full text-left"
      >
        <span className={`w-5 h-5 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
          agreed
            ? 'bg-brand-600 border-brand-600'
            : 'border-ink-300 dark:border-ink-600'
        }`}>
          {agreed && <Check className="w-3.5 h-3.5 text-white" />}
        </span>
        <span className="text-xs text-ink-600 dark:text-ink-300 leading-relaxed">
          Я подтверждаю, что мне есть 18 лет и я согласен с правилами
        </span>
      </button>

      <button
        type="submit"
        disabled={busy}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm py-3.5 rounded-xl transition-colors active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? 'Регистрация…' : 'Зарегистрироваться'}
      </button>
    </form>
  );
}

function Field({
  icon, placeholder, value, onChange, type, trailing,
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">{icon}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'tel'}
        className="w-full bg-ink-50 dark:bg-ink-700/50 border border-ink-200 dark:border-ink-700 rounded-xl pl-10 pr-10 py-3 text-sm text-ink-900 dark:text-white placeholder-ink-400 outline-none focus:border-brand-600 transition-colors"
      />
      {trailing && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
      )}
    </div>
  );
}
