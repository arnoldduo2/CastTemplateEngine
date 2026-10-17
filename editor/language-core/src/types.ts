export interface OffsetRange {
  start: number;
  end: number;
  /** The source slice is carried with syntax nodes so consumers do not re-slice inconsistently. */
  text: string;
}

export type RegionKind = 'php' | 'css' | 'javascript';

export interface Region {
  kind: RegionKind;
  range: OffsetRange;
  /** The Cast directive responsible for the region, when there is one. */
  owner?: DirectiveNode;
}

export interface DirectiveNode {
  /** Directive word without its leading @. */
  name: string;
  /** Exactly `@` plus the directive word. */
  nameRange: OffsetRange;
  /** The complete directive invocation, including a parenthesised argument. */
  range: OffsetRange;
  /** The content inside parentheses, excluding the parentheses themselves. */
  argsRange?: OffsetRange;
  isBlockStart: boolean;
  isBlockEnd: boolean;
  isIntermediate: boolean;
  blockType?: string;
}

export interface CoreDiagnostic {
  range: OffsetRange;
  message: string;
  severity: 'error' | 'warning';
  source: 'cast-engine';
}

export interface CastAnalysis {
  text: string;
  directives: DirectiveNode[];
  regions: Region[];
  diagnostics: CoreDiagnostic[];
}
