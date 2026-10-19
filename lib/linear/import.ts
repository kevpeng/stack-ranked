/**
 * `npm run linear:import -- --team ENG [--capacity 15] [--limit 150] [--name "..."]`
 *
 * Pulls a Linear team's open issues and creates a Stack Ranked list from them,
 * seeded with Linear's own backlog order (docs/02 §5) so the seed-vs-settled
 * diff has something real to compare against.
 */

import { createList, listLists } from '../db/queries';
import { fetchIssues } from './issues';
import { LinearError } from './client';
import type { Item, ItemId } from '../types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

/** Same ordering rule as the fixture seed: Linear's sortOrder, then priority. */
function computeSeedOrder(items: Item[]): ItemId[] {
  return [...items]
    .sort((a, b) => {
      const as = a.externalSortOrder ?? Number.POSITIVE_INFINITY;
      const bs = b.externalSortOrder ?? Number.POSITIVE_INFINITY;
      if (as !== bs) return as - bs;
      const ap = a.externalPriority ?? Number.POSITIVE_INFINITY;
      const bp = b.externalPriority ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return a.title.localeCompare(b.title);
    })
    .map((i) => i.id);
}

async function main() {
  const teamKey = arg('team');
  if (!teamKey) {
    console.error('\n  --team is required.  Run `npm run linear:check` to see your team keys.\n');
    process.exit(1);
  }
  const limit = Number(arg('limit') ?? 150);
  const capacityItems = Number(arg('capacity') ?? 15);

  console.log(`\n  Fetching open issues for team ${teamKey}...`);
  const all = await fetchIssues({ teamKey, limit });

  if (all.length === 0) {
    console.error(`\n  No open issues found for team "${teamKey}". Check the key with \`npm run linear:check\`.\n`);
    process.exit(1);
  }

  // An item with no usable one-liner cannot be judged on a duel card (docs/01),
  // so it is left out rather than shipped as an unjudgeable pair. Reported so
  // the gap is visible instead of silent.
  const duelable = all.filter((i) => i.summaryLine.length > 0);
  const skipped = all.length - duelable.length;

  if (duelable.length < 2) {
    console.error(
      `\n  Only ${duelable.length} of ${all.length} issues have a usable description, so there is nothing to rank.\n` +
        '  Stack Ranked needs a one-line problem statement per issue to build a duel card.\n' +
        '  Add descriptions in Linear, or pass --allow-title-only to fall back to titles.\n',
    );
    if (process.argv.includes('--allow-title-only') === false) process.exit(1);
  }

  const items = process.argv.includes('--allow-title-only')
    ? all.map((i) => (i.summaryLine ? i : { ...i, summaryLine: i.title }))
    : duelable;

  const name = arg('name') ?? `${teamKey} backlog (Linear)`;
  const list = await createList({
    name,
    capacityItems: Math.min(capacityItems, items.length - 1),
    items,
    seedOrder: computeSeedOrder(items),
  });

  console.log(`\n  Created "${list.name}" with ${items.length} items.`);
  if (skipped > 0 && !process.argv.includes('--allow-title-only')) {
    console.log(`  Skipped ${skipped} issue${skipped === 1 ? '' : 's'} with no usable description.`);
    console.log('  (Re-run with --allow-title-only to include them using their titles.)');
  }
  console.log(`\n  List id: ${list.id}`);
  console.log(`  Start ranking:  npm run dev  ->  http://localhost:3000/lists/${list.id}/duel\n`);

  const count = (await listLists()).length;
  if (count > 1) console.log(`  (You now have ${count} lists; see http://localhost:3000/)\n`);
}

main().catch((err) => {
  console.error(`\n${err instanceof LinearError ? err.message : err}\n`);
  process.exit(1);
});
