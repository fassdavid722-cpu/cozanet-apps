import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yjwhpprzyuvlizzdywfg.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Check if tables exist
  const results: any = {};

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_files?limit=1`, {
      headers,
    });
    results.aiFilesExists = resp.ok;
    if (!resp.ok) results.aiFilesError = await resp.text();
  } catch (e: any) {
    results.aiFilesError = e.message;
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_secrets?limit=1`, {
      headers,
    });
    results.aiSecretsExists = resp.ok;
    if (!resp.ok) results.aiSecretsError = await resp.text();
  } catch (e: any) {
    results.aiSecretsError = e.message;
  }

  // Return the SQL that needs to be run manually
  results.sql = `
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/yjwhpprzyuvlizzdywfg/sql/new-query

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
  `.trim();

  return NextResponse.json(results);
}
