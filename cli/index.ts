import kleur from 'kleur';
import { init } from './commands/init.js';
import { scan } from './commands/scan.js';
import { check } from './commands/check.js';
import { uninstall } from './commands/uninstall.js';
import { LOUPE_VERSION } from './util.js';

async function main() {
  const [, , cmd, ...rest] = process.argv;

  switch (cmd) {
    case 'init':
      await init({
        cwd: process.cwd(),
        upgradeDemo: rest.includes('--upgrade-demo'),
      });
      break;
    case 'scan': {
      const json = rest.includes('--json');
      await scan({ cwd: process.cwd(), json });
      break;
    }
    case 'check':
    case 'status':
      await check({
        cwd: process.cwd(),
        offline: rest.includes('--offline'),
      });
      break;
    case 'uninstall':
    case 'remove':
      await uninstall({
        cwd: process.cwd(),
        yes: rest.includes('--yes') || rest.includes('-y'),
      });
      break;
    case '--version':
    case '-v':
      console.log(`loupe v${LOUPE_VERSION}`);
      break;
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      console.error(kleur.red(`Unknown command: ${cmd}`));
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
${kleur.bold('Loupe')} — timeline-first motion authoring tool

${kleur.bold('Usage')}
  loupe ${kleur.cyan('init')}            Wire Loupe into your project + install the Claude skill
  loupe ${kleur.cyan('init --upgrade-demo')}  Rewrite a generated loupe-demo-scene.tsx to the latest template (with backup)
  loupe ${kleur.cyan('scan')} [--json]   Report which animations are timeline-bound
  loupe ${kleur.cyan('check')}           Show installed version + check for updates
  loupe ${kleur.cyan('uninstall')}       Remove Loupe cleanly (dep + generated files)
  loupe ${kleur.cyan('--version')}       Print version
  loupe ${kleur.cyan('--help')}          Print this message
`);
}

main().catch((err) => {
  console.error(kleur.red('loupe error:'), err);
  process.exit(1);
});
