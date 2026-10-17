export interface PropSpec {
    name: string;
    type: string | null;
    description: string;
    required: boolean;
    default: string | null;
    values: string[];
    kind: 'bool' | 'number' | 'string' | 'other';
    deprecated: boolean | string;
    inferred: boolean;
    documented?: boolean;
}
export declare function newProp(name: string): PropSpec;
/** The type at the start of `text`: balanced <>, (), {}, quotes; unions may have spaces around | and &. */
export declare function readType(text: string): {
    type: string | null;
    rest: string;
};
export declare function splitUnion(type: string | null): string[];
export declare function stripQuotes(t: string): string | null;
export declare function kindOf(type: string | null, defaultExpression: string | null): PropSpec['kind'];
/** Quoted or backticked words after "e.g.", "one of", "such as", "values:" or inside the first parentheses. */
export declare function valuesFromDescription(description: string): string[];
/** Fill in what follows from the type and the description: required, kind, allowed values, deprecation. */
export declare function finish(prop: PropSpec): void;
/** The attribute spellings the engine treats as the same prop (`has-label`, `has_label`, `hasLabel`). */
export declare function camel(name: string): string;
/** The attribute spelling the editor should insert, per `cast.propCase`. */
export declare function spell(name: string, style: 'camel' | 'kebab' | 'snake'): string;
//# sourceMappingURL=propHelpers.d.ts.map