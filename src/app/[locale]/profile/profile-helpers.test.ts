import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_ID_PATTERN,
  createAutoAgentId,
  CREDIT_PACKS,
  formatRelativeTime,
  getBillingIntervalLabel,
  getModelDisplayName,
  getSeatPlanLabel,
} from './profile-helpers';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-23T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats common relative ranges', () => {
    expect(formatRelativeTime()).toBeNull();
    expect(formatRelativeTime('2026-02-23T11:59:40.000Z')).toBe('Just now');
    expect(formatRelativeTime('2026-02-23T11:58:00.000Z')).toBe('2m ago');
    expect(formatRelativeTime('2026-02-23T10:00:00.000Z')).toBe('2h ago');
    expect(formatRelativeTime('2026-02-20T12:00:00.000Z')).toBe('3d ago');
  });
});

describe('profile labels', () => {
  it('maps plan and interval labels', () => {
    expect(getSeatPlanLabel('seat-standard')).toBe('Standard');
    expect(getSeatPlanLabel('seat-max')).toBe('Max');
    expect(getBillingIntervalLabel('month')).toBe('Monthly');
    expect(getBillingIntervalLabel('year')).toBe('Yearly');
  });

  it('keeps model ids as display names', () => {
    expect(getModelDisplayName(null)).toBeNull();
    expect(getModelDisplayName('openai/gpt-5.2')).toBe('openai/gpt-5.2');
  });
});

describe('agent helpers', () => {
  it('validates and creates agent ids', () => {
    const id = createAutoAgentId();
    expect(id.startsWith('agent_')).toBe(true);
    expect(AGENT_ID_PATTERN.test(id)).toBe(true);
    expect(AGENT_ID_PATTERN.test('bad space')).toBe(false);
  });
});

describe('credit packs', () => {
  it('exposes known credit packs', () => {
    expect(CREDIT_PACKS.pack_5).toBe(5);
    expect(CREDIT_PACKS.pack_50).toBe(50);
  });
});
