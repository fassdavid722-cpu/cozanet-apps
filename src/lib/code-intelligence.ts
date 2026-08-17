/**
 * Coding Intelligence — Code auditing, bug detection, and fix suggestions
 * 
 * The AI can:
 * - Audit code for bugs, security issues, and performance problems
 * - Suggest fixes for identified issues
 * - Write automation scripts
 * - Run code to verify fixes work
 */

import { executeCode } from './sandbox';

export interface CodeIssue {
  type: 'bug' | 'security' | 'performance' | 'style' | 'warning';
  severity: 'critical' | 'high' | 'medium' | 'low';
  line?: number;
  description: string;
  suggestion: string;
}

export interface CodeAuditResult {
  issues: CodeIssue[];
  score: number;          // 0-100
  summary: string;
  testsPassed: boolean;
  testOutput?: string;
}

// ── Static analysis patterns ──

const SECURITY_PATTERNS: { pattern: RegExp; type: CodeIssue['type']; severity: CodeIssue['severity']; description: string; suggestion: string }[] = [
  {
    pattern: /eval\s*\(/g,
    type: 'security',
    severity: 'critical',
    description: 'Use of eval() is dangerous — can execute arbitrary code',
    suggestion: 'Remove eval() and use safe alternatives like JSON.parse() or Function() with controlled input',
  },
  {
    pattern: /innerHTML\s*=/g,
    type: 'security',
    severity: 'high',
    description: 'Direct innerHTML assignment can lead to XSS attacks',
    suggestion: 'Use textContent or sanitize input before assigning to innerHTML',
  },
  {
    pattern: /document\.write\s*\(/g,
    type: 'security',
    severity: 'high',
    description: 'document.write() can be exploited for XSS and is deprecated',
    suggestion: 'Use DOM manipulation methods like createElement and appendChild',
  },
  {
    pattern: /\b(SELECT|INSERT|UPDATE|DELETE)\b.*\bFROM\b.*\$\{.*\}/gi,
    type: 'security',
    severity: 'critical',
    description: 'Potential SQL injection — string interpolation in SQL query',
    suggestion: 'Use parameterized queries with prepared statements instead of string interpolation',
  },
  {
    pattern: /https?:\/\/(?!localhost|127\.0\.0\.1).*password|api[_-]?key|secret|token/gi,
    type: 'security',
    severity: 'high',
    description: 'Hardcoded credentials in URL',
    suggestion: 'Move credentials to environment variables or a secrets manager',
  },
  {
    pattern: /\bpassword\s*=\s*['"][^'"]+['"]/gi,
    type: 'security',
    severity: 'critical',
    description: 'Hardcoded password found',
    suggestion: 'Use environment variables for passwords — never hardcode them',
  },
  {
    pattern: /\bapi[_-]?key\s*=\s*['"][^'"]+['"]/gi,
    type: 'security',
    severity: 'critical',
    description: 'Hardcoded API key found',
    suggestion: 'Store API keys in environment variables or secrets manager',
  },
];

const BUG_PATTERNS: { pattern: RegExp; type: CodeIssue['type']; severity: CodeIssue['severity']; description: string; suggestion: string }[] = [
  {
    pattern: /==\s*(?:null|undefined|true|false)/g,
    type: 'warning',
    severity: 'low',
    description: 'Use of == instead of === (loose equality can cause bugs)',
    suggestion: 'Use === for strict equality comparison',
  },
  {
    pattern: /var\s+/g,
    type: 'style',
    severity: 'low',
    description: 'var is deprecated — has function scope, not block scope',
    suggestion: 'Use let or const instead of var',
  },
  {
    pattern: /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/g,
    type: 'bug',
    severity: 'high',
    description: 'Empty catch block — errors are silently swallowed',
    suggestion: 'At minimum, log the error: catch(e) { console.error(e) }',
  },
  {
    pattern: /console\.log\s*\(/g,
    type: 'style',
    severity: 'low',
    description: 'console.log left in production code',
    suggestion: 'Remove debug console.log statements before production deployment',
  },
  {
    pattern: /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/gi,
    type: 'warning',
    severity: 'medium',
    description: 'Unresolved TODO/FIXME marker found',
    suggestion: 'Resolve the TODO before deploying to production',
  },
  {
    pattern: /while\s*\(\s*true\s*\)/g,
    type: 'bug',
    severity: 'high',
    description: 'Infinite while(true) loop without clear exit condition',
    suggestion: 'Add a break condition or use a bounded loop',
  },
  {
    pattern: /setTimeout\s*\(\s*[^,]+,\s*0\s*\)/g,
    type: 'warning',
    severity: 'medium',
    description: 'setTimeout with 0 delay — often a code smell',
    suggestion: 'Use queueMicrotask or Promise.resolve().then() for micro-task scheduling',
  },
];

const PERFORMANCE_PATTERNS: { pattern: RegExp; type: CodeIssue['type']; severity: CodeIssue['severity']; description: string; suggestion: string }[] = [
  {
    pattern: /\.forEach\s*\(\s*async/g,
    type: 'performance',
    severity: 'medium',
    description: 'async function inside forEach — does not await properly',
    suggestion: 'Use for...of loop with await, or Promise.all with .map()',
  },
  {
    pattern: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/g,
    type: 'performance',
    severity: 'medium',
    description: 'Deep clone via JSON.parse(JSON.stringify()) — slow and lossy',
    suggestion: 'Use structuredClone() or a proper deep-clone utility',
  },
  {
    pattern: /document\.querySelector\s*\(\s*['"]\*['"]\)/g,
    type: 'performance',
    severity: 'low',
    description: 'Universal selector * is very slow',
    suggestion: 'Use a more specific selector',
  },
];

// ── Audit code ──

export async function auditCode(
  code: string,
  language: string = 'javascript',
  runTests: boolean = true,
): Promise<CodeAuditResult> {
  const issues: CodeIssue[] = [];

  // Run all pattern checks
  const allPatterns = [...SECURITY_PATTERNS, ...BUG_PATTERNS, ...PERFORMANCE_PATTERNS];

  for (const { pattern, type, severity, description, suggestion } of allPatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(code)) !== null) {
      // Find line number
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      issues.push({
        type,
        severity,
        line: lineNum,
        description: `${description} (at line ${lineNum})`,
        suggestion,
      });

      // Avoid infinite loop on zero-length matches
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
  }

  // Check for other common issues
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for very long lines
    if (line.length > 200) {
      issues.push({
        type: 'style',
        severity: 'low',
        line: lineNum,
        description: `Line ${lineNum} is very long (${line.length} chars)`,
        suggestion: 'Break long lines for readability (keep under 120 chars)',
      });
    }

    // Check for missing semicolons (JS/TS specific)
    if ((language === 'javascript' || language === 'typescript') &&
        line.trim() &&
        !line.trim().endsWith(';') &&
        !line.trim().endsWith('{') &&
        !line.trim().endsWith('}') &&
        !line.trim().endsWith(',') &&
        !line.trim().endsWith('(') &&
        !line.trim().startsWith('//') &&
        !line.trim().startsWith('*') &&
        !line.trim().startsWith('/*') &&
        !line.trim().endsWith('\\') &&
        !line.trim().match(/^(if|else|for|while|switch|try|catch|finally|do|class|interface|enum|function|export|import|from|const|let|var|return)\s*$/)) {
      // Only flag if it looks like a statement
      if (line.trim().match(/^(const|let|var|return|throw)\s+/) ||
          line.trim().match(/\w+\s*=\s*[^=]/) ||
          line.trim().match(/\w+\(.*\)/)) {
        // This is less reliable, so we'll skip it to avoid false positives
      }
    }
  }

  // Deduplicate issues
  const uniqueIssues = issues.filter((issue, index, self) =>
    index === self.findIndex(i => i.line === issue.line && i.description === issue.description)
  );

  // Calculate score
  let score = 100;
  for (const issue of uniqueIssues) {
    const deduction = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
    }[issue.severity];
    score -= deduction;
  }
  score = Math.max(0, score);

  // Generate summary
  const counts = uniqueIssues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const summary = `Found ${uniqueIssues.length} issue(s): ` +
    `${counts.critical || 0} critical, ${counts.high || 0} high, ${counts.medium || 0} medium, ${counts.low || 0} low. ` +
    `Code health score: ${score}/100`;

  // Run tests if requested
  let testsPassed = false;
  let testOutput: string | undefined;
  if (runTests) {
    try {
      const result = await executeCode(code, language);
      testsPassed = !result.error;
      testOutput = result.stdout || result.stderr || result.error || 'No output';
    } catch {
      testOutput = 'Failed to execute code';
    }
  }

  return {
    issues: uniqueIssues.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }),
    score,
    summary,
    testsPassed,
    testOutput,
  };
}

// ── Generate fix for a specific issue ──

export function generateFix(code: string, issue: CodeIssue): string {
  if (!issue.line) return code;

  const lines = code.split('\n');
  const lineIdx = issue.line - 1;

  if (lineIdx >= lines.length) return code;

  // Apply simple auto-fixes
  let fixedLine = lines[lineIdx];

  switch (issue.type) {
    case 'security':
      if (issue.description.includes('eval')) {
        fixedLine = fixedLine.replace(/eval\s*\(([^)]+)\)/, 'Function($1)()');
      }
      if (issue.description.includes('innerHTML')) {
        fixedLine = fixedLine.replace(/innerHTML\s*=/, 'textContent =');
      }
      break;

    case 'bug':
      if (issue.description.includes('==')) {
        fixedLine = fixedLine.replace(/==/g, '===');
      }
      if (issue.description.includes('var ')) {
        fixedLine = fixedLine.replace(/\bvar\s+/g, 'const ');
      }
      if (issue.description.includes('empty catch')) {
        fixedLine = fixedLine.replace(/catch\s*\(\s*\w+\s*\)\s*\{\s*\}/, 'catch(e) { console.error(e) }');
      }
      break;

    case 'performance':
      if (issue.description.includes('JSON.parse')) {
        fixedLine = fixedLine.replace(/JSON\.parse\s*\(\s*JSON\.stringify\s*\(/, 'structuredClone(');
        fixedLine = fixedLine.replace(/\)\)$/, ')');
      }
      break;
  }

  lines[lineIdx] = fixedLine;
  return lines.join('\n');
}

// ── Fix all issues ──

export async function fixAllIssues(
  code: string,
  language: string = 'javascript',
): Promise<{ fixedCode: string; auditResult: CodeAuditResult; changes: number }> {
  const audit = await auditCode(code, language, false);
  let fixedCode = code;
  let changes = 0;

  for (const issue of audit.issues) {
    if (issue.severity === 'critical' || issue.severity === 'high') {
      const before = fixedCode;
      fixedCode = generateFix(fixedCode, issue);
      if (fixedCode !== before) changes++;
    }
  }

  // Re-audit the fixed code
  const reAudit = await auditCode(fixedCode, language, false);

  return { fixedCode, auditResult: reAudit, changes };
}
