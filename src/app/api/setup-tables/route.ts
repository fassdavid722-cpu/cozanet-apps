import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yjwhpprzyuvlizzdywfg.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  const results: any = {};

  // Check each table
  for (const table of ['ai_files', 'ai_secrets', 'ai_knowledge', 'ai_memory']) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, { headers });
      results[`${table}Exists`] = resp.ok;
      if (!resp.ok) results[`${table}Error`] = await resp.text();
    } catch (e: any) {
      results[`${table}Error`] = e.message;
    }
  }

  results.sql = `
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/yjwhpprzyuvlizzdywfg/sql/new-query

-- File system table
CREATE TABLE IF NOT EXISTS ai_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  language TEXT DEFAULT 'text',
  session_id TEXT NOT NULL DEFAULT 'global',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_files_filename_session_idx ON ai_files (filename, session_id);
ALTER TABLE ai_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON ai_files FOR ALL USING (true) WITH CHECK (true);

-- Secrets table
CREATE TABLE IF NOT EXISTS ai_secrets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key_name TEXT NOT NULL UNIQUE,
  key_value TEXT NOT NULL,
  service TEXT DEFAULT 'general',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON ai_secrets FOR ALL USING (true) WITH CHECK (true);

-- Knowledge base table (for deep research / learning)
CREATE TABLE IF NOT EXISTS ai_knowledge (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  content TEXT NOT NULL DEFAULT '',
  summary TEXT DEFAULT '',
  sources JSONB DEFAULT '[]'::jsonb,
  confidence FLOAT DEFAULT 0.8,
  freshness TIMESTAMPTZ DEFAULT NOW(),
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_topic_idx ON ai_knowledge (topic);
ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON ai_knowledge FOR ALL USING (true) WITH CHECK (true);

-- Memory table (already exists if you set it up before, but here for completeness)
CREATE TABLE IF NOT EXISTS ai_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT DEFAULT 'user',
  memory_type TEXT DEFAULT 'MEMORY',
  importance INT DEFAULT 5,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON ai_memory FOR ALL USING (true) WITH CHECK (true);
  `.trim();

  return NextResponse.json(results);
}

export async function GET() {
  return POST(new NextRequest('https://localhost/api/setup-tables', { method: 'POST' }));
}
