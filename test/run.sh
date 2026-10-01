#!/bin/bash
# Print@ test runner: syntax-check every JS file, then run each regression test in
# test/regress/*.js (a test passes when it exits 0). Used by the dev agent and by hand.
cd "$(dirname "$0")/.."
fail=0
for f in $(git ls-files '*.js' | grep -v node_modules | grep -v email-worker); do node --check "$f" 2>/dev/null || { echo "SYNTAX FAIL: $f"; node --check "$f"; fail=1; }; done
for t in test/regress/*.js; do [ -e "$t" ] || continue; if node "$t" >/tmp/printat-test.out 2>&1; then echo "ok   $t"; else echo "FAIL $t"; cat /tmp/printat-test.out | tail -20; fail=1; fi; done
[ $fail = 0 ] && echo "ALL PASSED" || echo "FAILURES"
exit $fail
