import { Position, Range } from 'vscode-languageserver';
import { CastDocument } from './ast.js';
export declare class CastParser {
    private text;
    private lineStarts;
    private syntax;
    parse(uri: string, text: string, version?: number): CastDocument;
    private computeLineStarts;
    positionAt(offset: number): Position;
    offsetAt(position: Position): number;
    createRange(startOffset: number, endOffset: number): Range;
    private parsePropsBlock;
    private parseEchoHoles;
    private parsePhpTags;
    private parseDirectives;
    private parseComponents;
    private parseAttributes;
    private validateBlockNesting;
    private validateComponentTags;
}
//# sourceMappingURL=castParser.d.ts.map