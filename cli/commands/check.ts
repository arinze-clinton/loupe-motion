import kleur from 'kleur';
import {
  checkInstall,
  detectInvoker,
  detectPackageManager,
  fetchLatestNpmVersion,
  installCommand,
  loupeInvocation,
  semverCompare,
  warnOnInvokerMismatch,
  LOUPE_VERSION,
} from '../util.js';

/**
 * `loupe check` — quick status report for users who already have
 * Loupe installed and want to confirm their version / see if there's
 * an update.
 *
 *   - Installed version (from node_modules)
 *   - Declared range (from package.json)
 *   - Latest on npm (best-effort network fetch)
 *   - Upgrade hint if behind
 *
 * Fails gracefully when Loupe isn't installed — prints a clear
 * "not installed here" message and suggests `loupe init`.
 */
type CheckOptions = {
  cwd: string;
  /** Skip the npm registry hit. Useful in CI or offline. */
  offline?: boolean;
};

export async function check({ cwd, offline }: CheckOptions): Promise<void> {
  console.log();
  console.log(kleur.bold().cyan('Loupe ✦ ') + 'install check');
  console.log();

  const info = await checkInstall(cwd);
  const pm = await detectPackageManager(cwd);
  warnOnInvokerMismatch(kleur, pm, detectInvoker(), 'check');

  if (!info.declared && !info.resolved) {
    console.log(kleur.yellow('  Loupe is not installed in this project.'));
    console.log();
    console.log(
      `  Add it with ${kleur.cyan(installCommand(pm))} ` +
        `then run ${kleur.cyan(loupeInvocation(pm, 'init', 'local'))}.`,
    );
    console.log();
    return;
  }

  const installed = info.installedVersion ?? kleur.dim('not resolved');
  const declared = info.declaredRange ?? kleur.dim('not declared');
  console.log(`  Installed: ${kleur.bold(installed)}`);
  console.log(
    `  Declared:  ${kleur.bold(String(declared))}` +
      (info.declaredIn
        ? kleur.dim(`  (${info.declaredIn})`)
        : ''),
  );
  console.log(`  CLI:       ${kleur.bold(LOUPE_VERSION)}`);

  if (offline) {
    console.log();
    console.log(kleur.dim('  (offline — skipped registry check)'));
    console.log();
    return;
  }

  const latest = await fetchLatestNpmVersion();
  if (!latest) {
    console.log();
    console.log(kleur.dim('  Could not reach registry — try again when online.'));
    console.log();
    return;
  }

  console.log(`  Latest:    ${kleur.bold(latest)}`);
  console.log();

  if (info.installedVersion) {
    const cmp = semverCompare(info.installedVersion, latest);
    if (cmp < 0) {
      const upgradeCmd =
        installCommand(pm, false).replace(
          '@arinze-clinton/loupe',
          '@arinze-clinton/loupe@latest',
        );
      console.log(
        kleur.yellow('  ↑ Update available.') +
          ' Run ' +
          kleur.cyan(upgradeCmd) +
          '.',
      );
    } else if (cmp === 0) {
      console.log(kleur.green('  ✓ You are on the latest version.'));
    } else {
      console.log(
        kleur.dim(
          '  You are ahead of the registry (likely a local/dev build).',
        ),
      );
    }
  }
  console.log();
}
