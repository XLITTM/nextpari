import { X509Certificate } from 'node:crypto';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { officePoolConfig } from './pgConfig';
import { SUPABASE_DATABASE_CA } from './supabase-ca';

const host = 'aws-0-eu-central-1.pooler.supabase.com';
const user = 'ryxobet_office_api.lsmfdhenmceiammyptzu';
const password = 'fixture:@/%?#[] password';
const url = `postgresql://${user}:${encodeURIComponent(password)}@${host}:6543/postgres?sslmode=require`;

describe('office PostgreSQL TLS configuration', () => {
  it('preserves the encoded credential and pins the pooler without passing sslmode to pg', () => {
    const config = officePoolConfig(url);
    expect(config.connectionString).toBeUndefined();
    expect(config).toMatchObject({ host, port: 6543, database: 'postgres', user, password, max: 2 });
    expect(config.connectionTimeoutMillis).toBe(5000);
    expect(config.ssl).toMatchObject({ ca: SUPABASE_DATABASE_CA, rejectUnauthorized: true, servername: host, minVersion: 'TLSv1.2' });
    const client = new Client(config) as unknown as { connectionParameters: { ssl: unknown; password: string } };
    expect(client.connectionParameters.ssl).toMatchObject({ ca: SUPABASE_DATABASE_CA, rejectUnauthorized: true });
    expect(client.connectionParameters.password).toBe(password);
  });

  it('uses the independently downloaded Supabase root rather than a peer-supplied certificate', () => {
    const certificate = new X509Certificate(SUPABASE_DATABASE_CA);
    expect(certificate.ca).toBe(true);
    expect(certificate.subject).toContain('CN=Supabase Root 2021 CA');
    expect(certificate.fingerprint256).toBe('80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  });

  it.each([
    url.replace(host, 'another.example'),
    url.replace(user, 'postgres.lsmfdhenmceiammyptzu'),
    url.replace(':6543/', ':5432/'),
    url.replace('sslmode=require', 'sslmode=disable'),
    url + '&sslrootcert=untrusted.crt',
  ])('rejects an unapproved remote target or SSL override', (value) => {
    expect(() => officePoolConfig(value)).toThrow('DATABASE_TARGET_FORBIDDEN');
  });

  it('keeps the existing loopback development behavior', () => {
    expect(officePoolConfig('postgresql://fixture:fixture@127.0.0.1:5432/fixture').ssl).toBeUndefined();
  });
});
