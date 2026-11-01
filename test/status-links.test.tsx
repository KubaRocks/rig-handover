import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const expected: Record<string, string> = {
  '2026-10-28': 'ok 10 · retry 4 · fail 1',
  '2026-10-27': 'ok 7 · retry 0 · fail 0',
};

describe('status board links', () => {
  it('links each night on disk to a digest that renders, with its counts beside it', async () => {
    const app = createApp(config);
    const html = await (await app.request('/')).text();
    const hrefs = [...html.matchAll(/<a href="(\/digest\/[^"]+)">/g)].map((m) => m[1]);
    expect(hrefs).toEqual(['/digest/2026-10-28', '/digest/2026-10-27']);

    for (const href of hrefs) {
      const night = href.slice('/digest/'.length);
      const res = await app.request(href);
      expect(res.status).toBe(200);
      expect(html).toContain(`<a href="${href}">${night}</a> <span class="mute">${expected[night]}</span>`);
    }
  });
});
