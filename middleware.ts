import { next } from '@vercel/functions';
import { groupDeploymentDecision } from './server/group/deploymentGate.js';

export const config = {
  matcher: '/api/:path*',
};

export default function middleware(request: Request): Response {
  const pathname = new URL(request.url).pathname;
  if (groupDeploymentDecision(pathname, process.env.GROUP_OWNER_DEPLOYMENT) === 'deny') {
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
