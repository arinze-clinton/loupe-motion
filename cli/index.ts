import kleur from 'kleur';
import { init } from './commands/init.js';
import { scan } from './commands/scan.js';

async function main() {
  const [, , cmd, ...rest] = process.argv;

  switch (cmd) {
    case 'init':
      await init({ cwd: process.cwd() });
      break;
    case 'scan': {
      const json = rest.includes('--json');
      await scan({ cwd: process.cwd(), json });
      break;
    }
    case '--version':
    case '-v':
      // Inlined at build time so we don't ship package.json.
      console.log('loupe v0.1.0');
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
  loupe ${kleur.cyan('scan')} [--json]   Report which animations are timeline-bound
  loupe ${kleur.cyan('--version')}       Print version
  loupe ${kleur.cyan('--help')}          Print this message
`);
}

main().catch((err) => {
  console.error(kleur.red('loupe error:'), err);
  process.exit(1);
});
