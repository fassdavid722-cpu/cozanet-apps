/**
 * Memory API — CRUD for the CozanetOS sidebar memory panel
 *
 * GET    /api/memory        → list all memories
 * POST   /api/memory        → save a memory { content, category? }
 * DELETE /api/memory        → forget a memory { id }
 *
 * Uses Supabase ai_memory table with memory_type 'MEMORY' for persistent memories
 * (distinct from 'CHAT_USER'/'CHAT_ASSISTANT' which are conversation history).
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

interface MemoryItem {
  id: string;
  text: string;
  tag: string;
  category?: string;
  created_at?: string;
}

// GET — list all persistent memories
export async function GET() {
  if (!SUPABASE_KEY) {
    return NextResponse.json([]);
  }

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_memory?memory_type=eq.MEMORY&is_active=eq.true&order=created_at.desc&limit=100&select=id,content,importance,source,created_at`,
      { headers: HEADERS }
    );

    if (!resp.ok) {
      console.error('[memory API] GET failed:', resp.status);
      return NextResponse.json([]);
    }

    const data = await resp.json() as any[];
    const memories: MemoryItem[] = data.map(r => ({
      id: r.id,
      text: r.content,
      tag: r.source || 'memory',
      category: r.importance > 7 ? 'important' : 'general',
      created_at: r.created_at,
    }));

    return NextResponse.json(memories);
  } catch (err: any) {
    console.error('[memory API] GET error:', err.message);
    return NextResponse.json([]);
  }
}

// POST — save a new memory
export async function POST(req: NextRequest) {
  const { content, category } = await req.json();

  if (!content) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  if (!SUPABASE_KEY) {
    return NextResponse.json({ id: 'local-' + Date.now(), text: content, tag: category || 'memory' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_memory`, {
      method: 'POST',
      headers: { ...HEADERS, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        memory_type: 'MEMORY',
        content,
        importance: category === 'important' ? 8 : 5,
        source: category || 'memory',
        is_active: true,
      }),
    });

    if (!resp.ok) {
      console.error('[memory API] POST failed:', resp.status);
      return NextResponse.json({ error: 'Failed to save memory' }, { status: 500 });
    }

    const data = await resp.json() as any[];
    const created = data[0];
    return NextResponse.json({
      id: created?.id || 'new',
      text: content,
      tag: category || 'memory',
    });
  } catch (err: any) {
    console.error('[memory API] POST error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — forget a memory
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

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
