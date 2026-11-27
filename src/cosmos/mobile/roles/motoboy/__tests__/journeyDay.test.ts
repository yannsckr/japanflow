import { describe, expect, it } from 'vitest';
import { journeyDay } from '../useJourneyDay';

describe('daily journey calendar', () => {
  it('keeps the same day until midnight in Sao Paulo', () => {
    expect(journeyDay(new Date('2026-11-28T02:59:59Z'))).toBe('2026-11-27');
  });

  it('starts a new civil day at midnight in Sao Paulo', () => {
    expect(journeyDay(new Date('2026-11-28T03:00:00Z'))).toBe('2026-11-28');
  });

  it('handles month transitions', () => {
    expect(journeyDay(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12-01');
  });

  it('handles year transitions', () => {
    expect(journeyDay(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01');
  });

  it('does not change the journey at UTC midnight', () => {
    expect(journeyDay(new Date('2026-11-28T00:00:00Z'))).toBe('2026-11-27');
  });
});
