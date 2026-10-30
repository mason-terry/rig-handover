import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    if (!night) return;
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([...night.rows.map((r) => r.job)].sort());

    const row = (job: string) => night.rows.find((r) => r.job === job);
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null });
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(row('digest/render')?.owner).toBeNull();
    expect(row('lane/sync')).toMatchObject({ firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' });
    expect(night.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('edge cases: empty file, missing file, bad night, junk lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      '{"at":"t","job":"a","status":"ok","owner":null}\r\n[]\r\n{"at":"t","job":"a","status":"nope","owner":null}\r\n{"at":"t","job":"b","status":"ok","owner":5}\r\n\r\n',
    );

    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    expect(readNight(dir, '2026-01-03')).toBeNull();
    expect(readNight(dir, '../2026-01-01')).toBeNull();
    expect(readNight(dir, '2026-01-01.jsonl')).toBeNull();

    const junk = readNight(dir, '2026-01-02');
    expect(junk?.rows.map((r) => r.job)).toEqual(['a']);
    expect(junk?.badLines).toBe(3);
  });
});
