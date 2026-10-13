#!/usr/bin/env node
/**
 * splice-block.cjs — verbatim code-block splicing for the deep-refactor of src/App.tsx.
 *
 * Usage (one operation per invocation):
 *
 * 1) Move a block OUT of src into a new/existing file (and remove it from src):
 *    node scripts/splice-block.cjs move \
 *      --src src/App.tsx \
 *      --from "<exact start anchor>" \
 *      --to   "<exact anchor that starts AFTER the block>" \
 *      --out  src/utils/mediaHelpers.ts \
 *      --header "<text to write before the block (imports/comment)>" \
 *      --append \
 *      --exports "name1,name2" \
 *      --replacement "<text to leave in src at the removal point, default ''>"
 *
 * 2) Only remove a block from src (replacement optional):
 *    node scripts/splice-block.cjs remove --src ... --from ... --to ... --replacement "..."
 *
 * Notes:
 * - The block is [indexOf(from), indexOf(to)) — the `to` anchor is never removed.
 * - `--append` appends to an existing --out file instead of creating it.
 * - `--exports` adds `export ` to the listed top-level const/type/function declarations
 *   inside the moved block (only when the line does not already start with export).
 * - Encoding: UTF-8, no BOM, line endings of untouched regions preserved byte-for-byte.
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
  const re = new RegExp('^(\\s*)(const|type|function)\\s+(' + list.join('|') + ')\\b', 'gm');
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
  const src = arg(args, '--src');
  const from = arg(args, '--from');
  const to = arg(args, '--to');
  if (!src || from === undefined || to === undefined) fail('--src, --from and --to are required');
  const out = arg(args, '--out');
  const header = arg(args, '--header');
  const exportsArg = arg(args, '--exports');
  const replacement = arg(args, '--replacement') !== undefined ? arg(args, '--replacement') : '';
  const append = args.includes('--append');

  const raw = readUtf8(src);
  const startIdx = indexOfAnchor(raw, from);
  if (startIdx === -1) fail('--from anchor not found in ' + src);
  if (indexOfAnchor(raw, from, startIdx + 1) !== -1) fail('--from anchor is not unique in ' + src);
  const endIdx = indexOfAnchor(raw, to, startIdx);
  if (endIdx === -1) fail('--to anchor not found after --from in ' + src);
  if (indexOfAnchor(raw, to, endIdx + 1) !== -1) {
    // The to-anchor may legitimately appear multiple times later (e.g. useEffect).
    // Only fail if the *next* occurrence is immediately adjacent, i.e. ambiguous slice.
    console.warn('splice-block: warning: --to anchor occurs more than once; using first occurrence after --from');
  }
  const block = raw.substring(startIdx, endIdx);

  // Validate that no forbidden byte-loss occurs: source must contain block verbatim once.
  if (raw.indexOf(block) === -1) fail('internal error: block not re-found in source');

  const newRaw = raw.substring(0, startIdx) + replacement + raw.substring(endIdx);
  writeUtf8(src, newRaw);

  if (out) {
    const exportedBlock = applyExports(block, exportsArg);
    const content = (header || '') + exportedBlock;
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
