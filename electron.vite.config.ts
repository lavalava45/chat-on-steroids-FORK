import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { execFileSync } from 'node:child_process';
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

export default defineConfig({
  main: {
    // Keep node_modules external so the MCP SDK ships as real files in the asar
    // rather than being inlined by the bundler.
    plugins: [externalizeDepsPlugin()],
    define: {
      __COS_BUILD_BRANCH__: JSON.stringify(buildBranch),
      __COS_BUILD_COMMIT__: JSON.stringify(buildCommit)
    },
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
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    }
  }
});
