import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest page', () => {
  it('renders 2026-10-28 with warn rows for fixtures/refresh and notes/backup', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    const rows = [...html.matchAll(/<tr( class="warn")?><td>([^<]+)<\/td>/g)].map((m) => [m[2], m[1] !== undefined]);
    expect(rows).toEqual([
      ['digest/render', false],
      ['fixtures/refresh', true],
      ['lane/sync', false],
      ['notes/backup', true],
      ['rig/rotate-logs', false],
    ]);
  });
});
