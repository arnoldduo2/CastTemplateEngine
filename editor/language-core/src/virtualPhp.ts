import { SourceMap } from './sourceMap.js';
import { CastAnalysis, OffsetRange, Region } from './types.js';

export interface VirtualDocument {
  uri: string;
  languageId: 'php' | 'css' | 'javascript';
  text: string;
  map: SourceMap;
}

export interface VirtualPhpDocument extends VirtualDocument {
  languageId: 'php';
  /** Ranges in the virtual document that came from Cast PHP source. */
  phpRanges: OffsetRange[];
}

function virtualRange(text: string, start: number, end: number): OffsetRange {
  return { start, end, text: text.slice(start, end) };
}

function appendPhpRegion(output: { text: string; map: SourceMap; phpRanges: OffsetRange[] }, region: Region): void {
  const owner = region.owner?.name;
  let prefix = '';
  let suffix = '';
  if (owner === 'if' || owner === 'unless' || owner === 'isset' || owner === 'while' || owner === 'switch') {
    prefix = `${owner === 'unless' ? 'if (!(' : `${owner} (`}`;
    suffix = owner === 'unless' ? ')) {}\n' : ') {}\n';
  } else if (owner === 'for' || owner === 'foreach' || owner === 'forelse') {
    prefix = `${owner === 'forelse' ? 'foreach' : owner} (`;
    suffix = ') {}\n';
  } else if (owner === 'case') {
    prefix = 'switch (true) { case ';
    suffix = ': break; }\n';
  } else if (owner === 'php') {
    suffix = region.range.text.trimEnd().endsWith(';') ? '\n' : ';\n';
  } else {
    prefix = '$_cast_value = (';
    suffix = ');\n';
  }

  output.text += prefix;
  const start = output.text.length;
  output.text += region.range.text;
  const end = output.text.length;
  const copied = virtualRange(output.text, start, end);
  output.phpRanges.push(copied);
  output.map.add({ source: region.range, virtual: copied, generated: false });
  output.text += suffix;
}

export function buildPhpVirtual(uri: string, analysis: CastAnalysis, regions?: Region[]): VirtualPhpDocument {
  const output = { text: '<?php\ndeclare(strict_types=1);\n', map: new SourceMap(), phpRanges: [] as OffsetRange[] };
  for (const region of regions ?? analysis.regions.filter((candidate) => candidate.kind === 'php')) {
    appendPhpRegion(output, region);
  }
  return { uri: `${uri}.cast-php`, languageId: 'php', text: output.text, map: output.map, phpRanges: output.phpRanges };
}
