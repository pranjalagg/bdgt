import { describe, it, expect } from 'vitest';
import { swipeOutcome, swipeDirection, deckOutcome } from '$lib/ui/swipe';

describe('swipeOutcome', () => {
  it('deletes on a long swipe left or a fast flick', () => {
    expect(swipeOutcome(-250, 390, 0)).toBe('delete');
    expect(swipeOutcome(-20, 390, -1.2)).toBe('delete');
  });
  it('moves on a long swipe right or a fast flick', () => {
    expect(swipeOutcome(200, 390, 0)).toBe('move');
    expect(swipeOutcome(20, 390, 1.2)).toBe('move');
  });
  it('rests open past 60 px', () => {
    expect(swipeOutcome(-90, 390, 0)).toBe('open-delete');
    expect(swipeOutcome(90, 390, 0)).toBe('open-move');
  });
  it('closes on a short drag, or a flick back toward the middle', () => {
    expect(swipeOutcome(30, 390, 0.1)).toBe('close');
    expect(swipeOutcome(50, 390, -1.2)).toBe('close');
    expect(swipeOutcome(-50, 390, 1.2)).toBe('close');
    expect(swipeOutcome(-60, 390, 0)).toBe('close');
  });
});

describe('swipeDirection', () => {
  it('waits for 10 px of movement', () => {
    expect(swipeDirection(6, 2)).toBeNull();
  });
  it('takes a mostly sideways drag as a swipe', () => {
    expect(swipeDirection(14, 5)).toBe('horizontal');
    expect(swipeDirection(-14, 10)).toBe('horizontal');
  });
  it('leaves a diagonal or vertical drag to scrolling', () => {
    expect(swipeDirection(13, 11)).toBe('vertical');
    expect(swipeDirection(2, 12)).toBe('vertical');
  });
});

describe('deckOutcome', () => {
  it('approves past 110 px right or on a quick flick right', () => {
    expect(deckOutcome(120, 0)).toBe('approve');
    expect(deckOutcome(30, 0.8)).toBe('approve');
  });
  it('dismisses the same way to the left', () => {
    expect(deckOutcome(-120, 0)).toBe('dismiss');
    expect(deckOutcome(-30, -0.8)).toBe('dismiss');
  });
  it('springs back otherwise, or on a flick against the pull', () => {
    expect(deckOutcome(100, 0.2)).toBe('back');
    expect(deckOutcome(-60, 0.9)).toBe('back');
  });
});
