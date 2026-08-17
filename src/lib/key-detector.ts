/**
 * API Key Detector — Automatically detects API keys pasted in chat
 * 
 * Scans plain text messages for patterns that look like API keys,
 * identifies the service, and saves them as secrets.
 * 
 * Supported patterns:
 * - OpenAI: sk-proj-..., sk-...
 * - OpenRouter: sk-or-...
 * - Anthropic: sk-ant-...
 * - Google/Gemini: AIza..., AI...
 * - GitHub: ghp_..., github_pat_..., gho_..., ghs_..., ghr_...
 * - Slack: xoxb-..., xoxp-...
 * - AWS: AKIA..., ASIA...
 * - Stripe: sk_live_..., sk_test_..., pk_live_..., pk_test_...
 * - Supabase: sb_secret_..., eyJ... (anon/service keys)
 * - DeepSeek: dsk-...
 * - HuggingFace: hf_...
 * - Replicate: r8_...
 * - Cohere: cohere...
 * - Together AI: TOGETHER_...
 * - Groq: gsk_...
 * - Fireworks: fw_...
 * - ElevenLabs: 0x...
 * - Perplexity: pplx-...
 * - Mistral: keys_mistral_...
 * - Telegram: [0-9]+:[A-Za-z0-9_-]+
 * - Tavily: tvly-...
 * - Generic: long hex/alphanumeric strings (32+ chars)
 */

export interface DetectedKey {
  serviceName: string;       // Human-readable service name
  keyName: string;           // Key name to store as (e.g. "OPENAI_API_KEY")
  value: string;             // The actual key value
  prefix: string;            // Pattern that matched
  confidence: number;        // 0-1 how confident we are
  start: number;             // Position in text
  end: number;               // End position in text
}

// ── Key patterns with service mapping ──

interface KeyPattern {
  regex: RegExp;
  serviceName: string;
  keyName: string;
  confidence: number;
  prefix: string;
  minLength?: number;
  maxLength?: number;
}

const KEY_PATTERNS: KeyPattern[] = [
  // OpenAI
  {
    regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
    serviceName: 'OpenAI',
    keyName: 'OPENAI_API_KEY',
    confidence: 0.99,
    prefix: 'sk-proj-',
    minLength: 30,
  },
  {
    regex: /\bsk-[A-Za-z0-9]{20,}\b/g,
    serviceName: 'OpenAI',
    keyName: 'OPENAI_API_KEY',
    confidence: 0.85,
    prefix: 'sk-',
    minLength: 25,
  },

  // OpenRouter
  {
    regex: /\bsk-or-[A-Za-z0-9_-]{20,}\b/g,
    serviceName: 'OpenRouter',
    keyName: 'OPENROUTER_API_KEY',
    confidence: 0.99,
    prefix: 'sk-or-',
    minLength: 30,
  },

  // Anthropic
  {
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    serviceName: 'Anthropic (Claude)',
    keyName: 'ANTHROPIC_API_KEY',
    confidence: 0.99,
    prefix: 'sk-ant-',
    minLength: 30,
  },

  // Groq
  {
    regex: /\bgsk_[A-Za-z0-9]{30,}\b/g,
    serviceName: 'Groq',
    keyName: 'GROQ_API_KEY',
    confidence: 0.99,
    prefix: 'gsk_',
    minLength: 35,
  },

  // Google/Gemini
  {
    regex: /\bAIza[A-Za-z0-9_-]{30,}\b/g,
    serviceName: 'Google Cloud / Gemini',
    keyName: 'GOOGLE_API_KEY',
    confidence: 0.99,
    prefix: 'AIza',
    minLength: 35,
  },

  // GitHub tokens
  {
    regex: /\bghp_[A-Za-z0-9]{30,}\b/g,
    serviceName: 'GitHub (Personal Access Token)',
    keyName: 'GITHUB_TOKEN',
    confidence: 0.99,
    prefix: 'ghp_',
    minLength: 36,
  },
  {
    regex: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/g,
    serviceName: 'GitHub (Fine-grained PAT)',
    keyName: 'GITHUB_TOKEN',
    confidence: 0.99,
    prefix: 'github_pat_',
    minLength: 40,
  },
  {
    regex: /\bgho_[A-Za-z0-9]{30,}\b/g,
    serviceName: 'GitHub (OAuth Token)',
    keyName: 'GITHUB_OAUTH_TOKEN',
    confidence: 0.99,
    prefix: 'gho_',
    minLength: 36,
  },
  {
    regex: /\bghs_[A-Za-z0-9]{30,}\b/g,
    serviceName: 'GitHub (Server Token)',
    keyName: 'GITHUB_SERVER_TOKEN',
    confidence: 0.99,
    prefix: 'ghs_',
    minLength: 36,
  },
  {
    regex: /\bghr_[A-Za-z0-9]{30,}\b/g,
    serviceName: 'GitHub (Refresh Token)',
    keyName: 'GITHUB_REFRESH_TOKEN',
    confidence: 0.99,
    prefix: 'ghr_',
    minLength: 36,
  },

  // Slack
  {
    regex: /\bxox[bpoas]-[A-Za-z0-9-]{20,}\b/g,
    serviceName: 'Slack',
    keyName: 'SLACK_API_TOKEN',
    confidence: 0.99,
    prefix: 'xox',
    minLength: 25,
  },

  // AWS
  {
    regex: /\bAKIA[A-Z0-9]{16}\b/g,
    serviceName: 'AWS (Access Key ID)',
    keyName: 'AWS_ACCESS_KEY_ID',
    confidence: 0.99,
    prefix: 'AKIA',
  },
  {
    regex: /\bASIA[A-Z0-9]{16}\b/g,
    serviceName: 'AWS (Temporary Access Key)',
    keyName: 'AWS_ACCESS_KEY_ID',
    confidence: 0.99,
    prefix: 'ASIA',
  },

  // Stripe
  {
    regex: /\bsk_live_[A-Za-z0-9]{20,}\b/g,
    serviceName: 'Stripe (Live Secret Key)',
    keyName: 'STRIPE_SECRET_KEY',
    confidence: 0.99,
    prefix: 'sk_live_',
    minLength: 30,
  },
  {
    regex: /\bsk_test_[A-Za-z0-9]{20,}\b/g,
    serviceName: 'Stripe (Test Secret Key)',
    keyName: 'STRIPE_TEST_SECRET_KEY',
    confidence: 0.99,
    prefix: 'sk_test_',
    minLength: 30,
  },
  {
    regex: /\bpk_live_[A-Za-z0-9]{20,}\b/g,
    serviceName: 'Stripe (Live Publishable Key)',
    keyName: 'STRIPE_PUBLISHABLE_KEY',
    confidence: 0.99,
    prefix: 'pk_live_',
    minLength: 30,
  },
  {
    regex: /\bpk_test_[A-Za-z0-9]{20,}\b/g,
    serviceName: 'Stripe (Test Publishable Key)',
    keyName: 'STRIPE_TEST_PUBLISHABLE_KEY',
    confidence: 0.99,
    prefix: 'pk_test_',
    minLength: 30,
  },

  // Supabase
  {
    regex: /\bsb_secret_[A-Za-z0-9_]{20,}\b/g,
    serviceName: 'Supabase (Service Role Key)',
    keyName: 'SUPABASE_SERVICE_ROLE_KEY',
    confidence: 0.99,
    prefix: 'sb_secret_',
    minLength: 30,
  },
  {
    regex: /\bsb_publishable_[A-Za-z0-9_]{20,}\b/g,
    serviceName: 'Supabase (Publishable Key)',
    keyName: 'SUPABASE_PUBLISHABLE_KEY',
    confidence: 0.99,
    prefix: 'sb_publishable_',
    minLength: 30,
  },

  // DeepSeek
  {
    regex: /\bdsk-[A-Za-z0-9]{20,}\b/g,
    serviceName: 'DeepSeek',
    keyName: 'DEEPSEEK_API_KEY',
    confidence: 0.99,
    prefix: 'dsk-',
    minLength: 25,
  },

  // HuggingFace
  {
    regex: /\bhf_[A-Za-z0-9]{20,}\b/g,
    serviceName: 'HuggingFace',
    keyName: 'HUGGINGFACE_API_KEY',
    confidence: 0.99,
    prefix: 'hf_',
    minLength: 25,
  },

  // Replicate
  {
    regex: /\br8_[A-Za-z0-9]{20,}\b/g,
    serviceName: 'Replicate',
    keyName: 'REPLICATE_API_KEY',
    confidence: 0.99,
    prefix: 'r8_',
    minLength: 25,
  },

  // Together AI
  {
    regex: /\bTOGETHER_[A-Za-z0-9]{20,}\b/g,
    serviceName: 'Together AI',
    keyName: 'TOGETHER_API_KEY',
    confidence: 0.95,
    prefix: 'TOGETHER_',
    minLength: 30,
  },

  // Fireworks
  {
    regex: /\bfw_[A-Za-z0-9]{20,}\b/g,
    serviceName: 'Fireworks AI',
    keyName: 'FIREWORKS_API_KEY',
    confidence: 0.95,
    prefix: 'fw_',
    minLength: 25,
  },

  // Perplexity
  {
    regex: /\bpplx-[A-Za-z0-9]{30,}\b/g,
    serviceName: 'Perplexity AI',
    keyName: 'PERPLEXITY_API_KEY',
    confidence: 0.99,
    prefix: 'pplx-',
    minLength: 35,
  },

  // Mistral
  {
    regex: /\b[A-Za-z0-9]{40,}\b/g,
    serviceName: 'Mistral AI',
    keyName: 'MISTRAL_API_KEY',
    confidence: 0.5, // Low confidence — could be anything
    prefix: '',
    minLength: 40,
  },

  // Tavily
  {
    regex: /\btvly-[A-Za-z0-9_-]{20,}\b/g,
    serviceName: 'Tavily (Search API)',
    keyName: 'TAVILY_API_KEY',
    confidence: 0.99,
    prefix: 'tvly-',
    minLength: 25,
  },

  // ElevenLabs
  {
    regex: /\b0x[A-Fa-f0-9]{30,}\b/g,
    serviceName: 'ElevenLabs',
    keyName: 'ELEVENLABS_API_KEY',
    confidence: 0.7,
    prefix: '0x',
    minLength: 35,
  },

  // Telegram Bot
  {
    regex: /\b(\d{8,12}):[A-Za-z0-9_-]{30,}\b/g,
    serviceName: 'Telegram Bot',
    keyName: 'TELEGRAM_BOT_TOKEN',
    confidence: 0.95,
    prefix: '',
    minLength: 40,
  },

  // Cohere
  {
    regex: /\bcohere[A-Za-z0-9_]{20,}\b/gi,
    serviceName: 'Cohere',
    keyName: 'COHERE_API_KEY',
    confidence: 0.85,
    prefix: 'cohere',
    minLength: 27,
  },
];

// ── Context-based detection ──
// If the user says "my API key is X" or "key: X", we should be more aggressive

interface ContextMatch {
  serviceName: string;
  keyName: string;
  confidence: number;
  keywords: string[];
}

const SERVICE_CONTEXT: ContextMatch[] = [
  { serviceName: 'OpenAI', keyName: 'OPENAI_API_KEY', confidence: 0.8, keywords: ['openai', 'gpt', 'chatgpt', 'dall-e', 'whisper'] },
  { serviceName: 'Anthropic', keyName: 'ANTHROPIC_API_KEY', confidence: 0.8, keywords: ['anthropic', 'claude', 'sonnet', 'opus', 'haiku'] },
  { serviceName: 'Groq', keyName: 'GROQ_API_KEY', confidence: 0.85, keywords: ['groq'] },
  { serviceName: 'Google Cloud / Gemini', keyName: 'GOOGLE_API_KEY', confidence: 0.8, keywords: ['google', 'gemini', 'gcp', 'google cloud', 'palm', 'bard'] },
  { serviceName: 'GitHub', keyName: 'GITHUB_TOKEN', confidence: 0.85, keywords: ['github', 'gh', 'git token'] },
  { serviceName: 'Slack', keyName: 'SLACK_API_TOKEN', confidence: 0.85, keywords: ['slack', 'slack bot'] },
  { serviceName: 'AWS', keyName: 'AWS_ACCESS_KEY_ID', confidence: 0.8, keywords: ['aws', 'amazon', 's3', 'ec2', 'lambda'] },
  { serviceName: 'Stripe', keyName: 'STRIPE_SECRET_KEY', confidence: 0.85, keywords: ['stripe', 'payment', 'checkout'] },
  { serviceName: 'Supabase', keyName: 'SUPABASE_SERVICE_ROLE_KEY', confidence: 0.85, keywords: ['supabase', 'postgres', 'database'] },
  { serviceName: 'DeepSeek', keyName: 'DEEPSEEK_API_KEY', confidence: 0.85, keywords: ['deepseek', 'dsk'] },
  { serviceName: 'HuggingFace', keyName: 'HUGGINGFACE_API_KEY', confidence: 0.85, keywords: ['huggingface', 'hf', 'transformers'] },
  { serviceName: 'Replicate', keyName: 'REPLICATE_API_KEY', confidence: 0.85, keywords: ['replicate'] },
  { serviceName: 'Together AI', keyName: 'TOGETHER_API_KEY', confidence: 0.85, keywords: ['together', 'together ai'] },
  { serviceName: 'Fireworks AI', keyName: 'FIREWORKS_API_KEY', confidence: 0.85, keywords: ['fireworks', 'fireworks ai'] },
  { serviceName: 'Perplexity AI', keyName: 'PERPLEXITY_API_KEY', confidence: 0.85, keywords: ['perplexity', 'pplx'] },
  { serviceName: 'Mistral AI', keyName: 'MISTRAL_API_KEY', confidence: 0.85, keywords: ['mistral', 'mixtral'] },
  { serviceName: 'Tavily', keyName: 'TAVILY_API_KEY', confidence: 0.85, keywords: ['tavily', 'search api'] },
  { serviceName: 'ElevenLabs', keyName: 'ELEVENLABS_API_KEY', confidence: 0.85, keywords: ['elevenlabs', 'voice', 'tts', 'text to speech'] },
  { serviceName: 'Telegram Bot', keyName: 'TELEGRAM_BOT_TOKEN', confidence: 0.85, keywords: ['telegram', 'bot token', 'tg'] },
  { serviceName: 'Cohere', keyName: 'COHERE_API_KEY', confidence: 0.85, keywords: ['cohere', 'command', 'embed'] },
];

// ── Main detection function ──

export function detectApiKeys(text: string): DetectedKey[] {
  const detected: DetectedKey[] = [];
  const foundPositions = new Set<number>();

  // ── Pattern-based detection ──
  for (const pattern of KEY_PATTERNS) {
    // Skip very low confidence patterns (Mistral generic 40+ chars)
    if (pattern.confidence < 0.6) continue;

    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;

      // Skip if this position was already matched by a higher-confidence pattern
      let overlap = false;
      for (let i = start; i < end; i++) {
        if (foundPositions.has(i)) {
          overlap = true;
          break;
        }
      }
      if (overlap) {
        if (match.index === regex.lastIndex) regex.lastIndex++;
        continue;
      }

      // Mark positions as found
      for (let i = start; i < end; i++) {
        foundPositions.add(i);
      }

      detected.push({
        serviceName: pattern.serviceName,
        keyName: pattern.keyName,
        value,
        prefix: pattern.prefix,
        confidence: pattern.confidence,
        start,
        end,
      });

      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
  }

  // ── Context-based detection ──
  // Look for patterns like "my OpenAI key is sk-..." or "here's my Supabase key: eyJ..."
  const lowerText = text.toLowerCase();
  for (const ctx of SERVICE_CONTEXT) {
    for (const keyword of ctx.keywords) {
      const keywordIdx = lowerText.indexOf(keyword);
      if (keywordIdx === -1) continue;

      // Look for key-like strings within 200 chars after the keyword
      const searchRegion = text.substring(keywordIdx, keywordIdx + 300);
      
      // Look for quoted strings after the keyword
      const quotedMatch = searchRegion.match(/["'`']\s*([A-Za-z0-9_\-]{20,})\s*["'`']/);
      if (quotedMatch) {
        const fullValue = quotedMatch[1];
        const absoluteStart = keywordIdx + quotedMatch.index! + 1;
        const absoluteEnd = absoluteStart + fullValue.length;

        // Check if this position was already found
        let alreadyFound = false;
        for (let i = absoluteStart; i < absoluteEnd; i++) {
          if (foundPositions.has(i)) {
            alreadyFound = true;
            break;
          }
        }
        if (alreadyFound) continue;

        // Mark positions
        for (let i = absoluteStart; i < absoluteEnd; i++) {
          foundPositions.add(i);
        }

        detected.push({
          serviceName: ctx.serviceName,
          keyName: ctx.keyName,
          value: fullValue,
          prefix: '',
          confidence: ctx.confidence,
          start: absoluteStart,
          end: absoluteEnd,
        });
        break;
      }

      // Look for unquoted key-like strings after colon or equals
      const colonMatch = searchRegion.match(/[:=]\s*([A-Za-z0-9_\-]{25,})/);
      if (colonMatch) {
        const fullValue = colonMatch[1];
        const absoluteStart = keywordIdx + colonMatch.index! + colonMatch[0].indexOf(fullValue);
        const absoluteEnd = absoluteStart + fullValue.length;

        let alreadyFound = false;
        for (let i = absoluteStart; i < absoluteEnd; i++) {
          if (foundPositions.has(i)) {
            alreadyFound = true;
            break;
          }
        }
        if (alreadyFound) continue;

        for (let i = absoluteStart; i < absoluteEnd; i++) {
          foundPositions.add(i);
        }

        detected.push({
          serviceName: ctx.serviceName,
          keyName: ctx.keyName,
          value: fullValue,
          prefix: '',
          confidence: ctx.confidence * 0.9, // Slightly lower confidence for unquoted
          start: absoluteStart,
          end: absoluteEnd,
        });
        break;
      }
    }
  }

  // ── Generic JWT detection (Supabase, Firebase, etc.) ──
  // JWTs start with eyJ and are base64-encoded JSON
  const jwtRegex = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
  let jwtMatch;
  while ((jwtMatch = jwtRegex.exec(text)) !== null) {
    const start = jwtMatch.index;
    const end = start + jwtMatch[0].length;

    let alreadyFound = false;
    for (let i = start; i < end; i++) {
      if (foundPositions.has(i)) {
        alreadyFound = true;
        break;
      }
    }
    if (alreadyFound) continue;

    for (let i = start; i < end; i++) {
      foundPositions.add(i);
    }

    // Try to identify the service from the JWT payload
    let serviceName = 'Unknown (JWT Token)';
    let keyName = 'JWT_TOKEN';
    try {
      const payload = JSON.parse(Buffer.from(jwtMatch[0].split('.')[1], 'base64').toString());
      if (payload.iss?.includes('supabase') || payload.ref) {
        serviceName = 'Supabase (JWT)';
        keyName = 'SUPABASE_JWT';
      } else if (payload.iss?.includes('firebase')) {
        serviceName = 'Firebase (JWT)';
        keyName = 'FIREBASE_JWT';
      } else if (payload.iss?.includes('auth0')) {
        serviceName = 'Auth0 (JWT)';
        keyName = 'AUTH0_JWT';
      }
    } catch {}

    detected.push({
      serviceName,
      keyName,
      value: jwtMatch[0],
      prefix: 'eyJ',
      confidence: 0.9,
      start,
      end,
    });
  }

  // Sort by position
  detected.sort((a, b) => a.start - b.start);

  return detected;
}

// ── Redact keys from text ──

export function redactKeys(text: string, keys: DetectedKey[]): string {
  let result = text;
  // Process from end to start so positions don't shift
  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i];
    const masked = key.value.substring(0, 8) + '••••••••' + key.value.substring(key.value.length - 4);
    result = result.substring(0, key.start) + masked + result.substring(key.end);
  }
  return result;
}
