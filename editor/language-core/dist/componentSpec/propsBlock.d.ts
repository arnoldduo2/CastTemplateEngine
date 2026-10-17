import { PropSpec } from './propHelpers.js';
export interface PropsBlockResult {
    props: PropSpec[];
    extends: string | null;
    start: number | null;
    end: number | null;
    markupBefore: number | null;
}
export declare function parsePropsBlock(source: string): PropsBlockResult;
//# sourceMappingURL=propsBlock.d.ts.map