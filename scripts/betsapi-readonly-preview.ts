import { runBetsApiPreviewCli } from '../server/betsapi/previewCli.ts';

const code = await runBetsApiPreviewCli();
process.exit(code);
