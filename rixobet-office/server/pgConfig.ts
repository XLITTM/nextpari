import type { PoolConfig } from 'pg';
import { readPoolerTarget } from './env';
import { SUPABASE_DATABASE_CA } from './supabase-ca';

export function officePoolConfig(databaseUrl: string): PoolConfig {
  const target = new URL(databaseUrl);
  const local = target.hostname === 'localhost' || target.hostname === '127.0.0.1';
  if (!local && !readPoolerTarget(databaseUrl).ok) throw new Error('DATABASE_TARGET_FORBIDDEN');

  // Pass parsed fields instead of connectionString: pg's sslmode parser would
  // replace the explicit CA options. The saved URL keeps sslmode=require.
  return {
    host: target.hostname,
    port: Number(target.port || '5432'),
    database: decodeURIComponent(target.pathname.slice(1)),
    user: decodeURIComponent(target.username),
    password: decodeURIComponent(target.password),
    max: 2,
    application_name: 'ryxobet-office',
    connectionTimeoutMillis: 5000,
    ssl: local ? undefined : {
      ca: SUPABASE_DATABASE_CA,
      rejectUnauthorized: true,
      servername: target.hostname,
      minVersion: 'TLSv1.2',
    },
  };
}
