import { OffsetRange } from './types.js';

export interface SourceMapSegment {
  source: OffsetRange | null;
  virtual: OffsetRange;
  generated: boolean;
}

/** Maps only copied source segments; generated wrappers intentionally map to null. */
export class SourceMap {
  private readonly segments: SourceMapSegment[] = [];

  public add(segment: SourceMapSegment): void {
    this.segments.push(segment);
  }

  public toSourceOffset(offset: number): number | null {
    const segment = this.segments.find(({ virtual }) => offset >= virtual.start && offset <= virtual.end);
    if (!segment || segment.generated || !segment.source) return null;
    return segment.source.start + Math.min(offset - segment.virtual.start, segment.source.end - segment.source.start);
  }

  public toVirtualOffset(offset: number): number | null {
    const segment = this.segments.find(({ source }) => source !== null && offset >= source.start && offset <= source.end);
    if (!segment || !segment.source || segment.generated) return null;
    return segment.virtual.start + Math.min(offset - segment.source.start, segment.virtual.end - segment.virtual.start);
  }

  public toSourceRange(range: OffsetRange): OffsetRange | null {
    const start = this.toSourceOffset(range.start);
    const end = this.toSourceOffset(range.end);
    if (start === null || end === null) return null;
    const segment = this.segments.find(({ virtual }) => range.start >= virtual.start && range.end <= virtual.end);
    if (!segment?.source) return null;
    return { start, end, text: segment.source.text.slice(start - segment.source.start, end - segment.source.start) };
  }
}
