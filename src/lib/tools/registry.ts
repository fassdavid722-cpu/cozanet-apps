/**
 * Tool Registry — Defines all tools the AI can call.
 * Uses Groq's function calling format (OpenAI-compatible).
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export const TOOLS: ToolDefinition[] = [
  // ── Wait & Poll Tools ───────────────────────────
  {
    type: 'function',
    function: {
      name: 'wait_for_deployment',
      description: 'Wait for a Vercel deployment to finish building and become ready. Polls the Vercel API every 5 seconds until the deployment is READY, ERROR, or times out (2 minutes). Use after triggering a deployment to know when it is live.',
      parameters: {
        type: 'object',
        properties: {
          deployment_id: { type: 'string', description: 'The Vercel deployment ID (starts with "dpl_")' },
          team_id: { type: 'string', description: 'Optional Vercel team ID (if the project is in a team)' },
          max_wait_seconds: { type: 'number', description: 'Maximum seconds to wait (default 120, max 300)' },
        },
        required: ['deployment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait_for_page',
      description: 'Poll a URL repeatedly until it has meaningful content. Useful when waiting for a page to load, a deploy to serve content, or a dynamic SPA to render. Checks every 3 seconds for up to 60 seconds.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to poll' },
          search_text: { type: 'string', description: 'Wait until this text appears on the page (optional)' },
          min_content_length: { type: 'number', description: 'Wait until page has at least this many characters of text (optional, default 200)' },
          max_wait_seconds: { type: 'number', description: 'Maximum seconds to wait (default 60, max 180)' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait_for_github_action',
      description: 'Wait for a GitHub Actions workflow run to complete. Polls the GitHub API every 10 seconds until the run is completed (success/failure) or times out (3 minutes).',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'GitHub repo owner (username or org)' },
          repo: { type: 'string', description: 'GitHub repo name' },
          run_id: { type: 'string', description: 'The GitHub Actions run ID' },
          max_wait_seconds: { type: 'number', description: 'Maximum seconds to wait (default 180, max 600)' },
        },
        required: ['owner', 'repo', 'run_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait_duration',
      description: 'Wait for a specific duration (useful for rate limits, cooldowns, or letting a process start). Sends progress updates every 5 seconds.',
      parameters: {
        type: 'object',
        properties: {
          seconds: { type: 'number', description: 'How many seconds to wait (max 120)' },
          reason: { type: 'string', description: 'Why are we waiting? (shown to user)' },
        },
        required: ['seconds'],
      },
    },
  },

];

export const TOOL_NAMES = TOOLS.map(t => t.function.name);
