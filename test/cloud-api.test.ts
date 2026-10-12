import { describe, expect, it } from 'vitest';
import { normaliseSession, sessionsFromResponse, wantsCloud } from '../src/server/cloud.ts';
import { mapCloudState } from '../src/cloud/sessions.ts';

describe('cloud mode', () => {
  it('turns on with --cloud or CLOUD=1', () => {
    expect(wantsCloud(['--cloud'], {})).toBe(true);
    expect(wantsCloud([], { CLOUD: '1' })).toBe(true);
    expect(wantsCloud([], {})).toBe(false);
  });

  it('maps plain session statuses onto office states', () => {
    const state = (status: string) => mapCloudState(normaliseSession({ id: 's', status }));
    expect(state('working')).toBe('working');
    expect(state('waiting')).toBe('needs');
    expect(state('idle')).toBe('done');
    expect(state('archived')).toBe('finished');
    expect(state('cancelled')).toBe('stale');
  });

  it('keeps a status bucket the API already sends', () => {
    expect(normaliseSession({ id: 's', session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_WORKING' }).status_bucket)
      .toBe('SESSION_STATUS_BUCKET_WORKING');
  });

  it('reads data, sessions or bare lists', () => {
    expect(sessionsFromResponse({ data: [{ id: 'a' }] }).map((s) => s.id)).toEqual(['a']);
    expect(sessionsFromResponse({ sessions: [{ id: 'b' }] }).map((s) => s.id)).toEqual(['b']);
    expect(sessionsFromResponse([{ id: 'c' }]).map((s) => s.id)).toEqual(['c']);
    expect(sessionsFromResponse(null)).toEqual([]);
  });
});
