-- CozanetOS Sandbox Tables
-- Run these in the Supabase SQL editor: https://supabase.com/dashboard/project/yjwhpprzyuvlizzdywfg/sql/new-query

-- ── File System Table ──
CREATE TABLE IF NOT EXISTS ai_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  language TEXT DEFAULT 'text',
  session_id TEXT NOT NULL DEFAULT 'global',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow upserts by filename + session_id
CREATE UNIQUE INDEX IF NOT EXISTS ai_files_filename_session_idx 
  ON ai_files (filename, session_id);

-- Enable RLS (row-level security)
ALTER TABLE ai_files ENABLE ROW LEVEL SECURITY;

-- Allow all operations with service_role key
CREATE POLICY "Service role full access" ON ai_files
  FOR ALL USING (true) WITH CHECK (true);

-- ── Secrets Table ──
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

CREATE POLICY "Service role full access" ON ai_secrets
  FOR ALL USING (true) WITH CHECK (true);

-- ── Done! ──
-- After running this, set these env vars in Vercel:
-- GITHUB_TOKEN = your GitHub personal access token (repo scope)
-- SECRET_OBFUSCATION_KEY = any random string (for encrypting secrets)
