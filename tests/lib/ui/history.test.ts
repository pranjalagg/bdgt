import { describe, it, expect } from 'vitest';
import { closeTarget } from '$lib/ui/history';

describe('closeTarget', () => {
  it('goes back when the app has somewhere to go back to', () => {
    expect(closeTarget(2, '/review')).toBe('back');
  });
  it('lands on the tab a modal page opens from when opened directly', () => {
    expect(closeTarget(0, '/review')).toBe('/activity');
    expect(closeTarget(0, '/settings/sync')).toBe('/');
  });
});
