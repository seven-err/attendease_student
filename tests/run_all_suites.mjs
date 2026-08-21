import { execSync } from 'node:child_process';

const suites = [
  'phase8_security_acceptance.test.mjs',
  'phase7_accessibility_test.mjs',
  'phase6_unit_test.mjs',
  'phase6_manual_acceptance.mjs',
  'phase5_unit_test.mjs',
  'phase4_unit_test.mjs',
  'phase3_unit_test.mjs',
  'security_phase2_audit.test.mjs',
  'phase2_manual_acceptance.test.mjs',
  'phase3_role_isolation.test.mjs',
  'phase9_adversarial_audit.test.mjs',
  'phase10_load_test.mjs',
  'phase11_realtime_debounce.test.mjs',
  'phase12_production_audit.test.mjs',
  'phase13_release_readiness.test.mjs'
];

console.log('========================================================================================');
console.log(' Suite                                                | Result | Passed | Failed');
console.log('========================================================================================');

let grandTotalPassed = 0;
let grandTotalFailed = 0;

for (const s of suites) {
  try {
    const out = execSync('node tests/' + s, { encoding: 'utf8' });
    
    // Extract actual reported assertion count or fall back to match count
    let count = 0;
    const reportedMatch = out.match(/(\d+)\s+Passed/i) || 
                          out.match(/(\d+)\s+PASSED/i) ||
                          out.match(/(\d+)\s+total checks passing/i) ||
                          out.match(/(\d+)\s+tests passed/i);
    
    if (reportedMatch) {
      count = parseInt(reportedMatch[1], 10);
    } else {
      const passMatches = (out.match(/PASS/g) || []).length;
      count = passMatches;
    }

    console.log(` ${s.padEnd(52)} | PASS   | ${String(count).padEnd(6)} | 0`);
    grandTotalPassed += count;
  } catch (err) {
    console.error(` ${s.padEnd(52)} | FAIL   | 0      | 1`);
    grandTotalFailed++;
  }
}

console.log('========================================================================================');
console.log(` TOTAL VERIFIED ASSERTIONS ACROSS 15 SUITES: ${grandTotalPassed} PASSED, ${grandTotalFailed} FAILED`);
console.log('========================================================================================');
