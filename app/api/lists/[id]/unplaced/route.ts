/**
 * GET /api/lists/:id/unplaced — coord/CONTRACTS.md "HTTP API".
 * Owned by @backend.
 */

import { NextResponse } from 'next/server';
import { getList, getUnplacedItems } from '@/lib/db/queries';
import { jsonError } from '@/app/api/_shared';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) return jsonError('list not found', 404);

  const items = await getUnplacedItems(id);
  return NextResponse.json({ items });
}
