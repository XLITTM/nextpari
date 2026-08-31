export function isAgentTerminalPath(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  if (host === 'agent' || host.startsWith('agent.')) return true;
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === '/agent' || hash.startsWith('/agent/')) return true;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/agent' || path.startsWith('/agent/')) return true;
  return false;
}
