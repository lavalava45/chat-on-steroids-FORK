import { expect, it, vi } from 'vitest';

const restart = vi.hoisted(() => vi.fn(async () => undefined));
const snapshot = vi.hoisted(() => vi.fn(() => ({ plugins: [] })));
const rearm = vi.hoisted(() => vi.fn(async () => true));

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '' },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}));
vi.mock('../src/main/plugins/manager.js', () => ({
  pluginManager: {
    restart,
    snapshot,
    onChanged: vi.fn(),
  },
}));
vi.mock('../src/main/plugin-refresh.js', () => ({ rearmPluginRefresh: rearm }));
vi.mock('../src/main/connection.js', () => ({ refreshPluginPublication: vi.fn() }));

import { registerPluginIpc } from '../src/main/plugins-ipc.js';

it('rearms the Plugins connector only after an explicit local plugin Restart completes', async () => {
  const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
  registerPluginIpc((channel, handler) => { handlers.set(channel, handler); }, () => null);

  const handler = handlers.get('plugins:restart');
  expect(handler).toBeDefined();
  await handler!({ id: 'photoshop-mcp' });

  expect(restart).toHaveBeenCalledExactlyOnceWith('photoshop-mcp');
  expect(rearm).toHaveBeenCalledExactlyOnceWith('plugins');
  expect(restart.mock.invocationCallOrder[0]).toBeLessThan(rearm.mock.invocationCallOrder[0]!);
});
