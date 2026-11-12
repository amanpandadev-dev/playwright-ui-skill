#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function args(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const option = argv[index];
    if (!option.startsWith('--') || index + 1 >= argv.length) continue;
    result[option.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

function nearestPackageJson(startDirectory) {
  let directory = startDirectory;
  while (true) {
    const candidate = path.join(directory, 'package.json');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function packageModuleFormat(packagePath) {
  if (!packagePath) return 'commonjs';
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse owning package manifest ${packagePath}: ${error.message}`);
  }
  return manifest.type === 'module' ? 'esm' : 'commonjs';
}

function inferModuleFormat(configPath) {
  const extension = path.extname(configPath).toLowerCase();
  if (extension === '.mts' || extension === '.mjs') {
    return { format: 'esm', reason: `explicit ${extension} extension` };
  }
  if (extension === '.cts' || extension === '.cjs') {
    return { format: 'commonjs', reason: `explicit ${extension} extension` };
  }
  if (extension !== '.ts' && extension !== '.js') {
    throw new Error(`Unsupported Playwright config extension: ${extension || '(none)'}`);
  }

  const packagePath = nearestPackageJson(path.dirname(configPath));
  const format = packageModuleFormat(packagePath);
  const reason = packagePath
    ? `nearest package manifest ${packagePath}${format === 'esm' ? ' declares type=module' : ' does not declare type=module'}`
    : 'no owning package manifest; Node defaults to CommonJS';
  return { format, packagePath, reason };
}

function executableSource(source) {
  let result = '';
  let state = 'code';
  let quote = '';

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (state === 'code') {
      if (current === '/' && next === '/') {
        state = 'line-comment';
        result += '  ';
        index += 1;
      } else if (current === '/' && next === '*') {
        state = 'block-comment';
        result += '  ';
        index += 1;
      } else if (current === "'" || current === '"' || current === '`') {
        state = 'string';
        quote = current;
        result += ' ';
      } else {
        result += current;
      }
    } else if (state === 'line-comment') {
      if (current === '\n') {
        state = 'code';
        result += '\n';
      } else {
        result += ' ';
      }
    } else if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        state = 'code';
        result += '  ';
        index += 1;
      } else {
        result += current === '\n' ? '\n' : ' ';
      }
    } else if (current === '\\') {
      result += ' ';
      if (index + 1 < source.length) {
        result += source[index + 1] === '\n' ? '\n' : ' ';
        index += 1;
      }
    } else if (current === quote) {
      state = 'code';
      quote = '';
      result += ' ';
    } else {
      result += current === '\n' ? '\n' : ' ';
    }
  }

  return result;
}

function hasUnresolvedCommonJsGlobal(source, name) {
  const identifier = new RegExp(`\\b${name}\\b`);
  if (!identifier.test(source)) return false;
  return !new RegExp(`(?:const|let|var)\\s+${name}\\b`).test(source);
}

const options = args(process.argv);
if (!options.config) {
  console.error('Usage: validate-config-module-format.mjs --config <playwright.config.*>');
  process.exit(2);
}

const configPath = path.resolve(options.config);
if (!fs.existsSync(configPath) || !fs.statSync(configPath).isFile()) {
  console.error(`Playwright config does not exist: ${configPath}`);
  process.exit(2);
}

let detected;
try {
  detected = inferModuleFormat(configPath);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const source = fs.readFileSync(configPath, 'utf8');
const code = executableSource(source);
const errors = [];
if (/__[A-Z][A-Z0-9_]*__/.test(source)) {
  errors.push('Config contains unreplaced template sentinels.');
}
if (detected.format === 'commonjs' && /\bimport\.meta\b/.test(code)) {
  errors.push('CommonJS config uses import.meta; use __dirname and remove the now-unused node:url import.');
}
if (detected.format === 'esm' && hasUnresolvedCommonJsGlobal(code, '__dirname')) {
  errors.push('ESM config uses unresolved __dirname; derive the directory from fileURLToPath(import.meta.url).');
}
if (detected.format === 'esm' && hasUnresolvedCommonJsGlobal(code, '__filename')) {
  errors.push('ESM config uses unresolved __filename; derive the file path from import.meta.url.');
}

if (errors.length) {
  console.error(`Invalid ${detected.format} Playwright config (${detected.reason}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Playwright config module format valid: ${detected.format} (${detected.reason}).`);
