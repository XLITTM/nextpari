import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { attachCashierControlHttp } from '../server/cashier/cashierControlHttp';
import { attachManagerControlHttp } from '../server/manager/managerControlHttp';
import { attachOwnerControlHttp } from '../server/owner/ownerControlHttp';
import { attachCashierAuthHttp } from '../server/staff/cashierAuthHttp';
import { attachManagerAuthHttp } from '../server/staff/managerAuthHttp';
import { attachOwnerAuthHttp } from '../server/staff/ownerAuthHttp';
import { attachOwnerStaffHttp } from '../server/staff/httpHandler';

function attachOwnerStaff(server: ViteDevServer) {
  server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    void attachOwnerAuthHttp(req, res)
      .then((handledAuth) => {
        if (handledAuth) return true;
        return attachManagerAuthHttp(req, res);
      })
      .then((handled) => {
        if (handled) return true;
        return attachCashierAuthHttp(req, res);
      })
      .then((handled) => {
        if (handled) return true;
        return attachManagerControlHttp(req, res);
      })
      .then((handled) => {
        if (handled) return true;
        return attachOwnerControlHttp(req, res);
      })
      .then((handled) => {
        if (handled) return true;
        return attachCashierControlHttp(req, res);
      })
      .then((handled) => {
        if (handled) return true;
        return attachOwnerStaffHttp(req, res);
      })
      .then((handled) => {
        if (!handled) next();
      })
      .catch(() => {
        if (res.writableEnded) return;
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'INTERNAL_ERROR' }));
      });
  });
}

export function ownerStaffOnboardingPlugin(): Plugin {
  return {
    name: 'owner-staff-onboarding',
    configureServer: attachOwnerStaff,
    configurePreviewServer: attachOwnerStaff,
  };
}
