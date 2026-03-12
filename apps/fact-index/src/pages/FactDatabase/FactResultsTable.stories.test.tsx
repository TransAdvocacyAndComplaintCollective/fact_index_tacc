import { describe, it, expect } from 'vitest';
import * as Stories from './FactResultsTable.stories';

describe('FactResultsTable Stories', () => {
  it('should export all stories', () => {
    expect(Stories.default).toBeDefined();
  });

  it('should have stories defined', () => {
    const storyNames = Object.keys(Stories).filter(
      key => key !== 'default' && typeof (Stories as any)[key] === 'object'
    );
    expect(storyNames.length).toBeGreaterThan(0);
  });
});
