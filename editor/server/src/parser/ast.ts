import { Range, Position } from 'vscode-languageserver';
import { CastDiagnostic, PropDefinition } from '../types.js';

export interface ASTNode {
  range: Range;
}

export interface PropEntryNode extends ASTNode {
  name: string;
  type: string;
  isNullable: boolean;
  isRequired: boolean;
  defaultValue?: string;
  typeRange: Range;
  nameRange: Range;
}

export interface PropsBlockNode extends ASTNode {
  extendsTarget?: string;
  extendsRange?: Range;
  entries: PropEntryNode[];
  rawText: string;
}

export interface ComponentAttributeNode extends ASTNode {
  name: string;
  value?: string;
  isExpression: boolean;
  isSpread: boolean;
  isBoolean: boolean;
  nameRange: Range;
  valueRange?: Range;
}

export interface ComponentNode extends ASTNode {
  name: string;
  isSelfClosing: boolean;
  isClosing: boolean;
  attributes: ComponentAttributeNode[];
  nameRange: Range;
  pairedClosingTag?: ComponentNode;
}

export interface DirectiveNode extends ASTNode {
  name: string;
  /** Only `@` plus the directive word; arguments belong to embedded PHP. */
  nameRange: Range;
  args?: string;
  argsRange?: Range;
  isBlockStart: boolean;
  isBlockEnd: boolean;
  isIntermediate: boolean;
  blockType?: string; // 'if', 'foreach', 'switch', etc.
}

export interface EchoHoleNode extends ASTNode {
  expression: string;
  expressionRange: Range;
}

export interface PhpTagNode extends ASTNode {
  code: string;
  isEcho: boolean;
}

export interface HtmlTagNode extends ASTNode {
  name: string;
  isClosing: boolean;
  isSelfClosing: boolean;
}

export interface CastDocument {
  uri: string;
  text: string;
  version: number;
  propsBlock?: PropsBlockNode;
  components: ComponentNode[];
  directives: DirectiveNode[];
  echoHoles: EchoHoleNode[];
  phpTags: PhpTagNode[];
  htmlTags: HtmlTagNode[];
  diagnostics: CastDiagnostic[];
}
