import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { TOOL_GROUPS, TOOL_REGISTRY } from '../src/tool-registry.js';

const START_MARKER = '<!-- GENERATED:tools:start -->';
const END_MARKER = '<!-- GENERATED:tools:end -->';

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function renderToolsBlock(): string {
  const lines: string[] = [];
  lines.push(`## Tools (${TOOL_REGISTRY.length})`);
  lines.push('');

  for (const group of TOOL_GROUPS) {
    const tools = TOOL_REGISTRY.filter((tool) => tool.group === group.id);
    if (tools.length === 0) {
      continue;
    }

    lines.push(`### ${group.title} (${pluralize(tools.length, 'tool')})`);
    lines.push('');

    if (group.readmeDescription) {
      lines.push(group.readmeDescription);
      lines.push('');
    }

    lines.push('| Tool | Description |');
    lines.push('|------|-------------|');
    for (const tool of tools) {
      lines.push(`| \`${tool.name}\` | ${escapeTableCell(tool.description)} |`);
    }
    lines.push('');
  }

  const exampleTools = TOOL_REGISTRY.filter((tool) => tool.example);
  if (exampleTools.length > 0) {
    lines.push('### Example Inputs');
    lines.push('');
    lines.push('Generated from the runtime tool registry.');
    lines.push('');

    for (const tool of exampleTools) {
      lines.push(`#### \`${tool.name}\``);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(tool.example, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

function replaceGeneratedBlock(readme: string, generated: string): string {
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end < start) {
    throw new Error('README markers for generated tools block are missing or malformed.');
  }

  const before = readme.slice(0, start + START_MARKER.length);
  const after = readme.slice(end);
  return `${before}\n\n${generated}\n\n${after}`;
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== 'sync' && mode !== 'check') {
    throw new Error('Usage: tsx scripts/docs-tools.ts <sync|check>');
  }

  const readmePath = resolve(process.cwd(), 'README.md');
  const current = readFileSync(readmePath, 'utf8');
  const expected = replaceGeneratedBlock(current, renderToolsBlock());

  if (mode === 'sync') {
    if (expected !== current) {
      writeFileSync(readmePath, expected);
      console.log('README tools section synchronized.');
    } else {
      console.log('README tools section already up to date.');
    }
    return;
  }

  if (expected !== current) {
    console.error('README tools section is out of sync. Run `pnpm docs:sync`.');
    process.exitCode = 1;
    return;
  }

  console.log('README tools section is in sync.');
}

main();
