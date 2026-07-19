// File: ./scripts/audit-media-state.ts
import fs from 'fs/promises';
import path from 'path';
import { formatValidationReport, validateMediaState } from '../src/server/mediaValidation.ts';

function arg(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const inputPath = arg('--input', 'data/state.json');
const projectId = arg('--project-id');
const jsonPath = arg('--report-json');
const textPath = arg('--report-text');
const allowNetwork = !process.argv.includes('--no-network');
const summaryOnly = process.argv.includes('--summary-only');

const state = JSON.parse(await fs.readFile(inputPath, 'utf-8'));
const auditState = projectId
  ? { ...state, items: (state.items || []).filter((item: any) => String(item.id) === projectId) }
  : state;

if (projectId && auditState.items.length !== 1) throw new Error(`Project ${projectId} was not found exactly once.`);

const report = await validateMediaState(auditState, {
  rootDir: process.cwd(),
  allowNetwork,
  includeTopLevelReferences: false,
  reportMissingOptionalVariants: true,
});
const textReport = formatValidationReport(report);

if (jsonPath) {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
}
if (textPath) {
  await fs.mkdir(path.dirname(textPath), { recursive: true });
  await fs.writeFile(textPath, `${textReport}\n`, 'utf-8');
}

console.log(summaryOnly
  ? `Media validation: ${report.ok ? 'PASS' : 'FAIL'}; projects=${report.scannedProjects}; media=${report.scannedMedia}; errors=${report.errorCount}; warnings=${report.warningCount}`
  : textReport);
process.exitCode = report.ok ? 0 : 2;
