import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { handoffLaunchPlan } from './local-release-handoff.mjs';

const [targetExe, statePath, targetSlot, branch, commit, sourceExe] = process.argv.slice(2);
if (!targetExe || !statePath || !targetSlot || !branch || !commit || !sourceExe) {
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runningProcesses(exe) {
  if (process.platform !== 'win32') return [];
  const wanted = path.normalize(exe).toLowerCase();
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Chat On Steroids.exe' } | ForEach-Object { $_.ProcessId.ToString() + '|' + $_.ExecutablePath }"
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const separator = line.indexOf('|');
      if (separator < 0) return false;
      return path.normalize(line.slice(separator + 1)).toLowerCase() === wanted;
    });
}

const runningSourceProcesses = () => runningProcesses(sourceExe);
const runningTargetProcesses = () => runningProcesses(targetExe);

function writeState() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const temporary = `${statePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify({ active: targetSlot, branch, commit, switchedAt: new Date().toISOString() }, null, 2)}\n`);
  fs.renameSync(temporary, statePath);
}

function launch(exe, args = []) {
  const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
}

const plan = handoffLaunchPlan(sourceExe, targetExe);

// Give the invoking COS enough time to deliver the completed command/tool response before the
// primary starts shutting itself down. This helper is detached, so it survives that shutdown.
await sleep(3000);

// The restart signal must be launched through the SOURCE executable. Slot profiles use different
// Electron userData roots (and therefore different single-instance locks); launching the target
// here would create a second primary instead of notifying the currently running source slot.
// The source secondary forwards the flag to its own primary, whose normal shutdown path drains
// bridges/plugins/durable state before exit.
launch(plan.restart.exe, plan.restart.args);

const deadline = Date.now() + 75_000;
while (Date.now() < deadline) {
  await sleep(500);
  if (runningSourceProcesses().length === 0) break;
}

if (runningSourceProcesses().length !== 0) process.exit(3);

// A pre-existing target would make "target is running" ambiguous evidence. Fail closed rather
// than recording a handoff we cannot prove this helper performed.
if (runningTargetProcesses().length !== 0) process.exit(4);

launch(plan.target.exe, plan.target.args);
const targetDeadline = Date.now() + 20_000;
while (Date.now() < targetDeadline) {
  await sleep(250);
  if (runningTargetProcesses().length !== 0) break;
}
if (runningTargetProcesses().length === 0) process.exit(5);

// Only a process whose executable path matches the target slot may commit current.json.
writeState();
