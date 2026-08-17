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
      name: 'browser_interact',
      description: 'Interact with a website by searching, clicking links, or capturing a full-page screenshot. Use action "search" to search on a site (e.g. go to amazon.com and search for headphones), "click" to follow a link by text, or "scroll" for a full-page screenshot.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to interact with' },
          action: { type: 'string', enum: ['search', 'click', 'scroll'], description: 'What to do: "search" submits a search query on the site, "click" follows a link, "scroll" captures full-page screenshot' },
          query: { type: 'string', description: 'Search query (for action=search)' },
          value: { type: 'string', description: 'Link text to click (for action=click) or search query (for action=search)' },
          text: { type: 'string', description: 'Alternative to value for click action' },
        },
        required: ['url', 'action'],
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
      name: 'code_execute',
      description: 'Execute Python code in a real sandbox with full standard library (math, json, re, datetime, itertools, collections, statistics, fractions, decimal, etc). Use for calculations, data processing, algorithms, debugging code, running simulations, or any task that needs code execution. The code runs in an isolated Python 3 environment. Output from print() is captured and returned. You can write multi-line programs.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Python code to execute. Use print() to output results. Multi-line programs are supported.' },
          description: { type: 'string', description: 'Brief description of what the code does (for display)' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_create',
      description: 'Create a new file in the virtual file system. Useful when building multi-file projects, saving code for later, or organizing work. Files are persisted and can be read back in future messages.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'The filename (e.g. "main.py", "utils.js", "README.md")' },
          content: { type: 'string', description: 'The full content of the file' },
          language: { type: 'string', description: 'Programming language (e.g. "python", "javascript", "typescript", "markdown"). Auto-detected from extension if omitted.' },
        },
        required: ['filename', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_read',
      description: 'Read the content of a file from the virtual file system. Returns the full file content.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'The filename to read' },
        },
        required: ['filename'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_list',
      description: 'List all files in the virtual file system. Returns filenames, languages, and sizes.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_update',
      description: 'Update an existing file in the virtual file system. Overwrites the previous content entirely.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'The filename to update' },
          content: { type: 'string', description: 'The new content of the file' },
        },
        required: ['filename', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'file_delete',
      description: 'Delete a file from the virtual file system.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'The filename to delete' },
        },
        required: ['filename'],
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
