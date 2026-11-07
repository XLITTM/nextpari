export function groupDeploymentDecision(pathname: string, deployment: string | undefined): 'allow' | 'deny' {
  if (deployment !== '1') return 'allow';
  if (!pathname.startsWith('/api/')) return 'allow';
  if (pathname === '/api/group-owner' || pathname.startsWith('/api/group-owner/')) return 'allow';
  return 'deny';
}
