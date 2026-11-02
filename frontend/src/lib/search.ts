/**
 * A route's search check that also clears what it leaves out. The router
 * gives a page the address's whole search with the checked values written
 * over it, so a value the check drops (a mistyped status, page=abc) would
 * otherwise still reach the page, and its request.
 */
export function onlyChecked<
  Check extends (raw: Record<string, unknown>) => object,
>(check: Check): Check {
  return ((raw: Record<string, unknown>) => ({
    ...Object.fromEntries(Object.keys(raw).map((key) => [key, undefined])),
    ...check(raw),
  })) as Check;
}
