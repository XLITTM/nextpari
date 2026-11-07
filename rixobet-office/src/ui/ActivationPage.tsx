import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { landingPath } from '../access/guard';
import { beginActivation, finishActivation } from '../api/operations';
import type { FailureReason } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { BRAND } from '../brand';
import { validateFields } from '../forms/validate';
import { Wordmark } from './mark';
import { StatusBanner } from './Status';

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

export function ActivationPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<FailureReason | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.title = 'Активация · RIXO BET Office';
  }, []);

  useEffect(() => {
    const incoming = new URLSearchParams(location.search).get('token');
    if (!incoming) return;
    setToken(incoming);
    navigate('/activate', { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    if (!auth.session) return;
    navigate(landingPath(auth.session, null), { replace: true });
  }, [auth.session, navigate]);

  async function onActivate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateFields(
      [
        { name: 'email', label: 'Почта', kind: 'email', required: true },
        { name: 'password', label: 'Пароль', kind: 'password', required: true },
      ],
      { email, password },
    );
    if (!TOKEN.test(token)) nextErrors.token = 'Укажите приглашение';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFailure(null);
      return;
    }
    setPending(true);
    const result = await beginActivation(email.trim(), token, password);
    setPending(false);
    if (!result.ok) {
      setOtpauthUri(null);
      setFailure(result.reason);
      return;
    }
    setFailure(null);
    setOtpauthUri(result.data.otpauthUri);
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateFields([{ name: 'code', label: 'Код MFA', kind: 'mfa', required: true }], { code });
    setErrors(nextErrors);
    if (nextErrors.code) return;
    setPending(true);
    const result = await finishActivation(email.trim(), code.trim());
    setPending(false);
    if (!result.ok) {
      setFailure(result.reason);
      return;
    }
    setVerified(true);
    setFailure(null);
  }

  const banner = failure ?? (auth.ready && auth.connection === 'disconnected' ? 'disconnected' : null);

  return (
    <main className="rx-login">
      <section className="rx-login-card">
        <Wordmark />
        <p className="rx-kicker">
          {BRAND.name} Office · бренд {BRAND.code}
        </p>
        <h1>Активация владельца</h1>
        <p className="rx-lead">
          Приглашение одноразовое и действует ограниченное время. Сессия появится только после отдельного входа и кода MFA.
        </p>
        {banner ? <StatusBanner reason={banner} /> : null}
        {verified ? (
          <p className="rx-lead">Личность подтверждена. Войдите с паролем и кодом MFA.</p>
        ) : (
          <form onSubmit={onActivate} noValidate>
            <div className="rx-field">
              <label htmlFor="activation-email">Почта</label>
              <input
                id="activation-email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'activation-email-error' : undefined}
              />
              {errors.email ? (
                <small id="activation-email-error" role="alert">
                  {errors.email}
                </small>
              ) : null}
            </div>
            <div className="rx-field">
              <label htmlFor="activation-token">Приглашение</label>
              <input
                id="activation-token"
                name="token"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                aria-invalid={Boolean(errors.token)}
                aria-describedby={errors.token ? 'activation-token-error' : undefined}
              />
              {errors.token ? (
                <small id="activation-token-error" role="alert">
                  {errors.token}
                </small>
              ) : null}
            </div>
            <div className="rx-field">
              <label htmlFor="activation-password">Пароль</label>
              <input
                id="activation-password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'activation-password-error' : undefined}
              />
              {errors.password ? (
                <small id="activation-password-error" role="alert">
                  {errors.password}
                </small>
              ) : null}
            </div>
            <button className="rx-btn" type="submit" disabled={pending || Boolean(otpauthUri)}>
              {pending && !otpauthUri ? 'Проверка…' : 'Продолжить'}
            </button>
          </form>
        )}
        {otpauthUri && !verified ? (
          <form onSubmit={onConfirm} noValidate>
            <p className="rx-lead">Добавьте этот адрес в приложение MFA и введите первый код. Адрес показывается один раз.</p>
            <p className="rx-fixed">{otpauthUri}</p>
            <div className="rx-field">
              <label htmlFor="activation-mfa">Код MFA</label>
              <input
                id="activation-mfa"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                maxLength={6}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? 'activation-mfa-error' : undefined}
              />
              {errors.code ? (
                <small id="activation-mfa-error" role="alert">
                  {errors.code}
                </small>
              ) : null}
            </div>
            <button className="rx-btn" type="submit" disabled={pending}>
              Подтвердить код
            </button>
          </form>
        ) : null}
        <Link className="rx-quiet" to="/login">
          Ко входу
        </Link>
      </section>
    </main>
  );
}
