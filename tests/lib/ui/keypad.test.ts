import { describe, it, expect } from 'vitest';
import { applyKey, keyFromKeyboard, type KeypadKey } from '$lib/ui/keypad';
import { evaluateExpression } from '$lib/utils/currency';

const typed = (keys: KeypadKey[]) => keys.reduce((e, k) => applyKey(e, k).expr, '');
const key = (k: string, extra: KeyboardEventInit = {}) => keyFromKeyboard(new KeyboardEvent('keydown', { key: k, ...extra }));

describe('applyKey', () => {
  it('builds an expression the currency parser evaluates', () => {
    expect(typed(['1', '2', '+', '8', '.', '5'])).toBe('12+8.5');
    expect(evaluateExpression('12+8.5')).toBe(20.5);
    expect(typed(['3', '×', '4', '÷', '2', '−', '1'])).toBe('3*4/2-1');
  });
  it('needs a number before an operator and replaces a trailing one', () => {
    expect(typed(['+'])).toBe('');
    expect(applyKey('', '×').rejected).toBe(true);
    expect(typed(['5', '+', '×'])).toBe('5*');
    expect(typed(['5', '.', '+'])).toBe('5+');
  });
  it('replaces a leading zero', () => {
    expect(typed(['0', '0', '7'])).toBe('7');
    expect(typed(['1', '+', '0', '4'])).toBe('1+4');
  });
  it('allows one point and two decimals per number', () => {
    expect(applyKey('1.25', '9').rejected).toBe(true);
    expect(applyKey('1.25', '9').expr).toBe('1.25');
    expect(applyKey('1.2', '.').rejected).toBe(true);
    expect(typed(['1', '.', '2', '5', '+', '3', '.', '5'])).toBe('1.25+3.5');
    expect(typed(['.', '5'])).toBe('0.5');
    expect(typed(['2', '+', '.'])).toBe('2+0.');
  });
  it('caps a number at nine whole digits', () => {
    expect(applyKey('123456789', '0').rejected).toBe(true);
    expect(applyKey('123456789', '.').rejected).toBe(false);
  });
  it('deletes one character', () => {
    expect(applyKey('12', 'back').expr).toBe('1');
    expect(applyKey('5+', 'back').expr).toBe('5');
    expect(applyKey('', 'back')).toEqual({ expr: '', rejected: true });
  });
});

describe('keyFromKeyboard', () => {
  it('maps typing keys', () => {
    expect(key(',')).toBe('.');
    expect(key('.')).toBe('.');
    expect(key('7')).toBe('7');
    expect(key('+')).toBe('+');
    expect(key('-')).toBe('−');
    expect(key('*')).toBe('×');
    expect(key('x')).toBe('×');
    expect(key('/')).toBe('÷');
    expect(key('Backspace')).toBe('back');
  });
  it('ignores other keys and shortcuts', () => {
    expect(key('a')).toBeNull();
    expect(key('Enter')).toBeNull();
    expect(key('7', { metaKey: true })).toBeNull();
    expect(key('7', { ctrlKey: true })).toBeNull();
  });
});
