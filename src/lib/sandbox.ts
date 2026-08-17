/**
 * Sandbox — Code execution via Piston API + file system + GitHub + Secrets
 * 
 * Piston is a free, open-source code execution engine that supports 50+ languages.
 * Public API: https://emkc.org/api/v2/piston/execute
 */

// ── Code Execution (Piston API) ──

export interface CodeResult {
  stdout: string;
  stderr: string;
  error: string | null;
  exitCode: number | null;
}

const PISTON_API = 'https://emkc.org/api/v2/piston/execute';

// Language version mapping
const LANGUAGE_VERSIONS: Record<string, string> = {
  python: '3.10.0',
  python3: '3.10.0',
  javascript: '18.15.0',
  js: '18.15.0',
  typescript: '5.0.3',
  ts: '5.0.3',
  bash: '5.2.0',
  sh: '5.2.0',
  ruby: '3.0.1',
  go: '1.16.2',
  rust: '1.68.2',
  java: '15.0.2',
  c: '10.2.0',
  cpp: '10.2.0',
  csharp: '6.4.0',
  php: '8.2.3',
  swift: '5.2.5',
  kotlin: '1.8.20',
  lua: '5.4.4',
  r: '4.2.1',
  dart: '2.19.6',
  scala: '3.2.2',
  sql: '3.36.0',
  perl: '5.36.0',
  haskell: '9.0.2',
  elixir: '1.14.2',
  ocaml: '4.14.0',
  crystal: '1.8.0',
  nim: '1.6.14',
  zig: '0.10.1',
  julia: '1.8.5',
};

export async function executeCode(
  code: string,
  language: string = 'python',
  injectedVars?: Record<string, string>,
): Promise<CodeResult> {
  const lang = language.toLowerCase();
  const version = LANGUAGE_VERSIONS[lang] || '3.10.0';

  // For Python, inject secrets as environment variables
  let fullCode = code;
  if (injectedVars && Object.keys(injectedVars).length > 0) {
    if (lang === 'python' || lang === 'python3') {
      const envSetup = Object.entries(injectedVars)
        .map(([k, v]) => `import os; os.environ['${k.replace(/'/g, '')}'] = '${v.replace(/'/g, "\\'")}'`)
        .join('; ');
      fullCode = envSetup + '\n' + code;
    } else if (lang === 'javascript' || lang === 'js') {
      const envSetup = Object.entries(injectedVars)
        .map(([k, v]) => `process.env['${k}'] = '${v.replace(/'/g, "\\'")}'`)
        .join('; ');
      fullCode = envSetup + '\n' + code;
    }
  }

  try {
    const resp = await fetch(PISTON_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: lang === 'python3' ? 'python' : lang,
        version,
        files: [{ name: 'main', content: fullCode }],
        stdin: '',
        args: [],
        compile_timeout: 10000,
        run_timeout: 15000,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { stdout: '', stderr: '', error: `Piston API error (${resp.status}): ${errText}`, exitCode: null };
    }

    const data = await resp.json() as any;

    // Piston returns { run: { stdout, stderr, code, signal, output }, compile: { ... } }
    const run = data.run || {};
    const compile = data.compile || {};

    let stderr = run.stderr || '';
    if (compile.stderr) stderr += compile.stderr;

    return {
      stdout: run.stdout || '',
      stderr: stderr,
      error: run.code !== 0 ? `Process exited with code ${run.code}` : null,
      exitCode: run.code ?? null,
    };
  } catch (err: any) {
    return { stdout: '', stderr: '', error: err.message, exitCode: null };
  }
}

// Keep the Python-specific function name for backward compat
export async function executePython(
  code: string,
  injectedVars?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; error: string | null; result: string | null }> {
  const result = await executeCode(code, 'python', injectedVars);
  return { stdout: result.stdout, stderr: result.stderr, error: result.error, result: null };
}

// ── File System (Supabase-backed) ──

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yjwhpprzyuvlizzdywfg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPA_HEADERS: Record<string, string> = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

export interface FileRecord {
  id: string;
  filename: string;
  content: string;
  language: string;
  session_id: string;
  created_at: string;
  updated_at: string;
}

export async function fileCreate(filename: string, content: string, language: string, sessionId: string): Promise<{ success: boolean; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    // Check if file exists
    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_files?filename=eq.${encodeURIComponent(filename)}&session_id=eq.${encodeURIComponent(sessionId)}&select=id&limit=1`,
      { headers: SUPA_HEADERS },
    );
    const existing = await existingResp.json() as any[];

    if (existing.length > 0) {
      // Update
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_files?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: { ...SUPA_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, language, updated_at: new Date().toISOString() }),
        },
      );
      return { success: resp.ok, error: resp.ok ? undefined : `Failed: ${resp.status}` };
    }

    // Create
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_files`, {
      method: 'POST',
      headers: { ...SUPA_HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ filename, content, language, session_id: sessionId }),
    });
    return { success: resp.ok, error: resp.ok ? undefined : `Failed: ${resp.status}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fileRead(filename: string, sessionId: string): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_files?filename=eq.${encodeURIComponent(filename)}&session_id=eq.${encodeURIComponent(sessionId)}&select=content&limit=1`,
      { headers: SUPA_HEADERS },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const data = await resp.json() as any[];
    if (!data.length) return { success: false, error: 'File not found' };
    return { success: true, content: data[0].content };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fileList(sessionId: string): Promise<{ success: boolean; files?: any[]; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_files?session_id=eq.${encodeURIComponent(sessionId)}&order=updated_at.desc&select=id,filename,language,created_at,updated_at`,
      { headers: SUPA_HEADERS },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const files = await resp.json();
    return { success: true, files };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fileUpdate(filename: string, content: string, sessionId: string): Promise<{ success: boolean; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_files?filename=eq.${encodeURIComponent(filename)}&session_id=eq.${encodeURIComponent(sessionId)}`,
      {
        method: 'PATCH',
        headers: { ...SUPA_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, updated_at: new Date().toISOString() }),
      },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fileDelete(filename: string, sessionId: string): Promise<{ success: boolean; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_files?filename=eq.${encodeURIComponent(filename)}&session_id=eq.${encodeURIComponent(sessionId)}`,
      { method: 'DELETE', headers: SUPA_HEADERS },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── GitHub Integration ──

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

export interface GitHubPushResult {
  success: boolean;
  commitUrl?: string;
  error?: string;
}

function getGithubHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

export async function githubPush(
  owner: string,
  repo: string,
  path: string,
  content: string,
  commitMessage: string,
  branch: string = 'main',
): Promise<GitHubPushResult> {
  if (!GITHUB_TOKEN) return { success: false, error: 'GitHub token not configured. Set GITHUB_TOKEN env var.' };

  try {
    // 1. Get the current commit SHA
    const branchResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      { headers: getGithubHeaders() },
    );
    if (!branchResp.ok) {
      const err = await branchResp.json().catch(() => ({}));
      return { success: false, error: `Branch ${branch} not found: ${err.message || branchResp.status}` };
    }
    const branchData = await branchResp.json() as any;
    const latestCommitSha = branchData.commit.sha;

    // 2. Get the tree SHA
    const commitResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${latestCommitSha}`,
      { headers: getGithubHeaders() },
    );
    const commitData = await commitResp.json() as any;
    const baseTreeSha = commitData.commit.tree.sha;

    // 3. Create a new blob
    const contentBase64 = Buffer.from(content).toString('base64');
    const blobResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
      {
        method: 'POST',
        headers: getGithubHeaders(),
        body: JSON.stringify({ content: contentBase64, encoding: 'base64' }),
      },
    );
    if (!blobResp.ok) {
      const err = await blobResp.json().catch(() => ({}));
      return { success: false, error: `Failed to create blob: ${err.message || blobResp.status}` };
    }
    const blobData = await blobResp.json() as any;

    // 4. Create a new tree
    const treeResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: 'POST',
        headers: getGithubHeaders(),
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: [{ path, mode: '100644', type: 'blob', sha: blobData.sha }],
        }),
      },
    );
    if (!treeResp.ok) {
      const err = await treeResp.json().catch(() => ({}));
      return { success: false, error: `Failed to create tree: ${err.message || treeResp.status}` };
    }
    const treeData = await treeResp.json() as any;

    // 5. Create a commit
    const newCommitResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: 'POST',
        headers: getGithubHeaders(),
        body: JSON.stringify({
          message: commitMessage,
          tree: treeData.sha,
          parents: [latestCommitSha],
        }),
      },
    );
    if (!newCommitResp.ok) {
      const err = await newCommitResp.json().catch(() => ({}));
      return { success: false, error: `Failed to create commit: ${err.message || newCommitResp.status}` };
    }
    const newCommitData = await newCommitResp.json() as any;

    // 6. Update the branch ref
    const refResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers: getGithubHeaders(),
        body: JSON.stringify({ sha: newCommitData.sha }),
      },
    );
    if (!refResp.ok) {
      const err = await refResp.json().catch(() => ({}));
      return { success: false, error: `Failed to update branch: ${err.message || refResp.status}` };
    }

    return { success: true, commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitData.sha}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function githubListRepos(): Promise<{ success: boolean; repos?: any[]; error?: string }> {
  if (!GITHUB_TOKEN) return { success: false, error: 'GitHub token not configured' };

  try {
    const resp = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=20&type=all',
      { headers: getGithubHeaders() },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const repos = await resp.json() as any[];
    return {
      success: true,
      repos: repos.map(r => ({ name: r.name, full_name: r.full_name, private: r.private, default_branch: r.default_branch, updated_at: r.updated_at })),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function githubListFiles(owner: string, repo: string, path: string = '', branch: string = 'main'): Promise<{ success: boolean; files?: any[]; error?: string }> {
  if (!GITHUB_TOKEN) return { success: false, error: 'GitHub token not configured' };

  try {
    const pathParam = path ? `/${path}` : '';
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents${pathParam}?ref=${branch}`,
      { headers: getGithubHeaders() },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const data = await resp.json();
    const items = Array.isArray(data) ? data : [data];
    return {
      success: true,
      files: items.map((f: any) => ({ name: f.name, path: f.path, type: f.type, size: f.size })),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function githubReadFile(owner: string, repo: string, path: string, branch: string = 'main'): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!GITHUB_TOKEN) return { success: false, error: 'GitHub token not configured' };

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      { headers: getGithubHeaders() },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const data = await resp.json() as any;
    if (data.encoding === 'base64') {
      return { success: true, content: Buffer.from(data.content, 'base64').toString('utf-8') };
    }
    return { success: false, error: 'Unexpected encoding' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Secret Management (Supabase-backed) ──

const SECRET_OBFUSCATION_KEY = process.env.SECRET_OBFUSCATION_KEY || 'cozanet-sandbox-default-key-2026';

function obfuscate(value: string): string {
  const result: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i) ^ SECRET_OBFUSCATION_KEY.charCodeAt(i % SECRET_OBFUSCATION_KEY.length);
    result.push(String.fromCharCode(charCode));
  }
  return Buffer.from(result.join('')).toString('base64');
}

function deobfuscate(value: string): string {
  const decoded = Buffer.from(value, 'base64').toString('utf-8');
  const result: string[] = [];
  for (let i = 0; i < decoded.length; i++) {
    const charCode = decoded.charCodeAt(i) ^ SECRET_OBFUSCATION_KEY.charCodeAt(i % SECRET_OBFUSCATION_KEY.length);
    result.push(String.fromCharCode(charCode));
  }
  return result.join('');
}

export async function secretStore(
  keyName: string,
  keyValue: string,
  service: string,
  description: string,
): Promise<{ success: boolean; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const existingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_secrets?key_name=eq.${encodeURIComponent(keyName)}&select=id`,
      { headers: SUPA_HEADERS },
    );
    const existing = await existingResp.json() as any[];

    const obfuscatedValue = obfuscate(keyValue);

    if (existing.length > 0) {
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_secrets?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          headers: { ...SUPA_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key_value: obfuscatedValue, service, description, updated_at: new Date().toISOString() }),
        },
      );
      return { success: resp.ok, error: resp.ok ? undefined : `Failed: ${resp.status}` };
    } else {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_secrets`, {
        method: 'POST',
        headers: { ...SUPA_HEADERS, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ key_name: keyName, key_value: obfuscatedValue, service, description }),
      });
      return { success: resp.ok, error: resp.ok ? undefined : `Failed: ${resp.status}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function secretGet(keyName: string): Promise<{ success: boolean; value?: string; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_secrets?key_name=eq.${encodeURIComponent(keyName)}&select=key_value&limit=1`,
      { headers: SUPA_HEADERS },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const data = await resp.json() as any[];
    if (!data.length) return { success: false, error: 'Secret not found' };
    return { success: true, value: deobfuscate(data[0].key_value) };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function secretList(): Promise<{ success: boolean; secrets?: any[]; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_secrets?order=created_at.desc&select=id,key_name,service,description,created_at`,
      { headers: SUPA_HEADERS },
    );
    if (!resp.ok) return { success: false, error: `Failed: ${resp.status}` };
    const secrets = await resp.json();
    return { success: true, secrets };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function secretDelete(keyName: string): Promise<{ success: boolean; error?: string }> {
  if (!SUPABASE_KEY) return { success: false, error: 'Database not configured' };

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_secrets?key_name=eq.${encodeURIComponent(keyName)}`,
      { method: 'DELETE', headers: SUPA_HEADERS },
    );
    return { success: resp.ok, error: resp.ok ? undefined : `Failed: ${resp.status}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getAllSecretsForSandbox(): Promise<Record<string, string>> {
  if (!SUPABASE_KEY) return {};

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_secrets?select=key_name,key_value`,
      { headers: SUPA_HEADERS },
    );
    if (!resp.ok) return {};
    const data = await resp.json() as any[];
    const result: Record<string, string> = {};
    for (const row of data) {
      try {
        result[row.key_name] = deobfuscate(row.key_value);
      } catch {}
    }
    return result;
  } catch {
    return {};
  }
}
