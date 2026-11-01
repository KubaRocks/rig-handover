import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest api', () => {
  it('lists the same jobs in the same order as the page for 2026-10-28', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/2026-10-28');
    const api = await app.request('/api/digest/2026-10-28');
    expect(api.status).toBe(200);
    const night = (await api.json()) as Night;
    const jobs = night.rows.map((r) => r.job);
    expect(jobs).toHaveLength(5);

    const html = await page.text();
    const pageJobs = [...html.matchAll(/<tr(?: class="warn")?><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(pageJobs).toEqual(jobs);

    const positions = jobs.map((j) => html.indexOf(`<td>${j}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('returns a JSON 404 for a night with no run log', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-10-01' });
  });
});
