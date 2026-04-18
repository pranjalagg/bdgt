export function calculateUnallocated(
  income: number,
  allocations: Record<string, number>
): number {
  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
  return income - totalAllocated;
}

export function calculateBucketRemaining(
  allocated: number,
  spent: number,
  rollover: number
): number {
  return allocated + rollover - spent;
}

export function getBucketStatus(
  allocated: number,
  spent: number
): 'success' | 'warning' | 'danger' {
  if (spent > allocated) return 'danger';
  if (allocated > 0 && spent >= allocated * 0.9) return 'warning';
  return 'success';
}

export function calculateTotalSpent(spent: Record<string, number>): number {
  return Object.values(spent).reduce((sum, val) => sum + val, 0);
}

export function calculateTotalAllocated(allocations: Record<string, number>): number {
  return Object.values(allocations).reduce((sum, val) => sum + val, 0);
}
