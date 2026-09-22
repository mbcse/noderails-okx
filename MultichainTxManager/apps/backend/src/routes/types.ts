/**
 * Express 5 types `req.params` values as `string | string[]`.
 * Since we validate all params with Zod, they are guaranteed to be strings
 * by the time our handlers run. This helper safely extracts a string param.
 */
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0];
  return value ?? "";
}
