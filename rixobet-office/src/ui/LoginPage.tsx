import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { landingPath } from '../access/guard';
import type { FailureReason } from '../api/http';
import { BRAND } from '../brand';
import { validateFields } from '../forms/validate';
import { useAuth } from '../auth/AuthContext';
import { Wordmark } from './mark';
import { StatusBanner } from './Status';

const fields = [
  { name: 'email', label: 'Почта', kind: 'email', required: true, autoComplete: 'username' },
  { name: 'password', label: 'Пароль', kind: 'password', required: true, autoComplete: 'current-password' },
] as const;

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<FailureReason | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = 'Вход · RIXO BET Office';
  }, []);

  useEffect(() => {
    if (!auth.session) return;
    const next = new URLSearchParams(location.search).get('next');
    navigate(landingPath(auth.session, next), { replace: true });
  }, [auth.session, location.search, navigate]);

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateFields(fields, { email, password });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFailure(null);
      return;
    }
    setPending(true);
    const result = await auth.login(email.trim(), password);
    setPending(false);
    if (!result.ok) {
      setChallengeId(null);
      setFailure(result.reason);
      return;
    }
    setFailure(null);
    setChallengeId(result.challengeId);
  }

  async function onMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeId) return;
    const nextErrors = validateFields(
      [{ name: 'code', label: 'Код MFA', kind: 'mfa', required: true }],
      { code },
    );
    setErrors(nextErrors);
    if (nextErrors.code) return;
    setPending(true);
    const result = await auth.confirmMfa(challengeId, code.trim());
    setPending(false);
    if (!result.ok) setFailure(result.reason);
  }

  const banner = failure ?? (auth.ready && auth.connection === 'disconnected' ? 'disconnected' : null);

  return (
    <main className="rx-login">
      <section className="rx-login-card">
        <Wordmark />
        <p className="rx-kicker">
          {BRAND.name} Office · бренд {BRAND.code} · {BRAND.staffDomain}
        </p>
        <h1>Вход для сотрудников</h1>
        <p className="rx-lead">Сессия выдаётся сервером после пароля и кода MFA. Роль из адреса не принимается.</p>
        {!auth.ready ? <p className="rx-wait">Проверка сессии…</p> : null}
        {banner ? (
          <StatusBanner
            reason={banner}
            detail={
              banner === 'invalid'
                ? 'Сервер не выдал сессию. Вход не выполнен.'
                : undefined
            }
          />
        ) : null}
        <form onSubmit={onLogin} noValidate>
          <div className="rx-field">
            <label htmlFor="login-email">Почта</label>
            <input
              id="login-email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
            {errors.email ? (
              <small id="login-email-error" role="alert">
                {errors.email}
              </small>
            ) : null}
          </div>
          <div className="rx-field">
            <label htmlFor="login-password">Пароль</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
            />
            {errors.password ? (
              <small id="login-password-error" role="alert">
                {errors.password}
              </small>
            ) : null}
          </div>
          <button className="rx-btn" type="submit" disabled={pending}>
            {pending && !challengeId ? 'Проверка…' : 'Войти'}
          </button>
        </form>
        {challengeId ? (
          <form onSubmit={onMfa} noValidate>
            <p className="rx-lead">Сервер запросил код MFA. Сессия ещё не выдана.</p>
            <div className="rx-field">
              <label htmlFor="login-mfa">Код MFA</label>
              <input
                id="login-mfa"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                maxLength={6}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? 'login-mfa-error' : undefined}
              />
              {errors.code ? (
                <small id="login-mfa-error" role="alert">
                  {errors.code}
                </small>
              ) : null}
            </div>
            <button className="rx-btn" type="submit" disabled={pending}>
              Подтвердить код
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
