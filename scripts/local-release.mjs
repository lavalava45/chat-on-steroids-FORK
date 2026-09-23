import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage } from '@electron/asar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = path.join(root, 'release-local');
const statePath = path.join(releaseRoot, 'current.json');
const action = process.argv[2];
const requestedSlot = process.argv[3] || null;

if (!['build', 'swap', 'rollback', 'sync'].includes(action)) {
  console.error('Usage: node scripts/local-release.mjs <build|swap|rollback|sync> [slot-a|slot-b]');
  process.exit(2);
}
if (requestedSlot && requestedSlot !== 'slot-a' && requestedSlot !== 'slot-b') {
  console.error(`Invalid slot: ${requestedSlot}`);
  process.exit(2);
}
if (action === 'rollback' && requestedSlot) {
  console.error('rollback does not accept an explicit target slot');
  process.exit(2);
}
if (action === 'sync' && requestedSlot) {
  console.error('sync does not accept an explicit target slot');
  process.exit(2);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function git(args, fallback = 'unknown') {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : fallback;
}

function requireCleanWorktree() {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Could not inspect Git worktree state.');
  if (result.stdout.trim()) {
    throw new Error('Local release build requires a clean Git worktree so the embedded commit exactly identifies the packaged source.');
  }
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed?.active === 'slot-a' || parsed?.active === 'slot-b' ? parsed : null;
  } catch {
    return null;
  }
}

function runningCosExecutables() {
  if (process.platform !== 'win32') return [];
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Chat On Steroids.exe' } | ForEach-Object { $_.ExecutablePath }"
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return [];
  return [...new Set(result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

function runningLocalSlot() {
  const executables = runningCosExecutables().map((value) => path.normalize(value).toLowerCase());
  for (const slot of ['slot-a', 'slot-b']) {
    const exe = path.normalize(slotPaths(slot).exe).toLowerCase();
    if (executables.includes(exe)) return slot;
  }
  return null;
}

function other(slot) {
  return slot === 'slot-a' ? 'slot-b' : 'slot-a';
}

function slotPaths(slot) {
  const output = path.join(releaseRoot, slot);
  const unpacked = path.join(output, 'win-unpacked');
  return {
    output,
    exe: path.join(unpacked, 'Chat On Steroids.exe'),
    asar: path.join(unpacked, 'resources', 'app.asar'),
    metadata: path.join(output, 'build.json')
  };
}

function profileDirectoryForSlot(slot) {
  return `chat-on-steroids-FORK-${slot}`;
}

function validate(slot, branch = null, commit = null) {
  const target = slotPaths(slot);
  if (!fs.existsSync(target.exe)) throw new Error(`Missing executable: ${target.exe}`);
  if (!fs.existsSync(target.asar)) throw new Error(`Missing app.asar: ${target.asar}`);
  const files = listPackage(target.asar);
  if (!files.some((name) => name.includes('@modelcontextprotocol\\core') || name.includes('@modelcontextprotocol/core'))) {
    throw new Error('Packaged app is missing @modelcontextprotocol/core');
  }
  const main = extractFile(target.asar, 'out\\main\\index.js').toString('utf8');
  for (const required of [
    '[lavalava45 Fork] Chat On Steroids',
    slot,
    profileDirectoryForSlot(slot),
    branch,
    commit
  ].filter(Boolean)) {
    if (!main.includes(required)) throw new Error(`Packaged build identity is missing: ${required}`);
  }
  return target;
}

function build(slot, branch, commit) {
  const target = slotPaths(slot);
  fs.rmSync(target.output, { recursive: true, force: true });
  const relativeOutput = path.relative(root, target.output).replaceAll('\\', '/');
  const noticesPath = path.join(root, 'THIRD-PARTY-NOTICES.txt');
  const noticesBefore = fs.readFileSync(noticesPath);
  try {
    run(
      process.execPath,
      ['scripts/package.mjs', '--platform', 'win32', '--arch', 'x64', '--dir', '--output', relativeOutput],
      { env: { ...process.env, COS_FORK_PROFILE: slot } }
    );
  } finally {
    fs.writeFileSync(noticesPath, noticesBefore);
  }
  const validated = validate(slot, branch, commit);
  fs.writeFileSync(target.metadata, `${JSON.stringify({
    slot,
    profileDirectory: profileDirectoryForSlot(slot),
    branch,
    commit,
    builtAt: new Date().toISOString()
  }, null, 2)}\n`);
  return validated;
}

function readBuildMetadata(slot) {
  try {
    return JSON.parse(fs.readFileSync(slotPaths(slot).metadata, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporary = `${statePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, statePath);
}

function reconcileState(recordedState, detectedSlot) {
  if (!detectedSlot) return null;
  const metadata = readBuildMetadata(detectedSlot);
  const branch = metadata?.branch ?? recordedState?.branch ?? 'unknown';
  const commit = metadata?.commit ?? recordedState?.commit ?? 'unknown';
  const unchanged = recordedState?.active === detectedSlot &&
    recordedState?.branch === branch && recordedState?.commit === commit &&
    typeof recordedState?.switchedAt === 'string' && recordedState.switchedAt.length > 0;
  const next = {
    active: detectedSlot,
    branch,
    commit,
    switchedAt: unchanged ? recordedState.switchedAt : new Date().toISOString()
  };
  if (!unchanged) writeState(next);
  return next;
}

function armHandoff(target, slot, branch, commit, sourceSlot) {
  const helper = path.join(root, 'scripts', 'local-release-helper.mjs');
  if (!sourceSlot) throw new Error('Cannot arm a restart handoff without a detected active local slot.');
  const sourceExe = slotPaths(sourceSlot).exe;
  const child = spawn(process.execPath, [helper, target.exe, statePath, slot, branch, commit, sourceExe], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  console.log(`Restart helper armed for ${slot}.`);
  console.log(`Target: ${target.exe}`);
}

const recordedState = readState();
const detectedSlot = runningLocalSlot();
// The running executable is the source of truth. Keep current.json reconciled with that runtime
// before every release action so a manual launch or an interrupted older helper cannot leave a
// stale active-slot marker behind.
const state = reconcileState(recordedState, detectedSlot);
const branch = git(['branch', '--show-current']);
const commit = git(['rev-parse', '--short=7', 'HEAD']);

if (action === 'sync') {
  if (!state) throw new Error('No running local release slot was detected; current.json was not changed.');
  console.log(`Synchronized: ${state.active} @ ${state.commit}`);
  process.exit(0);
}

if (action === 'rollback') {
  if (!state) throw new Error('No active local release is recorded yet; rollback is unavailable.');
  if (!detectedSlot) throw new Error('Rollback requires a currently running local release slot.');
  const targetSlot = other(state.active);
  const metadata = readBuildMetadata(targetSlot);
  const target = validate(targetSlot, metadata?.branch ?? null, metadata?.commit ?? null);
  armHandoff(target, targetSlot, metadata?.branch ?? 'unknown', metadata?.commit ?? 'unknown', detectedSlot);
  process.exit(0);
}

requireCleanWorktree();
const targetSlot = requestedSlot ?? (state ? other(state.active) : 'slot-a');
console.log(`Current: ${state?.active ?? 'external/untracked build'}`);
console.log(`Building: ${targetSlot}`);
console.log(`Identity: ${branch} @ ${commit}`);
const target = build(targetSlot, branch, commit);
console.log(`Validated: ${target.exe}`);

if (action === 'swap') {
  const running = runningCosExecutables();
  if (!detectedSlot && running.length > 0) {
    console.log('First activation required: the currently running COS predates the local restart protocol.');
    console.log('Quit that build once via tray -> Quit, then launch the validated target above.');
    console.log('After that, fork:swap will detect the active slot automatically and future swaps are fully automatic.');
  } else if (detectedSlot) {
    armHandoff(target, targetSlot, branch, commit, detectedSlot);
  } else {
    throw new Error('No running local COS slot was detected; launch the validated target manually once.');
  }
}
