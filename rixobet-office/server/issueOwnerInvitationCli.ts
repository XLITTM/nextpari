import { runIssueFirstOwner } from './issueOwnerInvitation';

const code = await runIssueFirstOwner(process.env, process.argv.slice(2), process.stdout, process.stderr);
process.exit(code);
