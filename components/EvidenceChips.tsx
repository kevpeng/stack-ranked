import type { Item } from '@/lib/types';
import { formatAge, formatArr, estimateLabel } from '@/app/_lib/format';
import { Chip } from './Chip';

/**
 * The evidence a duel card needs to be judgeable in ~5 seconds (docs/01):
 * labels, estimate, requester+role, ARR, customer count, age. Never rank
 * or score — those are not passed in and must never be added here.
 */
export function EvidenceChips({ item, dense = false }: { item: Item; dense?: boolean }) {
  const { evidence } = item;
  return (
    <div className={`flex flex-wrap gap-1.5 ${dense ? '' : 'mt-3'}`}>
      {item.labels.slice(0, 3).map((label) => (
        <Chip key={label}>🏷 {label}</Chip>
      ))}
      {item.estimate !== null && <Chip title={`${item.estimate} points`}>⏱ {estimateLabel(item.estimate)}</Chip>}
      {evidence.requester && (
        <Chip>
          👤 {evidence.requester}
          {evidence.requesterRole ? ` (${evidence.requesterRole})` : ''}
        </Chip>
      )}
      {evidence.arr !== undefined && <Chip title="Annual recurring revenue cited">💰 {formatArr(evidence.arr)} ARR</Chip>}
      {evidence.customers !== undefined && (
        <Chip title="Customers who raised this">
          👥 {evidence.customers} customer{evidence.customers === 1 ? '' : 's'}
        </Chip>
      )}
      <Chip title="Age since created in the tracker">📅 {formatAge(item.createdAtExternal)}</Chip>
    </div>
  );
}
