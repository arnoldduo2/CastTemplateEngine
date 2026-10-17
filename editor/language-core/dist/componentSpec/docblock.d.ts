import { PropSpec } from './propHelpers.js';
export interface SlotSpec {
    name: string;
    description: string;
}
export interface ComponentSpec {
    description: string;
    props: PropSpec[];
    slots: SlotSpec[];
    examples: string[];
    deprecated: boolean | string;
    extends?: string;
}
export declare function parseComponent(source: string): ComponentSpec;
//# sourceMappingURL=docblock.d.ts.map