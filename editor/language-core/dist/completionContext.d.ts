export interface ComponentAttrRef {
    name: string | null;
    nameStart: number;
    nameEnd: number;
    equals: number | null;
    valueType: 'string' | 'brace' | 'spread' | null;
    valueStart: number | null;
    valueEnd: number | null;
}
export interface ComponentTagRef {
    kind: 'component';
    name: string;
    start: number;
    end: number;
    closing: boolean;
    tagStart: number;
    tagEnd: number | null;
    selfClosing: boolean;
    attrs: ComponentAttrRef[];
}
/** The component tags (opening and closing), the same scan the engine's compiler reads, in document order. */
export declare function scanComponents(src: string): ComponentTagRef[];
/** The component that contains a `<Slot>`: the nearest enclosing opened (not self-closed) component. */
export declare function parentOf(refs: ComponentTagRef[], slot: ComponentTagRef): ComponentTagRef | null;
export type CompletionContext = {
    type: 'tag';
    prefix: string;
    start: number;
    end: number;
} | {
    type: 'attribute';
    ref: ComponentTagRef;
    prefix: string;
    start: number;
    end: number;
    used: Set<string>;
} | {
    type: 'value';
    ref: ComponentTagRef;
    attr: ComponentAttrRef;
    prefix: string;
    start: number;
    end: number;
    quoted: boolean;
} | {
    type: 'slot';
    ref: ComponentTagRef;
    parent: ComponentTagRef | null;
    attr: ComponentAttrRef;
    prefix: string;
    start: number;
    end: number;
};
/**
 * What is being typed at `offset`:
 *  {type: 'tag', prefix, start, end}                                  after `<` and the first letters of a component name
 *  {type: 'attribute', ref, prefix, start, end, used}                 a prop name inside an open component tag
 *  {type: 'value', ref, attr, prefix, start, end, quoted}             the value of a prop (inside quotes, or right after `=`)
 *  {type: 'slot', ref, parent, attr, prefix, start, end}              the name of a `<Slot name="...">`
 */
export declare function contextAt(src: string, offset: number): CompletionContext | null;
//# sourceMappingURL=completionContext.d.ts.map