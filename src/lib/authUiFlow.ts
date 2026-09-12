export type AuthView =
  | 'login'
  | 'register-menu'
  | 'register-email'
  | 'register-phone'
  | 'register-one-click'
  | 'register-one-click-result'
  | 'forgot-password';

export function authShowsBack(view: AuthView): boolean {
  return view !== 'login';
}

export function authBackView(view: AuthView): AuthView {
  if (view === 'register-one-click-result') return 'register-menu';
  if (
    view === 'register-email'
    || view === 'register-phone'
    || view === 'register-one-click'
  ) {
    return 'register-menu';
  }
  return 'login';
}

export const ONE_CLICK_LOGIN_NOTICE = 'Аккаунт создан. Войдите по ID и сохранённому паролю.';

export type OneClickContinuePlan =
  | { kind: 'enter-app' }
  | { kind: 'login-with-id'; playerId: string; notice: string };

export function planOneClickContinue(input: {
  authenticated: boolean;
  playerId: string;
}): OneClickContinuePlan {
  if (input.authenticated) return { kind: 'enter-app' };
  return {
    kind: 'login-with-id',
    playerId: input.playerId,
    notice: ONE_CLICK_LOGIN_NOTICE,
  };
}

export function oneClickCopyAllText(playerId: string, password: string): string {
  return `ID игрока: ${playerId}\nПароль: ${password}`;
}
