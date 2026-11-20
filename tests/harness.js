/**
 * harness.js - tiny assertion harness (no npm). Works in the browser and in Node.
 */
export function createHarness() {
  const results = [];
  let current = null;

  function record(pass, msg) {
    if (!pass) current.failures.push(msg);
  }

  return {
    results,
    /** Define and immediately run a test (sync or async). */
    async test(name, fn) {
      current = { name, failures: [] };
      try {
        await fn();
      } catch (e) {
        current.failures.push(`threw: ${e && e.message ? e.message : e}`);
      }
      results.push(current);
    },
    ok: (cond, msg = 'expected truthy') => record(!!cond, msg),
    eq(actual, expected, msg = '') {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      record(a === b, `${msg} expected ${b} got ${a}`.trim());
    },
    throws(fn, msg = 'expected throw') {
      try { fn(); record(false, msg); } catch { record(true, msg); }
    },
    summary() {
      const failed = results.filter((r) => r.failures.length);
      return { total: results.length, failed: failed.length, passed: results.length - failed.length, failedTests: failed };
    },
  };
}
