/**
 * Evaluates filterConditions against decoded event args.
 *
 * Filter format:
 *   {
 *     "args.to":    { "in": ["0xabc...", "0xdef..."] },
 *     "args.from":  { "eq": "0x123..." },
 *     "args.value": { "gte": "1000000000000000000" }
 *   }
 *
 * Supported operators:
 *   eq   – strict equality (case-insensitive for strings)
 *   neq  – not equal
 *   in   – value is in array (case-insensitive for strings)
 *   nin  – value is NOT in array
 *   gt   – greater than (numeric comparison)
 *   gte  – greater than or equal
 *   lt   – less than
 *   lte  – less than or equal
 *
 * All conditions are ANDed — every field must match.
 */

type Operator = 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte';
type Condition = Partial<Record<Operator, any>>;
export type FilterConditions = Record<string, Condition>;

/**
 * Returns true if decoded args satisfy ALL filter conditions.
 * If filterConditions is null/undefined/empty → always matches.
 */
export function matchesFilter(
  args: Record<string, any>,
  filterConditions: FilterConditions | null | undefined,
): boolean {
  if (!filterConditions || Object.keys(filterConditions).length === 0) {
    return true;
  }

  for (const [path, condition] of Object.entries(filterConditions)) {
    const value = resolvePath(args, path);
    if (!evaluateCondition(value, condition)) {
      return false; // AND logic — first failure → reject
    }
  }

  return true;
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Resolve a dot-path like "args.to" against the args object.
 * The leading "args." is optional — "to" and "args.to" both work.
 */
function resolvePath(args: Record<string, any>, path: string): any {
  // Strip leading "args." prefix if present
  const cleanPath = path.startsWith('args.') ? path.slice(5) : path;
  const parts = cleanPath.split('.');
  let current: any = args;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/** Compare two values as lowercase strings */
function ciEqual(a: any, b: any): boolean {
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/** Parse both sides to BigInt for numeric comparison, fall back to string */
function numericCompare(a: any, b: any): number {
  try {
    const aBig = BigInt(a);
    const bBig = BigInt(b);
    if (aBig < bBig) return -1;
    if (aBig > bBig) return 1;
    return 0;
  } catch {
    // Fallback to string comparison
    const aStr = String(a);
    const bStr = String(b);
    return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
  }
}

function evaluateCondition(value: any, condition: Condition): boolean {
  for (const [op, expected] of Object.entries(condition)) {
    switch (op as Operator) {
      case 'eq':
        if (!ciEqual(value, expected)) return false;
        break;
      case 'neq':
        if (ciEqual(value, expected)) return false;
        break;
      case 'in':
        if (!Array.isArray(expected)) return false;
        if (!expected.some((e: any) => ciEqual(value, e))) return false;
        break;
      case 'nin':
        if (!Array.isArray(expected)) return false;
        if (expected.some((e: any) => ciEqual(value, e))) return false;
        break;
      case 'gt':
        if (numericCompare(value, expected) <= 0) return false;
        break;
      case 'gte':
        if (numericCompare(value, expected) < 0) return false;
        break;
      case 'lt':
        if (numericCompare(value, expected) >= 0) return false;
        break;
      case 'lte':
        if (numericCompare(value, expected) > 0) return false;
        break;
      default:
        // Unknown operator — skip (lenient)
        break;
    }
  }
  return true;
}
