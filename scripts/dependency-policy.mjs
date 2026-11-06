import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const context = 'dependency-policy';
export const exceptionLabel = 'dependencies:manual-approved';
const manifests = new Set(['_dev/package.json', 'composer.json']);
const locks = new Set(['_dev/package-lock.json', '_dev/yarn.lock', 'composer.lock']);
const companion = path => path.startsWith('.github/workflows/') || path === '.github/dependabot.yml';

export function dependencyFields(path, manifest) {
  const fields = path === 'composer.json'
    ? ['require', 'require-dev', 'conflict', 'replace', 'provide', 'repositories', 'minimum-stability', 'prefer-stable']
    : ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides', 'resolutions'];
  const result = Object.fromEntries(fields.filter(key => manifest?.[key] !== undefined).map(key => [key, manifest[key]]));
  if (path === 'composer.json' && manifest?.config?.platform) result.platform = manifest.config.platform;
  return result;
}

const stable = value => JSON.stringify(value, function (key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
});

export function dependenciesChanged(path, before, after) {
  return stable(dependencyFields(path, before)) !== stable(dependencyFields(path, after));
}

export function evaluate(pr, files, changedManifests = []) {
  const official = pr.user?.login === 'dependabot[bot]' && pr.user?.type === 'Bot'
    && pr.head?.repo?.full_name === pr.base?.repo?.full_name;
  const dependencyChange = files.some(file => locks.has(file)) || changedManifests.length > 0;
  const dependencyOnly = dependencyChange && files.every(file => manifests.has(file) || locks.has(file) || companion(file));
  if (pr.base?.ref !== 'main') return { state: 'success', reason: 'Hors du périmètre V3/main.', dependencyOnly };
  if (official) return { state: 'success', reason: 'Dependabot officiel du dépôt.', dependencyOnly };
  if (!dependencyOnly) return { state: 'success', reason: dependencyChange ? 'PR mixte : revue fonctionnelle habituelle requise.' : 'Aucune mise à jour isolée de dépendances.', dependencyOnly };
  if (pr.labels?.some(label => label.name === exceptionLabel)) return { state: 'success', reason: 'Exception de maintenance explicitement autorisée.', dependencyOnly };
  return { state: 'failure', reason: 'Dépendances seules : utiliser le Dependabot officiel ou demander une exception.', dependencyOnly };
}

async function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--pr');
  const number = args[index + 1];
  if (index < 0 || !/^[1-9]\d*$/.test(number || '')) throw new Error('Usage: node scripts/dependency-policy.mjs --pr NUMBER [--dry-run]');
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('GITHUB_REPOSITORY must be owner/name.');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  async function api(path, method = 'GET', data) {
    const response = await fetch(`https://api.github.com/${path}`, {
      method, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status}: ${method} ${path}`);
    return response.json();
  }
  const prefix = `repos/${repository}`;
  const pr = await api(`${prefix}/pulls/${number}`);
  if (pr.state !== 'open') { console.log('PR closed; no status written.'); return; }
  const expected = process.env.EXPECTED_HEAD_SHA;
  if (expected && pr.head.sha !== expected) { console.log('Stale event: head changed; no status written.'); return; }
  if (pr.base.repo.full_name.toLowerCase() !== repository.toLowerCase()) throw new Error('Unexpected base repository.');
  const dryRun = args.includes('--dry-run');
  const writeStatus = async (state, description) => {
    if (dryRun) return;
    await api(`${prefix}/statuses/${pr.head.sha}`, 'POST', {
      state, context, description: description.slice(0, 140),
      ...(process.env.GITHUB_RUN_ID ? { target_url: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}` } : {}),
    });
  };
  await writeStatus('pending', 'Vérification de la politique de dépendances.');
  try {
    const files = [];
    for (let page = 1; page <= 30; page++) {
      const batch = await api(`${prefix}/pulls/${number}/files?per_page=100&page=${page}`);
      files.push(...batch);
      if (batch.length < 100) break;
    }
    if (files.length !== pr.changed_files) throw new Error('Incomplete PR file list; refusing to pass policy.');
    const changedManifests = [];
    for (const file of files.filter(file => manifests.has(file.filename))) {
      async function manifest(side, absent) {
        if (absent) return {};
        const content = await api(`repos/${side.repo.full_name}/contents/${file.filename}?ref=${side.sha}`);
        if (content.encoding !== 'base64' || content.type !== 'file') throw new Error('Invalid manifest response.');
        return JSON.parse(Buffer.from(content.content, 'base64').toString('utf8'));
      }
      const before = await manifest(pr.base, file.status === 'added');
      const after = await manifest(pr.head, file.status === 'removed');
      if (dependenciesChanged(file.filename, before, after)) changedManifests.push(file.filename);
    }
    // Read labels again immediately before evaluating the exception. This also
    // avoids writing an older event onto a newer head.
    const latest = await api(`${prefix}/pulls/${number}`);
    if (latest.head.sha !== pr.head.sha || latest.state !== 'open') throw new Error('PR changed during policy evaluation; rerun.');
    const result = evaluate(latest, files.map(file => file.filename), changedManifests);
    const summary = `## Dependency policy — PR #${number}\n\n- Head : \`${pr.head.sha}\`\n- Résultat : **${result.state}**\n- ${result.reason}\n\nVoir CONTRIBUTING.md. Aucun code contributeur exécuté, aucune fermeture ou fusion automatique.\n`;
    console.log(JSON.stringify({ number: Number(number), head: pr.head.sha, ...result }, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    if (dryRun) return;
    await writeStatus(result.state, result.reason);
    if (result.state === 'failure') process.exitCode = 1;
  } catch (error) {
    await writeStatus('error', 'Analyse incomplète : consulter les logs et relancer.');
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
