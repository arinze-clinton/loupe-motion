import kleur from 'kleur';
import { init } from './commands/init.js';
import { scan } from './commands/scan.js';
import { refactor } from './commands/refactor.js';
import { check } from './commands/check.js';
import { skills } from './commands/skills.js';
import { resolve } from './commands/resolve.js';
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
    case 'resolve': {
      const json = rest.includes('--json');
      const sIdx = rest.indexOf('--scene');
      const scene = sIdx !== -1 ? rest[sIdx + 1] : undefined;
      await resolve({ cwd: process.cwd(), json, scene });
      break;
    }
    case 'refactor':
      await refactor({ cwd: process.cwd() });
      break;
    case 'skills':
      await skills({
        cwd: process.cwd(),
        force: rest.includes('--force'),
        dryRun: rest.includes('--dry-run'),
      });
      break;
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
  loupe ${kleur.cyan('resolve')} [--scene id] [--json]  Emit resolved timing/curve facts for conversion
  loupe ${kleur.cyan('refactor')}        Interactive walk-through to make animations scrubbable (no AI needed)
  loupe ${kleur.cyan('skills')}          Install or refresh the bundled Claude skills (--force, --dry-run)
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
