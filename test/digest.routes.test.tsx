import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2026-01-01';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-'));
  writeFileSync(
    join(runsDir, `${NORMAL}.jsonl`),
    [
      line('2026-10-28T23:00:02+01:00', 'rig/rotate-logs', 'ok', 'lane-07'),
      line('2026-10-28T23:00:06+01:00', 'fixtures/refresh', 'retry', 'rook', 'timeout'),
      line('2026-10-28T23:10:06+01:00', 'fixtures/refresh', 'retry', 'rook', 'timeout'),
      line('2026-10-28T23:20:06+01:00', 'fixtures/refresh', 'retry', 'rook', 'timeout'),
      line('2026-10-28T23:30:06+01:00', 'fixtures/refresh', 'ok', 'rook'),
      line('2026-10-28T23:40:00+01:00', 'notes/backup', 'ok', 'rook'),
      line('2026-10-29T00:40:00+01:00', 'notes/backup', 'fail', 'rook', 'quota exceeded'),
    ].join('\n'),
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [
      line('2026-10-26T23:00:02+01:00', 'rig/rotate-logs', 'ok', 'lane-07'),
      '{"at":"2026-10-26T23:05:00+01:00", "job": ',
      line('2026-10-26T23:10:00+01:00', 'notes/backup', 'ok', null),
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

// Job names in the order the digest table prints them (first cell of each body row).
const pageJobs = (html: string) =>
  [...html.matchAll(/<tr[^>]*>\s*<td>([^<]+)<\/td>/g)].map((m) => m[1]);

describe('digest page: /digest/:night', () => {
  it('200 for a normal night, with every job in the table', async () => {
    const res = await app().request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobs(html)).toEqual(['fixtures/refresh', 'notes/backup', 'rig/rotate-logs']);
  });

  it('404 for a night with no file', async () => {
    const res = await app().request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('empty night renders "nothing ran" and no table rows', async () => {
    const res = await app().request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(pageJobs(html)).toEqual([]);
  });

  it('bad-line night is still 200, reports the bad line, and keeps the valid rows', async () => {
    const res = await app().request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toMatch(/1 line didn(&#39;|')t parse/); // Hono escapes the apostrophe
    expect(pageJobs(html)).toEqual(['notes/backup', 'rig/rotate-logs']);
  });
});

describe('digest JSON: /api/digest/:night', () => {
  it('200 for a normal night, rows in the same job order as the page', async () => {
    const pageRes = await app().request(`/digest/${NORMAL}`);
    const pageOrder = pageJobs(await pageRes.text());

    const res = await app().request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string; runs: number; retries: number; lastStatus: string }[]; badLines: number };
    expect(body.night).toBe(NORMAL);
    expect(body.rows.map((r) => r.job)).toEqual(pageOrder);
    expect(body.rows.find((r) => r.job === 'fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok' });
    expect(body.rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail' });
    expect(body.badLines).toBe(0);
  });

  it('404 for a night with no file', async () => {
    const res = await app().request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('empty night: rows []', async () => {
    const res = await app().request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('bad-line night: still 200, badLines 1, valid rows kept', async () => {
    const res = await app().request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['notes/backup', 'rig/rotate-logs']);
  });
});
