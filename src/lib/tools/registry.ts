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
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information, news, prices, or facts. Use for any question that needs up-to-date information.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          max_results: { type: 'number', description: 'Max results to return (default 5, max 10)' },
          domain: { type: 'string', description: 'Restrict search to a specific domain (e.g. "cozanet.net")' },
          time_range: { type: 'string', description: 'Time range: "day", "week", "month", "year"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_navigate',
      description: 'Navigate to a specific URL and extract its content. Use when the user asks to browse, visit, or check a specific website.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to (include https:// if not present)' },
          extract_links: { type: 'boolean', description: 'Whether to also extract all links from the page' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browser_search',
      description: 'Search the web using DuckDuckGo and return results with titles, URLs, and snippets. Alternative to web_search that doesn\'t use API credits.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_save',
      description: 'Save a fact, preference, or important information about the user to long-term memory. Use when the user tells you something worth remembering.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The information to remember' },
          category: { type: 'string', description: 'Category: "preference", "fact", "instruction", "decision", "context"' },
          importance: { type: 'number', description: 'Importance level 1-10 (default 5)' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_recall',
      description: 'Retrieve saved memories. Search through long-term memory for facts, preferences, or context about the user.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for in memory' },
          category: { type: 'string', description: 'Filter by category' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location. Returns temperature, conditions, and forecast.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name or coordinates (lat,lon)' },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate a mathematical expression. Supports basic arithmetic, trigonometry, logarithms, etc.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'The mathematical expression to evaluate (e.g. "2+2", "sin(45)*pi", "sqrt(144)")' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: 'Get the current time and date for a timezone. Useful when the user asks about time, dates, or scheduling.',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'IANA timezone (e.g. "Africa/Lagos", "America/New_York"). Defaults to UTC.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'url_metadata',
      description: 'Get metadata (title, description, OpenGraph tags) from a URL without fetching the full page content.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to check' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_run',
      description: 'Execute JavaScript/TypeScript code in a sandboxed environment. Use for calculations, data processing, or quick scripts.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'The code to execute (JavaScript)' },
          language: { type: 'string', description: 'Language: "javascript" or "typescript" (default javascript)' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'jina_reader',
      description: 'Use Jina Reader API to get clean, readable content from any URL. Better than basic fetch for JavaScript-rendered pages. Returns markdown-formatted content.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to read' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'translate',
      description: 'Translate text between languages. Supports auto-detection of source language.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          target_lang: { type: 'string', description: 'Target language code (e.g. "en", "es", "fr", "zh", "ja")' },
          source_lang: { type: 'string', description: 'Source language code (auto-detect if omitted)' },
        },
        required: ['text', 'target_lang'],
      },
    },
  },
];

export const TOOL_NAMES = TOOLS.map(t => t.function.name);
