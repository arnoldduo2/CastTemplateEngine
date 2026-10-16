import { ComponentMetadata } from '../types.js';
export declare class ProjectIndex {
    private components;
    private fileToTag;
    private parser;
    private workspaceRoots;
    constructor(workspaceRoots?: string[]);
    setWorkspaceRoots(roots: string[]): void;
    indexAll(): Promise<void>;
    private scanDirectory;
    private scanRecursive;
    indexFile(baseDir: string, fsPath: string, isFramework?: boolean): ComponentMetadata | null;
    removeFile(fsPath: string): void;
    getComponent(tag: string): ComponentMetadata | undefined;
    getAllComponents(): ComponentMetadata[];
    getComponentByPath(fsPath: string): ComponentMetadata | undefined;
    private resolveAllExtends;
    private resolveExtendsChain;
    private pathToTag;
}
//# sourceMappingURL=projectIndex.d.ts.map