/** Canonical keyword key for cross-tab matching: lowercase + collapse runs of
 *  whitespace to a single space + trim. The ASO tabs sometimes carry double
 *  spaces ("accounting  expenses") while Master KW Lookup / KW_Added_Manual
 *  store the single-space form — exact lowercase matching missed those. */
export function normKw(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
