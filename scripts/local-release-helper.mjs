import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [targetExe, statePath, targetSlot, branch, commit, sourceExe] = process.argv.slice(2);
if (!targetExe || !statePath || !targetSlot || !branch || !commit || !sourceExe) {
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runningSourceProcesses() {
  if (process.platform !== 'win32') return [];
  const source = path.normalize(sourceExe).toLowerCase();
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
      return path.normalize(line.slice(separator + 1)).toLowerCase() === source;
    });
}

function launch(args = []) {
  const child = spawn(targetExe, args, { detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
}

// Give the invoking COS enough time to deliver the completed command/tool response before the
// primary starts shutting itself down. This helper is detached, so it survives that shutdown.
await sleep(3000);

// The first launch is intentionally a secondary instance. Electron forwards the flag to the
// current primary, whose normal shutdown path drains bridges/plugins/durable state before exit.
launch(['--fork-restart']);

const deadline = Date.now() + 75_000;
while (Date.now() < deadline) {
  await sleep(500);
  if (runningSourceProcesses().length === 0) break;
}

if (runningSourceProcesses().length !== 0) process.exit(3);

launch();
fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, `${JSON.stringify({ active: targetSlot, branch, commit, switchedAt: new Date().toISOString() }, null, 2)}\n`);
