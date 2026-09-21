import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage } from '@electron/asar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseRoot = path.join(root, 'release-local');
const statePath = path.join(releaseRoot, 'current.json');
const action = process.argv[2];

if (!['build', 'swap', 'rollback'].includes(action)) {
  console.error('Usage: node scripts/local-release.mjs <build|swap|rollback>');
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

function validate(slot, branch = null, commit = null) {
  const target = slotPaths(slot);
  if (!fs.existsSync(target.exe)) throw new Error(`Missing executable: ${target.exe}`);
  if (!fs.existsSync(target.asar)) throw new Error(`Missing app.asar: ${target.asar}`);
  const files = listPackage(target.asar);
  if (!files.some((name) => name.includes('@modelcontextprotocol\\core') || name.includes('@modelcontextprotocol/core'))) {
    throw new Error('Packaged app is missing @modelcontextprotocol/core');
  }
  const main = extractFile(target.asar, 'out\\main\\index.js').toString('utf8');
  for (const required of ['[lavalava45 Fork] Chat On Steroids', branch, commit].filter(Boolean)) {
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
    run(process.execPath, ['scripts/package.mjs', '--platform', 'win32', '--arch', 'x64', '--dir', '--output', relativeOutput]);
  } finally {
    fs.writeFileSync(noticesPath, noticesBefore);
  }
  const validated = validate(slot, branch, commit);
  fs.writeFileSync(target.metadata, `${JSON.stringify({ slot, branch, commit, builtAt: new Date().toISOString() }, null, 2)}\n`);
  return validated;
}

function readBuildMetadata(slot) {
  try {
    return JSON.parse(fs.readFileSync(slotPaths(slot).metadata, 'utf8'));
  } catch {
    return null;
  }
}

function armHandoff(target, slot, branch, commit) {
  const helper = path.join(root, 'scripts', 'local-release-helper.mjs');
  const child = spawn(process.execPath, [helper, target.exe, statePath, slot, branch, commit], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  console.log(`Restart helper armed for ${slot}.`);
  console.log(`Target: ${target.exe}`);
}

const state = readState();
const branch = git(['branch', '--show-current']);
const commit = git(['rev-parse', '--short=7', 'HEAD']);

if (action === 'rollback') {
  if (!state) throw new Error('No active local release is recorded yet; rollback is unavailable.');
  const targetSlot = other(state.active);
  const metadata = readBuildMetadata(targetSlot);
  const target = validate(targetSlot, metadata?.branch ?? null, metadata?.commit ?? null);
  armHandoff(target, targetSlot, metadata?.branch ?? 'unknown', metadata?.commit ?? 'unknown');
  process.exit(0);
}

requireCleanWorktree();
const targetSlot = state ? other(state.active) : 'slot-a';
console.log(`Current: ${state?.active ?? 'external/untracked build'}`);
console.log(`Building: ${targetSlot}`);
console.log(`Identity: ${branch} @ ${commit}`);
const target = build(targetSlot, branch, commit);
console.log(`Validated: ${target.exe}`);

if (action === 'swap') armHandoff(target, targetSlot, branch, commit);
