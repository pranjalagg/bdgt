// Ascending ranks starting at 1; tied values share the average of the ranks
// they span.
export function rankWithTies(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const average = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k][1]] = average;
    i = j + 1;
  }
  return ranks;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Population standard deviation.
function sd(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
}

export function pearson(x: number[], y: number[]): number | null {
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// Rank correlation: compares which months were high or low, not by how much,
// so the size of a one-off spike cannot dominate. It does not make the result
// immune to one month: a month that moves to a new rank can still swing it,
// which is what isStable checks. Null when either series is constant.
export function spearman(x: number[], y: number[]): number | null {
  return pearson(rankWithTies(x), rankWithTies(y));
}

// Leave-one-month-out check: the relation holds only if dropping any single
// month still leaves a correlation of the same sign and at least `floor` in
// strength. A relation that one month creates or flips is not stable.
export function isStable(x: number[], y: number[], floor: number): boolean {
  const rho = spearman(x, y);
  if (rho === null) return false;
  for (let i = 0; i < x.length; i++) {
    const r = spearman(
      x.filter((_, k) => k !== i),
      y.filter((_, k) => k !== i)
    );
    if (r === null || Math.sign(r) !== Math.sign(rho) || Math.abs(r) < floor) return false;
  }
  return true;
}

// How much steadier the combined total is than if the two were independent:
// combinedSd / sqrt(sdA^2 + sdB^2). Below 1 means they offset each other.
// Returned as a whole percent, or null unless it rounds to at least 1.
export function steadierBy(x: number[], y: number[]): number | null {
  const denominator = Math.sqrt(sd(x) ** 2 + sd(y) ** 2);
  if (denominator === 0) return null;
  const combined = x.map((v, i) => v + y[i]);
  const percent = Math.round((1 - sd(combined) / denominator) * 100);
  return percent >= 1 ? percent : null;
}
