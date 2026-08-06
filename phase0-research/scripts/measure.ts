/**
 * FlareKit Phase 0 — Timing Measurement Helper
 *
 * Usage: npx tsx scripts/measure.ts
 */

interface TimingResult {
  step: string;
  start: number;
  end: number;
  duration: number;
}

const results: TimingResult[] = [];

function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`\n⏱  [${label}] Starting...`);
  return fn()
    .then((result) => {
      const end = Date.now();
      const duration = end - start;
      results.push({ step: label, start, end, duration });
      console.log(`   ✓ Done in ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
      return result;
    })
    .catch((err) => {
      const end = Date.now();
      results.push({ step: label, start, end, duration: end - start });
      console.log(`   ✗ Failed after ${end - start}ms:`, err.message);
      throw err;
    });
}

function printSummary() {
  console.log("\n" + "━".repeat(50));
  console.log("  Timing Summary");
  console.log("━".repeat(50));

  let total = 0;
  results.forEach(r => {
    console.log(`  ${r.step.padEnd(30)} ${(r.duration / 1000).toFixed(1).padStart(6)}s`);
    total += r.duration;
  });

  console.log("─".repeat(50));
  console.log(`  ${"TOTAL".padEnd(30)} ${(total / 1000).toFixed(1).padStart(6)}s`);
  console.log("━".repeat(50));
}

// Export for use in research scripts
export { time, printSummary, results, TimingResult };
