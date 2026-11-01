import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Fixtures are written to a temp dir: runs/ is read-only and these cases need exact content.
const NORMAL = '2026-10-30';
const EMPTY = '2026-10-31';
const BAD = '2026-11-01';
const MISSING = '2026-10-01';

const normalLines = [
  '{"at":"2026-10-30T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
  '{"at":"2026-10-30T23:00:06+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-31T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-31T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-31T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-31T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
  '{"at":"2026-10-31T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '{"at":"2026-10-31T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
];

// The last line is cut off mid-object and has no newline, as a crashed write leaves it.
const badLines = [
  '{"at":"2026-11-01T02:00:03+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-11-01T05:00:04+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
  '{"at":"2026-11-01T05:41:09+01:00","job":"lane/sy',
];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), badLines.join('\n'));
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  if (runsDir) rmSync(runsDir, { recursive: true, force: true });
});

// Rows of the page's <tbody>: whether the <tr> is warn-marked, and its <td> texts in order.
function tableRows(html: string): { warn: boolean; cells: string[] }[] {
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  return [...body.matchAll(/<tr( class="warn")?>(.*?)<\/tr>/g)].map((m) => ({
    warn: m[1] !== undefined,
    cells: [...m[2].matchAll(/<td>([^<]*)<\/td>/g)].map((c) => c[1]),
  }));
}

describe('digest routes: normal night', () => {
  it('page: 200, one table, rows sorted by job, warn on retries >= 3 or fail, — for missing owner and error', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<h1>digest · ${NORMAL}</h1>`);
    expect(html.match(/<table>/g)).toHaveLength(1);
    expect(tableRows(html)).toEqual([
      {
        warn: false,
        cells: ['digest/render', '—', '1', '0', 'ok', '—', '2026-10-31T05:41:09+01:00', '2026-10-31T05:41:09+01:00'],
      },
      {
        warn: true,
        cells: ['fixtures/refresh', 'rook', '4', '3', 'ok', '—', '2026-10-31T01:30:00+01:00', '2026-10-31T01:37:00+01:00'],
      },
      {
        warn: false,
        cells: ['lane/sync', 'rook', '1', '0', 'ok', '—', '2026-10-30T23:00:06+01:00', '2026-10-30T23:00:06+01:00'],
      },
      {
        warn: true,
        cells: ['notes/backup', 'lane-07', '1', '0', 'fail', 'quota exceeded', '2026-10-31T04:00:01+01:00', '2026-10-31T04:00:01+01:00'],
      },
      {
        warn: false,
        cells: ['rig/rotate-logs', 'lane-07', '1', '0', 'ok', '—', '2026-10-30T23:00:02+01:00', '2026-10-30T23:00:02+01:00'],
      },
    ]);
    expect(html).not.toContain('could not be read');
  });

  it('json: 200, the Night object', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: NORMAL,
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-31T05:41:09+01:00',
          lastAt: '2026-10-31T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-31T01:30:00+01:00',
          lastAt: '2026-10-31T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-30T23:00:06+01:00',
          lastAt: '2026-10-30T23:00:06+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-31T04:00:01+01:00',
          lastAt: '2026-10-31T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-30T23:00:02+01:00',
          lastAt: '2026-10-30T23:00:02+01:00',
        },
      ],
      badLines: 0,
      counts: { ok: 4, retry: 3, fail: 1 },
    } satisfies Night);
  });

  it('page and json list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const night = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as Night;
    expect(tableRows(html).map((r) => r.cells[0])).toEqual(night.rows.map((r) => r.job));
  });
});

describe('digest routes: empty night', () => {
  it('page: 200, "nothing ran", no table', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<h1>digest · ${EMPTY}</h1>`);
    expect(html).toContain('<p class="mute">nothing ran</p>');
    expect(html).not.toContain('<table>');
  });

  it('json: 200, no rows, zero counts', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: EMPTY,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});

describe('digest routes: night with a bad line', () => {
  it('page: 200, the valid rows, and the bad-line count under the table', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(tableRows(html).map((r) => r.cells[0])).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(html).toContain('<p class="mute">1 line(s) could not be read</p>');
  });

  it('json: 200, the valid rows, badLines 1', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(night.counts).toEqual({ ok: 2, retry: 0, fail: 0 });
  });
});

describe('digest routes: missing night', () => {
  it('page: 404 inside the layout, "no run log for <night>"', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain(`<title>rig · digest · ${MISSING}</title>`);
    expect(html).toContain('<header>');
    expect(html).toContain(`no run log for ${MISSING}`);
    expect(html).not.toContain('<table>');
  });

  it('json: 404 with the error body', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });
});
