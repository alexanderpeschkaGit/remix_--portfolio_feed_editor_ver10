#!/usr/bin/env node
/**
 * splice-block.cjs — verbatim code-block splicing for deep-refactor.
 */
const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('splice-block: ERROR: ' + msg);
  process.exit(1);
}

function arg(args, name) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeUtf8(p, text) {
  fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true });
  fs.writeFileSync(p, text, { encoding: 'utf8' });
}

function applyExports(block, names) {
  if (!names || names.length === 0) return block;
  const list = names.split(',').map((n) => n.trim()).filter(Boolean);
  if (list.length === 0) return block;
  const re = new RegExp('^(\\s*)(async\\s+function|const|let|type|function)\\s+(' + list.join('|') + ')\\b', 'gm');
  return block.replace(re, (m, indent, kw, name) => indent + 'export ' + kw + ' ' + name);
}

function indexOfAnchor(raw, anchor, fromIndex = 0) {
  let i = raw.indexOf(anchor, fromIndex);
  if (i === -1 && anchor.includes('\n')) {
    i = raw.indexOf(anchor.replace(/\n/g, '\r\n'), fromIndex);
  }
  return i;
}

function main() {
  const args = process.argv.slice(2);
  const op = args[0];
  if (op !== 'move' && op !== 'remove') {
    fail('first argument must be "move" or "remove"');
  }
  function unescapeStr(s) {
    if (typeof s !== 'string') return s;
    return s.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
  }

  const src = arg(args, '--src');
  const from = unescapeStr(arg(args, '--from'));
  const to = unescapeStr(arg(args, '--to'));
  if (!src || from === undefined || to === undefined) fail('--src, --from and --to are required');
  const out = arg(args, '--out');
  const header = unescapeStr(arg(args, '--header'));
  const footer = unescapeStr(arg(args, '--footer'));
  const exportsArg = arg(args, '--exports');
  const replacement = unescapeStr(arg(args, '--replacement') !== undefined ? arg(args, '--replacement') : '');
  const append = args.includes('--append');

  const raw = readUtf8(src);
  const startIdx = indexOfAnchor(raw, from);
  if (startIdx === -1) fail('--from anchor not found in ' + src);
  if (indexOfAnchor(raw, from, startIdx + 1) !== -1) fail('--from anchor is not unique in ' + src);
  const endIdx = indexOfAnchor(raw, to, startIdx);
  if (endIdx === -1) fail('--to anchor not found after --from in ' + src);
  if (indexOfAnchor(raw, to, endIdx + 1) !== -1) {
    console.warn('splice-block: warning: --to anchor occurs more than once; using first occurrence after --from');
  }
  const block = raw.substring(startIdx, endIdx);

  if (raw.indexOf(block) === -1) fail('internal error: block not re-found in source');

  const newRaw = raw.substring(0, startIdx) + replacement + raw.substring(endIdx);
  writeUtf8(src, newRaw);

  if (out) {
    const exportedBlock = applyExports(block, exportsArg);
    const content = (header || '') + exportedBlock + (footer || '');
    if (append && fs.existsSync(out)) {
      writeUtf8(out, readUtf8(out) + content);
    } else {
      writeUtf8(out, content);
    }
  }

  const lines = block.split('\n').length - 1;
  console.log(`splice-block: ${op} done: removed ${lines} lines from ${src}` + (out ? ` -> ${out}${append ? ' (appended)' : ''}` : ''));
}

main();
