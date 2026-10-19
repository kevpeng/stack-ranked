/**
 * `npm run linear:check` — preflight.
 *
 * Verifies the API key works and shows what is importable, so a bad key or an
 * empty team fails here with a readable message instead of halfway through an
 * import.
 */

import { fetchTeams, fetchViewer, fetchIssues, deriveSummaryLine } from './issues';
import { LinearError } from './client';

async function main() {
  const viewer = await fetchViewer();
  console.log(`\n  Connected to Linear as ${viewer.name} <${viewer.email}>\n`);

  const teams = await fetchTeams();
  if (teams.length === 0) {
    console.log('  No teams visible to this key.');
    return;
  }

  console.log(`  Teams (${teams.length}):\n`);
  for (const t of teams) {
    const issues = await fetchIssues({ teamKey: t.key, limit: 500 });
    const duelable = issues.filter((i) => i.summaryLine.length > 0).length;
    const flag = issues.length === 0 ? '  (no open issues)' : '';
    console.log(`    ${t.key.padEnd(8)} ${t.name.padEnd(28)} ${String(issues.length).padStart(4)} open issues, ${duelable} with a usable summary${flag}`);
  }

  console.log('\n  Import one with:  npm run linear:import -- --team <KEY>\n');
}

main().catch((err) => {
  console.error(`\n${err instanceof LinearError ? err.message : err}\n`);
  process.exit(1);
});
