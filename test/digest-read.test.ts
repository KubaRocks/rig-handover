import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs, sorted, and counts the truncated last line as bad', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night!.badLines).toBe(1);
    expect(night!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  const row = (job: string) => night!.rows.find((r) => r.job === job)!;

  it('counts runs and retries per job', () => {
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    expect(row('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: null });
  });

  it('keeps the last status and error', () => {
    expect(row('notes/backup')).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a null owner', () => {
    expect(row('digest/render').owner).toBeNull();
  });

  it('keeps times exactly as logged, offset included', () => {
    expect(row('lane/sync').firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row('lane/sync').lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../runs/2026-10-28')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    writeFileSync(join(tmp, '2026-02-01.jsonl'), '');
    expect(readNight(tmp, '2026-02-01')).toEqual({
      night: '2026-02-01',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('ignores blank lines, counts invalid ones, takes the last owner', () => {
    const lines = [
      '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '',
      '   ',
      '{"at":"2026-02-02T02:00:00+01:00","job":"a","status":"retry","owner":"y","error":"busy"}',
      '{"at":"2026-02-02T03:00:00+01:00","job":"a","status":"maybe","owner":"x"}',
      '{"at":"2026-02-02T03:00:00+01:00","job":"b","status":"ok"}',
      '[1,2]',
      'not json',
    ];
    writeFileSync(join(tmp, '2026-02-02.jsonl'), lines.join('\n') + '\n');
    const n = readNight(tmp, '2026-02-02')!;
    expect(n.badLines).toBe(4);
    expect(n.rows).toEqual([
      {
        job: 'a',
        owner: 'y',
        runs: 2,
        retries: 1,
        lastStatus: 'retry',
        lastError: 'busy',
        firstAt: '2026-02-02T01:00:00+01:00',
        lastAt: '2026-02-02T02:00:00+01:00',
      },
    ]);
    expect(n.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
  });
});
