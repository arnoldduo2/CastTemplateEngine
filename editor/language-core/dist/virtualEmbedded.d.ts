import { CastAnalysis } from './types.js';
import { VirtualDocument, VirtualPhpDocument } from './virtualPhp.js';
export interface EmbeddedVirtualDocuments {
    css: Array<VirtualDocument & {
        languageId: 'css';
    }>;
    javascript: Array<VirtualDocument & {
        languageId: 'javascript';
    }>;
    php: VirtualPhpDocument[];
}
export declare function buildEmbeddedVirtuals(uri: string, analysis: CastAnalysis): EmbeddedVirtualDocuments;
//# sourceMappingURL=virtualEmbedded.d.ts.map