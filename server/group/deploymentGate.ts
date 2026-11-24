export function groupDeploymentDecision(pathname: string, deployment: string | undefined): 'allow' | 'deny' {
  if (deployment !== '1') return 'allow';
  if (!pathname.startsWith('/api/')) return 'allow';
  if (pathname === '/api/group-owner' || pathname.startsWith('/api/group-owner/')) return 'allow';
  return 'deny';
}

export function providerOfficeDeploymentDecision(pathname: string, deployment: string | undefined): 'allow' | 'deny' {
  if (deployment !== '1') return 'allow';
  if (!pathname.startsWith('/api/')) return 'allow';
  if (pathname === '/api/provider-office' || pathname.startsWith('/api/provider-office/')) return 'allow';
  return 'deny';
}

export function apiDeploymentDecision(
  pathname: string,
  env: { GROUP_OWNER_DEPLOYMENT?: string; PROVIDER_OFFICE_DEPLOYMENT?: string },
): 'allow' | 'deny' {
  if (groupDeploymentDecision(pathname, env.GROUP_OWNER_DEPLOYMENT) === 'deny') return 'deny';
  if (providerOfficeDeploymentDecision(pathname, env.PROVIDER_OFFICE_DEPLOYMENT) === 'deny') return 'deny';
  return 'allow';
}
