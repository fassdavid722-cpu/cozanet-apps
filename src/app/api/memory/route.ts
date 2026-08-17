/**
 * Memory API — CRUD for the CozanetOS sidebar memory panel
 *
 * GET    /api/memory        → list all memories [{id, content, category, created_at}]
 * POST   /api/memory        → save a memory { content, category? }
 * DELETE /api/memory        → forget a memory { id }
 *
 * Uses Supabase ai_memory table with memory_type 'MEMORY' for persistent memories
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yjwhpprzyuvlizzdywfg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// GET — list all persistent memories (field names match frontend MemoryItem)
export async function GET() {
  if (!SUPABASE_KEY) {
    return NextResponse.json({ memories: [] });
  }

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?memory_type=eq.MEMORY&is_active=eq.true&order=created_at.desc&limit=100&select=id,content,importance,source,created_at`,
      { headers: HEADERS }
    );

    if (!resp.ok) {
      return NextResponse.json({ memories: [] });
    }

    const data = await resp.json() as any[];
    const memories = data.map(r => ({
      id: r.id,
      content: r.content,
      category: r.source || 'general',
      created_at: r.created_at,
    }));

    return NextResponse.json({ memories });
  } catch {
    return NextResponse.json({ memories: [] });
  }
}

// POST — save a new memory
export async function POST(req: NextRequest) {
  const { content, category } = await req.json();

  if (!content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  if (!SUPABASE_KEY) {
    return NextResponse.json({ id: 'local-' + Date.now(), content, category: category || 'general' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_memory`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        memory_type: 'MEMORY',
        content,
        importance: 5,
        source: category || 'general',
        is_active: true,
      }),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: 'Failed to save memory' }, { status: 500 });
    }

    const data = await resp.json() as any[];
    const created = data[0];
    return NextResponse.json({
      id: created?.id || 'new',
      content,
      category: category || 'general',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — forget a memory (accepts id in body OR query param)
export async function DELETE(req: NextRequest) {
  let id: string | null = null;

  // Try body first (frontend sends JSON body)
  try {
    const body = await req.json();
    id = body.id;
  } catch {
    // Fall back to query param
  }

  if (!id) {
    const { searchParams } = new URL(req.url);
    id = searchParams.get('id');
  }

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  if (!SUPABASE_KEY) {
    return NextResponse.json({ success: true });
  }

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?id=eq.${id}`,
      { method: 'DELETE', headers: HEADERS }
    );

    if (!resp.ok) {
      return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
