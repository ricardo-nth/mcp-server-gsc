import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main(): void {
  const root = process.cwd();
  const pkg = readJson(resolve(root, 'package.json'));
  const packageName = String(pkg.name ?? '');
  const version = String(pkg.version ?? '');
  const errors: string[] = [];

  if (!packageName) {
    errors.push('package.json is missing a valid name.');
  }
  if (!version) {
    errors.push('package.json is missing a valid version.');
  }

  const packageLockPath = resolve(root, 'package-lock.json');
  const packageLock = readJson(packageLockPath);
  if (String(packageLock.name ?? '') !== packageName) {
    errors.push(`package-lock.json name does not match package.json (${packageName}).`);
  }
  if (String(packageLock.version ?? '') !== version) {
    errors.push(`package-lock.json version does not match package.json (${version}).`);
  }
  const rootPackage = packageLock.packages as Record<string, unknown> | undefined;
  const rootEntry = rootPackage && typeof rootPackage[''] === 'object' ? rootPackage[''] as Record<string, unknown> : null;
  if (!rootEntry) {
    errors.push('package-lock.json is missing the root package entry.');
  } else {
    if (String(rootEntry.name ?? '') !== packageName) {
      errors.push(`package-lock.json root package name does not match package.json (${packageName}).`);
    }
    if (String(rootEntry.version ?? '') !== version) {
      errors.push(`package-lock.json root package version does not match package.json (${version}).`);
    }
  }

  const indexSource = readFileSync(resolve(root, 'src/index.ts'), 'utf8');
  const runtimeVersionMatch = indexSource.match(
    /name:\s*'mcp-server-gsc-pro',\s*version:\s*'([^']+)'/,
  );
  if (!runtimeVersionMatch) {
    errors.push('Could not find the runtime server version in src/index.ts.');
  } else if (runtimeVersionMatch[1] !== version) {
    errors.push(
      `src/index.ts server version (${runtimeVersionMatch[1]}) does not match package.json (${version}).`,
    );
  }

  const changelog = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8');
  const changelogSectionPattern = new RegExp(`^## \\[${escapeRegex(version)}\\]`, 'm');
  if (!changelogSectionPattern.test(changelog)) {
    errors.push(`CHANGELOG.md is missing a section for version ${version}.`);
  }

  const migrationsDir = resolve(root, 'docs/migrations');
  const migrationFiles = readdirSync(migrationsDir).filter(
    (file) => file.endsWith('.md') && file !== 'README.md' && file !== 'template.md',
  );
  const currentVersionLabel = `v${version}`;

  for (const file of migrationFiles) {
    const content = readFileSync(resolve(migrationsDir, file), 'utf8');
    const marksCurrentVersion =
      content.includes(`- Version: ${currentVersionLabel}`) ||
      content.includes(`- Version target: ${currentVersionLabel}`);

    if (!marksCurrentVersion) {
      continue;
    }

    const requiredSnippets = [
      '- Affected tools:',
      '## Summary',
      '## Before',
      '## After',
      '## Action Required For Agents',
    ];

    for (const snippet of requiredSnippets) {
      if (!content.includes(snippet)) {
        errors.push(`${file} is marked for ${currentVersionLabel} but is missing "${snippet}".`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Release check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Release metadata is consistent for ${packageName}@${version}.`);
}

main();
