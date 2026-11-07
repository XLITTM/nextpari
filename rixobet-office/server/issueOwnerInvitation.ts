import { hashSecret, randomToken } from './crypto';
import { readOfficeConfig } from './env';
import { openPostgresOffice } from './postgres';
import type { OfficeRepository } from './repository';

export const FIRST_OWNER_LOGIN = 'guwanch@owner.com';
export const BOOTSTRAP_CONFIRM = 'issue-first-owner';
export const INVITATION_TTL_MS = 60 * 60 * 1000;

export const BOOTSTRAP_PROCEDURE = [
  'First-owner activation is an administrator command, not a public office route.',
  'guwanch@owner.com is the owner login identifier. It is not a mailbox and this command does not send email.',
  'Do not commit or print RYXOBET_OFFICE_DATABASE_URL or RYXOBET_OFFICE_SESSION_PEPPER.',
  'From rixobet-office, with those two values present only in the administrator shell, run:',
  'npm run issue-owner-invitation -- --confirm issue-first-owner',
  'The command prints one token. Deliver that token privately, then close the shell.',
  'The token expires in 60 minutes, is stored only as a digest, and works once.',
  'The owner opens /activate, enters the login and token, and chooses a new password. MFA is optional.',
  'This command does not activate the owner and refuses an account that is already active.',
  'Account recovery stays with an administrator. There is no public password reset.',
].join('\n');

export interface IssuedInvitation {
  login: string;
  token: string;
  expiresAt: string;
}

export function parseBootstrapArgs(argv: readonly string[]): { ok: true } | { ok: false; reason: 'help' | 'confirm' } {
  if (argv.length === 1 && argv[0] === '--help') return { ok: false, reason: 'help' };
  if (argv.length === 2 && argv[0] === '--confirm' && argv[1] === BOOTSTRAP_CONFIRM) return { ok: true };
  return { ok: false, reason: 'confirm' };
}

export async function issueFirstOwnerInvitation(
  repository: OfficeRepository,
  pepper: string,
  now: number,
): Promise<IssuedInvitation | null> {
  const token = randomToken(32);
  const expiresAt = new Date(now + INVITATION_TTL_MS).toISOString();
  const staff = await repository.issueOwnerInvitation(FIRST_OWNER_LOGIN, hashSecret(pepper, token), expiresAt);
  if (!staff) return null;
  if (staff.email.toLowerCase() !== FIRST_OWNER_LOGIN || staff.role !== 'owner' || staff.status !== 'invited') return null;
  if (staff.brandCode !== '002' || staff.authUserId !== null || staff.identityVerifiedAt !== null) return null;
  if (staff.passwordHash !== null || staff.mfaSecret !== null || staff.invitationConsumedAt !== null) return null;
  if (staff.invitationTokenHash !== hashSecret(pepper, token) || staff.invitationExpiresAt !== expiresAt) return null;
  return { login: FIRST_OWNER_LOGIN, token, expiresAt };
}

export async function runIssueFirstOwner(
  env: Readonly<Record<string, string | undefined>>,
  argv: readonly string[],
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
): Promise<number> {
  const parsed = parseBootstrapArgs(argv);
  if (!parsed.ok) {
    stderr.write(`${BOOTSTRAP_PROCEDURE}\n`);
    return parsed.reason === 'help' ? 0 : 1;
  }
  const config = readOfficeConfig(env);
  if (!config.ok) {
    stderr.write('Office database credentials are not available to this command.\n');
    return 1;
  }
  let repository: OfficeRepository | null = null;
  try {
    repository = await openPostgresOffice(config.config);
    const issued = await issueFirstOwnerInvitation(repository, config.config.sessionPepper, Date.now());
    if (!issued) {
      stderr.write('The invited owner could not be issued a token. The account was not activated.\n');
      return 1;
    }
    stdout.write(`login: ${issued.login}\nexpiresAt: ${issued.expiresAt}\ntoken: ${issued.token}\n`);
    return 0;
  } catch {
    stderr.write('The office database could not issue a token. The account was not activated.\n');
    return 1;
  } finally {
    await repository?.end();
  }
}
