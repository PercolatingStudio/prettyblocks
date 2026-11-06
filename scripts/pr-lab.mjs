#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manual = new Map([
  [255, 'Revue spécifique requise : ne pas merger en l’état.'],
  [311, 'Revue spécifique requise : ne pas merger en l’état.'],
  [335, 'Revue spécifique requise : ne pas merger en l’état.'],
  [346, 'Hors périmètre / obsolète.'],
  [211, 'V2 : hors périmètre V3.'],
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout || result.status}`);
  }
  return result.stdout.trim();
}

function options(argv) {
  const result = { command: argv.shift() || 'help' };
  if (['test', 'down'].includes(result.command)) result.target = argv.shift();
  while (argv.length) {
    const flag = argv.shift();
    if (flag === '--keep') result.keep = true;
    else if (['--repository', '--output', '--ps82-port', '--ps91-port'].includes(flag)) {
      const value = argv.shift();
      if (!value || value.startsWith('--')) throw new Error(`Missing value: ${flag}`);
      result[flag.slice(2)] = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return result;
}

function repository(opts) {
  const candidate = opts.repository || process.env.PR_LAB_REPOSITORY
    || run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], { cwd: harness });
  if (!/^[\w.-]+\/[\w.-]+$/.test(candidate)) throw new Error('Expected repository in owner/name format.');
  return candidate;
}

// Candidate code runs only inside Docker. Do not pass credentials or Actions
// command files to the build/test subprocesses, or persist a Git credential helper.
function testEnvironment(extra) {
  const allowed = ['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'XDG_RUNTIME_DIR', 'LANG'];
  return Object.fromEntries([
    ...allowed.filter(key => process.env[key]).map(key => [key, process.env[key]]),
    ...Object.entries(extra),
  ]);
}

function logged(command, args, cwd, logfile, env) {
  console.log(`Running ${basename(logfile)}…`);
  const fd = openSync(logfile, 'w');
  const result = spawnSync(command, args, { cwd, env, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  if (result.error || result.status !== 0) {
    throw new Error(`${basename(logfile)} failed (${result.error?.message || result.status}). See ${logfile}`);
  }
}

function removeArtifactSymlinks(directory) {
  // Container logs are untrusted. Artifact upload must never follow their
  // symlinks into the host filesystem.
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) rmSync(path);
    else if (stat.isDirectory()) removeArtifactSymlinks(path);
  }
}

const escape = value => String(value).replace(/[\r\n|<>`]/g, ' ');

function report(output, state) {
  writeFileSync(join(output, 'result.json'), JSON.stringify(state, null, 2) + '\n');
  const lines = [
    `# PrettyBlocks V3 — PR #${state.number}`,
    '',
    `PR : ${state.url || ''}`,
    `Résultat : **${state.status}**`,
    '',
    `- Head testé : \`${state.head || 'non résolu'}\``,
    `- Base main : \`${state.base || 'non résolue'}\``,
    `- Merge local testé : \`${state.merge || 'non créé'}\``,
    `- Harness : \`${state.harness}\`${state.harnessModified ? ' (modifications locales)' : ''}`,
    `- ZIP : \`${state.archive ? basename(state.archive) : 'non construit'}\``,
    `- SHA-256 : \`${state.checksum || 'non calculé'}\``,
    '',
    '## Décision',
    '',
    state.error ? escape(state.error) : state.status === 'passed'
      ? 'Les contrôles techniques passent. La revue du code et des comportements modifiés reste nécessaire avant une approbation humaine.'
      : 'Tests en cours : aucune validation disponible.',
    '',
    ...(state.warnings || []).map(warning => `- ${escape(warning)}`),
    '',
    '## Contrôles automatisés',
    '',
    'Merge dans main, construction Vite/Composer, racine prettyblocks/, manifeste et assets, installation native du ZIP et activation sur PS8.2/PHP8.1 et PS9.1/PHP8.5, syntaxe PHP, routes, front/iframe et page de connexion BO.',
    '',
    'Les smoke tests ne couvrent pas tous les parcours éditeur, les thèmes tiers, le multiboutique ou une migration d’une boutique existante. Aucun avis APPROVE, merge ou publication n’est envoyé.',
  ];
  if (state.kept) lines.push('', '## Prévisualisation locale', '',
    `- PS8 : http://localhost:${state.ps82}/admin-dev/`,
    `- PS9 : http://localhost:${state.ps91}/admin-dev/`,
    '- Login : demo@prestashop.com / prestashop_demo',
    `- Arrêt : node scripts/pr-lab.mjs down '${output.replaceAll("'", "'\\''")}'`);
  writeFileSync(join(output, 'report.md'), lines.join('\n') + '\n');
}

async function main() {
  const opts = options(process.argv.slice(2));
  if (opts.command === 'help') {
    console.log('Usage:\n  node scripts/pr-lab.mjs list [--repository owner/name]\n  node scripts/pr-lab.mjs test NUMBER [--keep] [--output DIR] [--ps82-port 8182] [--ps91-port 8191] [--repository owner/name]\n  node scripts/pr-lab.mjs down REPORT_DIR');
    return;
  }
  if (opts.command === 'down') {
    const output = resolve(opts.target || '');
    const state = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8'));
    const workspaceName = basename(state.workspace || '');
    if (
      !/^prettyblocks-pr-\d+-[a-zA-Z0-9]+$/.test(workspaceName)
      || state.project !== workspaceName.toLowerCase()
      || !lstatSync(state.workspace).isDirectory()
      || lstatSync(state.workspace).isSymbolicLink()
      || dirname(realpathSync(state.workspace)) !== realpathSync(tmpdir())
    ) {
      throw new Error('Invalid PR lab state; refusing cleanup.');
    }
    run('docker', ['compose', '-p', state.project, '-f', join(state.workspace, 'docker/compose.yml'), '-f', join(state.workspace, 'docker/compose.release-test.yml'), 'down', '-v', '--remove-orphans'], {
      env: testEnvironment({ PRETTYBLOCKS_RELEASE_ARCHIVE_PATH: state.archive, PS82_PORT: state.ps82, PS91_PORT: state.ps91 }),
    });
    rmSync(state.workspace, { recursive: true, force: true });
    state.kept = false;
    report(output, state);
    console.log('PR test containers, volumes and temporary checkout removed. Report preserved.');
    return;
  }
  const repo = repository(opts);
  if (opts.command === 'list') {
    const prs = JSON.parse(run('gh', ['api', '--paginate', `repos/${repo}/pulls?state=open&per_page=100`, '--slurp'])).flat();
    console.log('| PR | Auteur | Base | Titre | Revue |\n| --- | --- | --- | --- | --- |');
    for (const pr of prs) console.log(`| [#${pr.number}](${pr.html_url}) | ${escape(pr.user.login)} | ${escape(pr.base.ref)} | ${escape(pr.title)} | ${manual.get(pr.number) || (pr.base.ref !== 'main' ? 'Hors V3' : pr.draft ? 'Brouillon' : 'À tester / revue humaine')} |`);
    return;
  }
  if (opts.command !== 'test' || !/^\d+$/.test(opts.target || '')) throw new Error('Expected test NUMBER, list, down DIR or help.');
  const number = Number(opts.target);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Expected a positive PR number.');
  const output = resolve(opts.output || join(harness, 'work/pr-lab', `pr-${number}-${Date.now()}`));
  mkdirSync(output, { recursive: true });
  if (existsSync(join(output, 'result.json'))) throw new Error('Output already contains a run. Choose a new directory.');
  const state = {
    number, repository: repo, status: 'running', warnings: [],
    harness: run('git', ['rev-parse', 'HEAD'], { cwd: harness }),
    harnessModified: Boolean(run('git', ['status', '--porcelain', '--', 'scripts', 'docker', '.dockerignore'], { cwd: harness })),
    ps82: opts['ps82-port'] || '8182', ps91: opts['ps91-port'] || '8191', kept: false,
  };
  if (![state.ps82, state.ps91].every(port => /^\d+$/.test(port) && Number(port) > 1023 && Number(port) <= 65535) || Number(state.ps82) === Number(state.ps91)) throw new Error('Use two different ports between 1024 and 65535.');
  let workspace;
  try {
    const pr = JSON.parse(run('gh', ['api', `repos/${repo}/pulls/${number}`]));
    writeFileSync(join(output, 'pr.json'), JSON.stringify(pr, null, 2) + '\n');
    state.url = pr.html_url;
    state.head = pr.head.sha;
    if (pr.state !== 'open' || pr.base.ref !== 'main') throw new Error('Only open PRs targeting main are supported for V3.');
    if (process.env.PR_LAB_EXPECTED_HEAD && state.head !== process.env.PR_LAB_EXPECTED_HEAD) throw new Error('PR head changed since this workflow event. Rerun the latest check.');
    if (manual.has(number)) state.warnings.push(manual.get(number));
    if (pr.draft) state.warnings.push('PR en brouillon : aucune validation proposée.');
    if (pr.user.login.includes('dependabot')) state.warnings.push('Dépendances : vérifier les changelogs et la compatibilité, notamment les versions majeures.');
    workspace = mkdtempSync(join(tmpdir(), `prettyblocks-pr-${number}-`));
    state.workspace = workspace;
    state.project = `prettyblocks-pr-${number}-${basename(workspace).split('-').at(-1).toLowerCase()}`;
    run('git', ['init', '-q', workspace]);
    const git = args => run('git', ['-c', 'credential.helper=', '-C', workspace, ...args]);
    git(['remote', 'add', 'origin', `https://github.com/${repo}.git`]);
    git(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main', `+refs/pull/${number}/head:refs/remotes/origin/pr`]);
    state.base = git(['rev-parse', 'refs/remotes/origin/main']);
    if (process.env.PR_LAB_EXPECTED_BASE && state.base !== process.env.PR_LAB_EXPECTED_BASE) throw new Error('main changed since this workflow event. Rerun validation against current main.');
    if (git(['rev-parse', 'refs/remotes/origin/pr']) !== state.head) throw new Error('PR changed while fetching. Rerun validation.');
    git(['checkout', '--detach', '-q', state.base]);
    try {
      git(['-c', 'user.name=PrettyBlocks PR lab', '-c', 'user.email=pr-lab@localhost', 'merge', '--no-edit', '--no-ff', 'refs/remotes/origin/pr']);
    } catch (error) {
      writeFileSync(join(output, 'conflicts.txt'), git(['diff', '--name-only', '--diff-filter=U']) + '\n');
      throw new Error(`Merge conflict with current main. See conflicts.txt. ${error.message}`);
    }
    state.merge = git(['rev-parse', 'HEAD']);
    writeFileSync(join(output, 'changes.patch'), git(['diff', state.base, 'HEAD']) + '\n');
    const files = git(['diff', '--name-only', state.base, 'HEAD']);
    writeFileSync(join(output, 'files.txt'), files + '\n');
    if (!files) state.warnings.push('Le merge ne change aucun fichier : contribution potentiellement déjà intégrée.');
    if (/^(\.github\/|docker\/|scripts\/|\.dockerignore)/m.test(files)) state.warnings.push('La PR modifie l’infrastructure : revue manuelle obligatoire. Les tests utilisent le harness de confiance, pas les scripts proposés par la PR.');
    if (/(^|\/)(upgrade\/|sql\/)|^prettyblocks.php/m.test(files)) state.warnings.push('Installation/migration potentiellement modifiée : tester aussi une mise à jour sur une copie de boutique.');
    // Replace infrastructure completely, including symlinks, before running any
    // host command. Module sources remain those of the proposed merge.
    for (const path of ['scripts', 'docker', 'tests', '.dockerignore']) {
      rmSync(join(workspace, path), { recursive: true, force: true });
      cpSync(join(harness, path), join(workspace, path), { recursive: true, dereference: true });
    }
    rmSync(join(workspace, '.env'), { force: true });
    const env = testEnvironment({
      PRETTYBLOCKS_TEST_PROJECT: state.project,
      PRETTYBLOCKS_TEST_LOG_DIR: join(output, 'logs'),
      PRETTYBLOCKS_KEEP_STACK: opts.keep ? '1' : '0',
      PS82_RELEASE_PORT: state.ps82, PS91_RELEASE_PORT: state.ps91,
    });
    report(output, state);
    logged('bash', [join(workspace, 'scripts/build-release.sh')], workspace, join(output, 'build.log'), env);
    const version = readFileSync(join(workspace, 'prettyblocks.php'), 'utf8').match(/\$this->version\s*=\s*'([^']+)'/)?.[1];
    if (!version || !/^[\w.+-]+$/.test(version)) throw new Error('Invalid module version.');
    const archive = join(workspace, 'dist', `prettyblocks-${version}.zip`);
    state.archive = archive;
    state.checksum = createHash('sha256').update(readFileSync(archive)).digest('hex');
    cpSync(archive, join(output, basename(archive)));
    report(output, state);
    logged('bash', [join(workspace, 'scripts/test-release.sh'), archive], workspace, join(output, 'test.log'), env);
    state.status = 'passed';
    state.kept = Boolean(opts.keep);
  } catch (error) {
    state.status = 'failed';
    state.error = error.message;
    process.exitCode = 1;
  } finally {
    removeArtifactSymlinks(output);
    report(output, state);
    if (workspace && !state.kept) rmSync(workspace, { recursive: true, force: true });
  }
  console.log(`Result: ${state.status}. Report: ${join(output, 'report.md')}`);
  if (state.kept) console.log(`BO: http://localhost:${state.ps82}/admin-dev/ | http://localhost:${state.ps91}/admin-dev/`);
  if (state.error) console.error(state.error);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
