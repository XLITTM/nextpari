import {
  collectEnvironmentIsolationFailures,
  EnvironmentIsolationError,
  resolveRuntimeRole,
} from './environmentIsolation.js';

function main(): number {
  try {
    const role = resolveRuntimeRole(process.env);
    const failures = collectEnvironmentIsolationFailures(process.env);
    if (failures.length > 0) {
      for (const code of failures) console.error(code);
      return 1;
    }
    if (role !== 'staging') {
      console.error('STAGING_CHECK_ROLE_REQUIRED');
      return 2;
    }
    console.log('STAGING_ENVIRONMENT_OK');
    return 0;
  } catch (error) {
    console.error(error instanceof EnvironmentIsolationError ? error.code : 'STAGING_CHECK_FAILED');
    return 1;
  }
}

process.exit(main());
