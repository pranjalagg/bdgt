export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatCurrency(cents: number): string {
  const dollars = centsToDollars(Math.abs(cents));
  const formatted = dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

export function parseCurrency(value: string): number {
  const result = evaluateExpression(value);
  if (result === null) return 0;
  return dollarsToCents(result);
}

const TOKEN_PATTERN = /^(?:\d+\.?\d{0,2}|\.\d{1,2})$/;

function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function evaluateExpression(value: string): number | null {
  const cleaned = value.replace(/[$,]/g, '').trim();
  if (!cleaned) return null;

  const tokens = cleaned.split(/\s*([\+\-])\s*/);
  if (tokens.length === 0) return null;

  if (!isValidToken(tokens[0])) return null;
  let result = parseFloat(tokens[0]);

  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const operand = tokens[i + 1];
    if (!operand || !isValidToken(operand)) return null;
    const num = parseFloat(operand);
    if (op === '+') result += num;
    else if (op === '-') result -= num;
    else return null;
  }

  result = Math.round(result * 100) / 100;
  return isFinite(result) ? result : null;
}

export function isExpression(value: string): boolean {
  const cleaned = value.replace(/[$,]/g, '').trim();
  return /[\+\-]/.test(cleaned) && cleaned.length > 1;
}

export function isValidCurrency(value: string): boolean {
  const result = evaluateExpression(value);
  return result !== null && result > 0;
}
