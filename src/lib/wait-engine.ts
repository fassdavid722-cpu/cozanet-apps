/**
 * Wait & Poll Engine — Lets the AI wait for async operations
 *
 * Capabilities:
 *   1. Poll a Vercel deployment until READY/ERROR
 *   2. Poll a URL until specific content appears (SPA loads, dynamic content)
 *   3. Wait a fixed duration (for rate limits, cooldowns)
 *   4. Poll a custom condition (generic polling loop)
 *
 * All waits send SSE progress events so the user sees what's happening.
 */

export interface WaitProgress {
  status: 'waiting' | 'checking' | 'ready' | 'error' | 'timeout';
  detail?: string;
  attempt?: number;
  maxAttempts?: number;
  elapsedTime?: number;
  result?: any;
}

export interface WaitOptions {
  maxWaitMs?: number;        // Total max wait time (default 120000 = 2 min)
  pollIntervalMs?: number;   // How often to check (default 5000 = 5 sec)
  onProgress?: (p: WaitProgress) => void;
}

const DEFAULT_MAX_WAIT = 120_000;  // 2 minutes
const DEFAULT_POLL_INTERVAL = 5_000; // 5 seconds
const MAX_ATTEMPTS = 24; // 24 * 5s = 2 min max

// ── 1. Vercel Deployment Polling ──────────────────

export async function waitForVercelDeployment(
  deploymentId: string,
  teamId: string | undefined,
  apiKey: string,
  options: WaitOptions = {}
): Promise<{ ready: boolean; url?: string; state: string; error?: string }> {
  const maxWait = options.maxWaitMs || DEFAULT_MAX_WAIT;
  const interval = options.pollIntervalMs || DEFAULT_POLL_INTERVAL;
  const onProgress = options.onProgress;

  const startTime = Date.now();
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWait) {
      onProgress?.({ status: 'timeout', detail: `Timed out after ${Math.round(elapsed / 1000)}s`, attempt, maxAttempts: MAX_ATTEMPTS, elapsedTime: elapsed });
      return { ready: false, state: 'TIMEOUT', error: 'Deployment check timed out' };
    }

    attempt++;
    onProgress?.({ status: 'checking', detail: `Checking deployment status (attempt ${attempt})`, attempt, maxAttempts: MAX_ATTEMPTS, elapsedTime: elapsed });

    try {
      const url = teamId
        ? `https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${teamId}`
        : `https://api.vercel.com/v13/deployments/${deploymentId}`;

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        onProgress?.({ status: 'checking', detail: `API returned ${resp.status}, retrying...`, attempt, maxAttempts: MAX_ATTEMPTS, elapsedTime: elapsed });
        await sleep(interval);
        continue;
      }

      const data = await resp.json() as any;
      const state = data.readyState || data.status || 'UNKNOWN';
      const deployUrl = data.url ? `https://${data.url}` : undefined;

      if (state === 'READY') {
        onProgress?.({ status: 'ready', detail: `Deployment is live!`, attempt, maxAttempts: MAX_ATTEMPTS, elapsedTime: elapsed, result: { url: deployUrl, state } });
        return { ready: true, url: deployUrl, state: 'READY' };
      }

      if (state === 'ERROR' || state === 'CANCELED') {
        const errorMsg = data.error?.message || `Deployment ${state.toLowerCase()}`;
        onProgress?.({ status: 'error', detail: errorMsg, attempt, maxAttempts: MAX_ATTEMPTS, elapsedTime: elapsed });
        return { ready: false, state, error: errorMsg };
      }

      // Still building/queued/initializing
      onProgress?.({
        status: 'waiting',
        detail: `Deployment status: ${state} — waiting ${interval / 1000}s before next check...`,
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        elapsedTime: elapsed,
      });

      await sleep(interval);
    } catch (err: any) {
      onProgress?.({ status: 'checking', detail: `Check failed: ${err.message}, retrying...`, attempt, maxAttempts: MAX_ATTEMPTS, elapsedTime: elapsed });
      await sleep(interval);
    }
  }

  return { ready: false, state: 'TIMEOUT', error: 'Max attempts reached' };
}

// ── 2. Page Content Polling ──────────────────────

export async function waitForPageContent(
  url: string,
  options: {
    searchText?: string;       // Wait until this text appears on the page
    selector?: string;         // Wait until this CSS selector exists
    minContentLength?: number; // Wait until page has at least N chars of content
    maxWaitMs?: number;
    pollIntervalMs?: number;
    onProgress?: (p: WaitProgress) => void;
  } = {}
): Promise<{ ready: boolean; content?: string; title?: string; error?: string }> {
  const maxWait = options.maxWaitMs || 60_000;
  const interval = options.pollIntervalMs || 3_000;
  const onProgress = options.onProgress;
  const startTime = Date.now();
  let attempt = 0;
  const maxAttempts = Math.floor(maxWait / interval);

  while (attempt < maxAttempts) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWait) {
      onProgress?.({ status: 'timeout', detail: `Timed out after ${Math.round(elapsed / 1000)}s`, attempt, maxAttempts, elapsedTime: elapsed });
      return { ready: false, error: 'Page content check timed out' };
    }

    attempt++;
    onProgress?.({ status: 'checking', detail: `Fetching page (attempt ${attempt})`, attempt, maxAttempts, elapsedTime: elapsed });

    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15_000),
      });

      if (!resp.ok) {
        onProgress?.({ status: 'waiting', detail: `Page returned ${resp.status}, retrying...`, attempt, maxAttempts, elapsedTime: elapsed });
        await sleep(interval);
        continue;
      }

      const html = await resp.text();
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // Check conditions
      let conditionMet = true;

      if (options.searchText) {
        if (!text.toLowerCase().includes(options.searchText.toLowerCase())) {
          conditionMet = false;
        }
      }

      if (options.selector) {
        // Simple check: does the selector string appear in the HTML?
        // (Proper CSS selector matching would need a DOM parser)
        if (!html.includes(options.selector.replace(/[.#]/g, ''))) {
          conditionMet = false;
        }
      }

      if (options.minContentLength) {
        if (text.length < options.minContentLength) {
          conditionMet = false;
        }
      }

      // Default: page has meaningful content (>200 chars)
      if (!options.searchText && !options.selector && !options.minContentLength) {
        conditionMet = text.length > 200;
      }

      if (conditionMet) {
        onProgress?.({ status: 'ready', detail: `Page loaded successfully (${text.length} chars)`, attempt, maxAttempts, elapsedTime: elapsed });
        return { ready: true, content: text.slice(0, 8000), title };
      }

      onProgress?.({
        status: 'waiting',
        detail: `Page not ready yet (${text.length} chars), waiting ${interval / 1000}s...`,
        attempt,
        maxAttempts,
        elapsedTime: elapsed,
      });

      await sleep(interval);
    } catch (err: any) {
      onProgress?.({ status: 'waiting', detail: `Fetch failed: ${err.message}, retrying...`, attempt, maxAttempts, elapsedTime: elapsed });
      await sleep(interval);
    }
  }

  return { ready: false, error: 'Max attempts reached' };
}

// ── 3. Generic Condition Polling ─────────────────

export async function waitForCondition(
  checkFn: () => Promise<{ met: boolean; detail?: string; data?: any }>,
  options: WaitOptions = {}
): Promise<{ ready: boolean; data?: any; error?: string }> {
  const maxWait = options.maxWaitMs || DEFAULT_MAX_WAIT;
  const interval = options.pollIntervalMs || DEFAULT_POLL_INTERVAL;
  const onProgress = options.onProgress;
  const startTime = Date.now();
  let attempt = 0;
  const maxAttempts = Math.floor(maxWait / interval);

  while (attempt < maxAttempts) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWait) {
      onProgress?.({ status: 'timeout', detail: `Timed out after ${Math.round(elapsed / 1000)}s`, attempt, maxAttempts, elapsedTime: elapsed });
      return { ready: false, error: 'Condition check timed out' };
    }

    attempt++;

    try {
      const result = await checkFn();
      if (result.met) {
        onProgress?.({ status: 'ready', detail: result.detail || 'Condition met!', attempt, maxAttempts, elapsedTime: elapsed, result: result.data });
        return { ready: true, data: result.data };
      }

      onProgress?.({
        status: 'waiting',
        detail: result.detail || `Condition not met, waiting ${interval / 1000}s...`,
        attempt,
        maxAttempts,
        elapsedTime: elapsed,
      });
    } catch (err: any) {
      onProgress?.({ status: 'checking', detail: `Check error: ${err.message}, retrying...`, attempt, maxAttempts, elapsedTime: elapsed });
    }

    await sleep(interval);
  }

  return { ready: false, error: 'Max attempts reached' };
}

// ── 4. Simple Timer Wait ──────────────────────────

export async function waitDuration(
  ms: number,
  onProgress?: (p: WaitProgress) => void
): Promise<{ ready: boolean }> {
  const startTime = Date.now();
  const seconds = Math.ceil(ms / 1000);

  onProgress?.({ status: 'waiting', detail: `Waiting ${seconds}s...`, attempt: 0, maxAttempts: 1, elapsedTime: 0 });

  // Send progress updates every 5 seconds for long waits
  const updateInterval = Math.min(5000, ms);
  let elapsed = 0;

  while (elapsed < ms) {
    await sleep(Math.min(updateInterval, ms - elapsed));
    elapsed = Date.now() - startTime;
    const remaining = Math.ceil((ms - elapsed) / 1000);
    onProgress?.({
      status: 'waiting',
      detail: remaining > 0 ? `${remaining}s remaining...` : 'Done',
      attempt: Math.floor(elapsed / updateInterval),
      maxAttempts: Math.ceil(ms / updateInterval),
      elapsedTime: elapsed,
    });
  }

  onProgress?.({ status: 'ready', detail: 'Wait complete', attempt: 1, maxAttempts: 1, elapsedTime: elapsed });
  return { ready: true };
}

// ── 5. GitHub Actions Polling ────────────────────

export async function waitForGitHubAction(
  owner: string,
  repo: string,
  runId: string,
  token: string,
  options: WaitOptions = {}
): Promise<{ ready: boolean; conclusion?: string; state: string; error?: string }> {
  const maxWait = options.maxWaitMs || 180_000; // 3 min for GitHub Actions
  const interval = options.pollIntervalMs || 10_000; // 10 sec for GH Actions
  const onProgress = options.onProgress;
  const startTime = Date.now();
  let attempt = 0;
  const maxAttempts = Math.floor(maxWait / interval);

  while (attempt < maxAttempts) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWait) {
      onProgress?.({ status: 'timeout', detail: `Timed out after ${Math.round(elapsed / 1000)}s`, attempt, maxAttempts, elapsedTime: elapsed });
      return { ready: false, state: 'TIMEOUT', error: 'GitHub Action check timed out' };
    }

    attempt++;
    onProgress?.({ status: 'checking', detail: `Checking GitHub Action run #${runId} (attempt ${attempt})`, attempt, maxAttempts, elapsedTime: elapsed });

    try {
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!resp.ok) {
        onProgress?.({ status: 'waiting', detail: `GitHub API returned ${resp.status}, retrying...`, attempt, maxAttempts, elapsedTime: elapsed });
        await sleep(interval);
        continue;
      }

      const data = await resp.json() as any;
      const state = data.status || 'unknown'; // queued, in_progress, completed
      const conclusion = data.conclusion; // success, failure, cancelled, null (still running)

      if (state === 'completed') {
        if (conclusion === 'success') {
          onProgress?.({ status: 'ready', detail: `GitHub Action completed successfully!`, attempt, maxAttempts, elapsedTime: elapsed });
          return { ready: true, conclusion, state: 'completed' };
        } else {
          onProgress?.({ status: 'error', detail: `GitHub Action ${conclusion}`, attempt, maxAttempts, elapsedTime: elapsed });
          return { ready: false, conclusion, state: 'completed', error: `Action ${conclusion}` };
        }
      }

      onProgress?.({
        status: 'waiting',
        detail: `GitHub Action: ${state}${conclusion ? ` (${conclusion})` : ''} — waiting ${interval / 1000}s...`,
        attempt,
        maxAttempts,
        elapsedTime: elapsed,
      });

      await sleep(interval);
    } catch (err: any) {
      onProgress?.({ status: 'checking', detail: `Check failed: ${err.message}, retrying...`, attempt, maxAttempts, elapsedTime: elapsed });
      await sleep(interval);
    }
  }

  return { ready: false, state: 'TIMEOUT', error: 'Max attempts reached' };
}

// ── Helpers ───────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
