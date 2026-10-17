import { SourceMap } from './sourceMap.js';
import { CastAnalysis, OffsetRange, Region, RegionKind } from './types.js';
import { VirtualDocument, VirtualPhpDocument, buildPhpVirtual } from './virtualPhp.js';

export interface EmbeddedVirtualDocuments {
  css: Array<VirtualDocument & { languageId: 'css' }>;
  javascript: Array<VirtualDocument & { languageId: 'javascript' }>;
  php: VirtualPhpDocument[];
}

function buildEmbedded<K extends Exclude<RegionKind, 'php'>>(uri: string, analysis: CastAnalysis, region: Region, kind: K): VirtualDocument & { languageId: K } {
  const holes = analysis.regions.filter((candidate) => candidate.kind === 'php' && candidate.owner === region.owner && candidate.range.start >= region.range.start && candidate.range.end <= region.range.end);
  const chars = region.range.text.split('');
  for (const hole of holes) {
    const start = hole.range.start - region.range.start;
    const end = hole.range.end - region.range.start;
    for (let index = start; index < end; index += 1) chars[index] = chars[index] === '\n' ? '\n' : ' ';
    // Mask the @, braces, and optional surrounding whitespace as well.
    const holeMarker = analysis.text.lastIndexOf('@{', hole.range.start);
    if (holeMarker >= region.range.start) {
      for (let index = holeMarker - region.range.start; index < start; index += 1) chars[index] = chars[index] === '\n' ? '\n' : ' ';
      const closing = analysis.text.indexOf('}', hole.range.end);
      if (closing !== -1 && closing < region.range.end) {
        for (let index = end; index <= closing - region.range.start; index += 1) chars[index] = chars[index] === '\n' ? '\n' : ' ';
      }
    }
  }
  const text = chars.join('');
  const map = new SourceMap();
  const virtual: OffsetRange = { start: 0, end: text.length, text };
  map.add({ source: region.range, virtual, generated: false });
  return { uri: `${uri}.cast-${kind}-${region.range.start}`, languageId: kind, text, map };
}

export function buildEmbeddedVirtuals(uri: string, analysis: CastAnalysis): EmbeddedVirtualDocuments {
  const css = analysis.regions.filter((region) => region.kind === 'css').map((region) => buildEmbedded(uri, analysis, region, 'css'));
  const javascript = analysis.regions.filter((region) => region.kind === 'javascript').map((region) => buildEmbedded(uri, analysis, region, 'javascript'));
  const embeddedPhp = analysis.regions
    .filter((region) => region.kind === 'php' && (region.owner?.name === 'css' || region.owner?.name === 'js' || region.owner?.name === 'script'))
    .map((region) => buildPhpVirtual(uri, analysis, [region]));
  return { css, javascript, php: embeddedPhp };
}
