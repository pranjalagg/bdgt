// The Log keypad's typing rules. The expression uses + - * / so the
// currency parser (evaluateExpression, isValidCurrency) reads it unchanged.

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '+' | '−' | '×' | '÷' | 'back';

const OPS: Record<string, string> = { '+': '+', '−': '-', '×': '*', '÷': '/' };
const MAX_WHOLE_DIGITS = 9;

const isOp = (c: string) => c === '+' || c === '-' || c === '*' || c === '/';

// Operators replace a trailing operator and need a number first; each
// number takes one point, two decimals and at most nine whole digits; a
// lone leading 0 is replaced by the next digit.
export function applyKey(expr: string, key: KeypadKey): { expr: string; rejected: boolean } {
  const no = { expr, rejected: true };
  if (key === 'back') return expr ? { expr: expr.slice(0, -1), rejected: false } : no;

  const lastOp = Math.max(...['+', '-', '*', '/'].map((o) => expr.lastIndexOf(o)));
  const head = expr.slice(0, lastOp + 1);
  const num = expr.slice(lastOp + 1);

  if (key in OPS) {
    if (!expr) return no;
    let body = expr;
    if (isOp(body[body.length - 1])) body = body.slice(0, -1);
    if (body.endsWith('.')) body = body.slice(0, -1);
    return { expr: body + OPS[key], rejected: false };
  }

  if (key === '.') {
    if (num.includes('.')) return no;
    return { expr: head + (num || '0') + '.', rejected: false };
  }

  const [whole, decimals] = num.split('.');
  if (decimals !== undefined) {
    if (decimals.length >= 2) return no;
    return { expr: expr + key, rejected: false };
  }
  if (whole === '0') return { expr: head + key, rejected: false };
  if (whole.length >= MAX_WHOLE_DIGITS) return no;
  return { expr: expr + key, rejected: false };
}

// A physical key as a keypad key, or null when it is not one (or is part
// of a shortcut such as Cmd+K).
export function keyFromKeyboard(e: KeyboardEvent): KeypadKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const k = e.key;
  if (/^[0-9]$/.test(k)) return k as KeypadKey;
  switch (k) {
    case '.':
    case ',':
      return '.';
    case '+':
      return '+';
    case '-':
      return '−';
    case '*':
    case 'x':
      return '×';
    case '/':
      return '÷';
    case 'Backspace':
      return 'back';
    default:
      return null;
  }
}
