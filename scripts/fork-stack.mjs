import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2] ?? 'status';
const target = process.argv[3] ?? 'upstream/main';

function exec(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

function runNpm(args) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error('Run this command through the package scripts (npm run fork:stack:verify or npm run fork:sync-upstream).');
  }
  return exec(process.execPath, [npmCli, ...args]);
}

function git(args, options) {
  return exec('git', args, options);
}

function gitText(args) {
  const result = git(args, { capture: true });
  return result.stdout.trim();
}

function requireClean() {
  const dirty = gitText(['status', '--porcelain']);
  if (dirty) throw new Error('Patch-stack operation requires a clean worktree.');
}

function branchName() {
  return gitText(['branch', '--show-current']);
}

function short(ref) {
  return gitText(['rev-parse', '--short=12', ref]);
}

function resolve(ref) {
  return gitText(['rev-parse', ref]);
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
}

function syncStatePath() {
  const value = gitText(['rev-parse', '--git-path', 'fork-stack-sync.json']);
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function readSyncState() {
  const file = syncStatePath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`Could not read pending patch-stack sync state at ${file}.`);
  }
}

function writeSyncState(state) {
  fs.writeFileSync(syncStatePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function clearSyncState() {
  fs.rmSync(syncStatePath(), { force: true });
}

function trailerValue(commit, key) {
  return gitText(['show', '-s', `--format=%(trailers:key=${key},valueonly)`, commit]);
}

function stackBaseFromHead() {
  let cursor = resolve('HEAD');
  let patches = 0;
  while (trailerValue(cursor, 'Fork-Patch')) {
    patches += 1;
    const parent = git(['rev-parse', `${cursor}^`], { capture: true, allowFailure: true });
    if (parent.status !== 0 || !parent.stdout.trim()) {
      throw new Error('Could not find the upstream parent below the fork patch stack.');
    }
    cursor = parent.stdout.trim();
  }
  if (patches === 0) {
    throw new Error('HEAD has no contiguous Fork-Patch commits; refusing to guess the stack boundary.');
  }
  return { base: cursor, patches };
}

function stackLog(base) {
  const text = gitText(['rev-list', '--reverse', `${base}..HEAD`]);
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((commit) => ({
    oid: commit,
    commit: short(commit),
    subject: gitText(['show', '-s', '--format=%s', commit]),
    patch: trailerValue(commit, 'Fork-Patch'),
    status: trailerValue(commit, 'Fork-Patch-Status'),
    empty: git(['diff', '--quiet', `${commit}^`, commit], { allowFailure: true }).status === 0
  }));
}

function requireStackMetadata(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!row.patch || !row.status) {
      throw new Error(`Fork stack commit ${row.commit} is missing Fork-Patch metadata.`);
    }
    if (row.status !== 'permanent' && row.status !== 'upstream-pending') {
      throw new Error(`Fork stack commit ${row.commit} has unsupported status ${row.status}.`);
    }
    if (seen.has(row.patch)) throw new Error(`Fork patch id ${row.patch} appears more than once.`);
    seen.add(row.patch);
  }
}

function validatePendingSyncState() {
  const state = readSyncState();
  if (!state) return null;

  const { base } = stackBaseFromHead();
  if (resolve(base) !== state.targetCommit) {
    throw new Error(
      `Pending sync expects stack base ${short(state.targetCommit)}, but current base is ${short(base)}. ` +
      'Finish the rebase, or run npm run fork:stack:abort-sync after aborting it.'
    );
  }

  const current = stackLog(base);
  requireStackMetadata(current);
  const currentById = new Map(current.map((row) => [row.patch, row]));
  const expectedById = new Map(state.patches.map((row) => [row.patch, row]));

  for (const row of current) {
    if (!expectedById.has(row.patch)) {
      throw new Error(`Unexpected fork patch ${row.patch} appeared during upstream replay.`);
    }
  }

  for (const expected of state.patches) {
    const actual = currentById.get(expected.patch);
    if (!actual) {
      throw new Error(`Fork patch ${expected.patch} disappeared during replay; refusing to validate the stack.`);
    }
    if (actual.status !== expected.status) {
      throw new Error(`Fork patch ${expected.patch} changed status from ${expected.status} to ${actual.status} during replay.`);
    }
  }

  return { state };
}

function printStatus() {
  const { base } = stackBaseFromHead();
  console.log(`branch: ${branchName()}`);
  console.log(`base:   ${short(base)} (recorded stack base)`);
  console.log(`target: ${short(target)} (${target})`);
  console.log(`head:   ${short('HEAD')}`);
  console.log('patches:');
  for (const row of stackLog(base)) {
    const metadata = [row.patch, row.status, row.empty ? 'empty-marker' : ''].filter(Boolean).join(', ');
    console.log(`  ${row.commit}  ${metadata ? `[${metadata}] ` : ''}${row.subject}`);
  }
  const pending = readSyncState();
  if (pending) console.log(`sync:    pending validation for ${short(pending.targetCommit)}`);
}

const focusedTests = [
  'test/user-data.test.ts',
  'test/plugins-manager.test.ts',
  'test/build-identity.test.ts',
  'test/fork-restart.test.ts',
  'test/plugins-ui.test.ts',
  'test/plugin-refresh.test.ts',
  'test/plugin-refresh-browser-creation.test.ts',
  'test/plugins-ipc-refresh.test.ts'
].filter((file) => fs.existsSync(path.join(root, file)));

function verify() {
  requireClean();
  const { base } = stackBaseFromHead();
  const rows = stackLog(base);
  requireStackMetadata(rows);
  const pendingSync = validatePendingSyncState();
  git(['diff', '--check', `${base}...HEAD`]);
  runNpm(['run', 'typecheck']);
  if (focusedTests.length) runNpm(['exec', '--', 'vitest', 'run', ...focusedTests]);
  runNpm(['run', 'build']);
  printStatus();
  if (pendingSync) {
    clearSyncState();
  }
}

function sync() {
  requireClean();
  if (branchName() !== 'our-release') {
    throw new Error('Run fork:sync-upstream only from the our-release branch.');
  }
  if (readSyncState()) {
    throw new Error('A previous patch-stack sync is still pending validation. Finish it with fork:stack:verify or abort it with fork:stack:abort-sync.');
  }

  const { base: oldBase } = stackBaseFromHead();
  const oldStack = stackLog(oldBase);
  requireStackMetadata(oldStack);
  git(['fetch', 'upstream', '--prune']);

  const targetCommit = resolve(target);
  const ancestry = git(['merge-base', '--is-ancestor', oldBase, targetCommit], { allowFailure: true });
  if (ancestry.status !== 0) {
    throw new Error(`${target}@${short(targetCommit)} does not descend from the recorded stack base ${short(oldBase)}; upstream history was rewritten or the wrong target was selected.`);
  }

  if (resolve(oldBase) === targetCommit) {
    console.log(`Already based on ${target}@${short(targetCommit)}.`);
    verify();
    return;
  }

  const syncState = {
    sourceHead: resolve('HEAD'),
    sourceBase: resolve(oldBase),
    targetCommit,
    createdAt: new Date().toISOString(),
    patches: oldStack.map((row) => ({
      patch: row.patch,
      status: row.status,
      commit: row.oid
    }))
  };

  const backup = `backup/our-release-pre-sync-${timestamp()}-${short('HEAD').slice(0, 7)}`;
  git(['branch', backup, 'HEAD']);
  git(['config', 'rerere.enabled', 'true']);
  git(['config', 'rerere.autoupdate', 'false']);
  writeSyncState(syncState);
  console.log(`Created rollback branch ${backup}.`);
  console.log(`Replaying fork patches from ${short(oldBase)} onto ${target}@${short(targetCommit)}...`);

  const rebased = git([
    'rebase', '--reapply-cherry-picks', '--empty=keep', '--onto', targetCommit, oldBase, 'our-release'
  ], { allowFailure: true });
  if (rebased.status !== 0) {
    console.error('\nRebase stopped on a real fork/upstream conflict.');
    console.error('Resolve only the current fork patch, then run:');
    console.error('  git add <resolved-files>');
    console.error('  git rebase --continue');
    console.error('  npm run fork:stack:verify');
    console.error(`Rollback remains available at ${backup}.`);
    process.exit(rebased.status ?? 1);
  }

  console.log('Patch replay completed; validating the rebuilt fork...');
  verify();
  console.log('\nSync is validated locally. Publish explicitly with:');
  console.log('  git push --force-with-lease origin our-release');
}

function abortSync() {
  const state = readSyncState();
  if (!state) {
    console.log('No pending patch-stack sync state exists.');
    return;
  }
  const rebaseMerge = gitText(['rev-parse', '--git-path', 'rebase-merge']);
  const rebaseApply = gitText(['rev-parse', '--git-path', 'rebase-apply']);
  const inProgress = [rebaseMerge, rebaseApply]
    .map((value) => (path.isAbsolute(value) ? value : path.resolve(root, value)))
    .some((value) => fs.existsSync(value));
  if (inProgress) {
    throw new Error('A Git rebase is still in progress. Run git rebase --abort first, then rerun fork:stack:abort-sync.');
  }
  clearSyncState();
  console.log('Cleared pending patch-stack sync state.');
}

try {
  if (action === 'status') printStatus();
  else if (action === 'verify') verify();
  else if (action === 'sync') sync();
  else if (action === 'abort-sync') abortSync();
  else throw new Error('Usage: node scripts/fork-stack.mjs <status|verify|sync|abort-sync> [upstream-ref]');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
