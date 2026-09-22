import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function gitValue(args: string[], fallback: string): string {
  try {
    return execFileSync('git', args, { cwd: __dirname, encoding: 'utf8' }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const buildBranch = process.env.GITHUB_REF_NAME || gitValue(['branch', '--show-current'], 'unknown');
const buildCommit = process.env.GITHUB_SHA?.slice(0, 7) || gitValue(['rev-parse', '--short=7', 'HEAD'], 'unknown');
const appVersion = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string;
const forkProfile = (() => {
  const value = process.env.COS_FORK_PROFILE || 'stable';
  if (value !== 'stable' && value !== 'slot-a' && value !== 'slot-b') {
    throw new Error(`Invalid COS_FORK_PROFILE: ${value}`);
  }
  return value;
})();
const forkProfileDirectory = forkProfile === 'stable'
  ? 'chat-on-steroids-FORK'
  : `chat-on-steroids-FORK-${forkProfile}`;

const buildIdentityDefine = {
  __COS_BUILD_BRANCH__: JSON.stringify(buildBranch),
  __COS_BUILD_COMMIT__: JSON.stringify(buildCommit),
  __COS_APP_VERSION__: JSON.stringify(appVersion),
  __COS_FORK_PROFILE__: JSON.stringify(forkProfile),
  __COS_FORK_PROFILE_DIRECTORY__: JSON.stringify(forkProfileDirectory)
};

export default defineConfig({
  main: {
    // Keep node_modules external so the MCP SDK ships as real files in the asar
    // rather than being inlined by the bundler.
    plugins: [externalizeDepsPlugin()],
    define: buildIdentityDefine,
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    define: buildIdentityDefine,
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    }
  }
});
