import { next } from '@vercel/functions';
import { apiDeploymentDecision } from './server/group/deploymentGate.js';

export const config = {
  matcher: '/api/:path*',
};

export default function middleware(request: Request): Response {
  const pathname = new URL(request.url).pathname;
  if (apiDeploymentDecision(pathname, {
    GROUP_OWNER_DEPLOYMENT: process.env.GROUP_OWNER_DEPLOYMENT,
    PROVIDER_OFFICE_DEPLOYMENT: process.env.PROVIDER_OFFICE_DEPLOYMENT,
  }) === 'deny') {
    return new Response(JSON.stringify({ ok: false, error: 'NOT_FOUND' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
  return next();
}
