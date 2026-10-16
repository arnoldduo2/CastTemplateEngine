export interface PhpEngineResolution {
    phpPath: string | null;
    phpactorPath: string | null;
    status: 'ready' | 'missing-php' | 'missing-phpactor' | 'disabled';
    reason?: string;
}
export declare class PhpEngineManager {
    private hasNotifiedUser;
    private resolution;
    resolve(configuredPhpPath?: string): PhpEngineResolution;
    shouldNotify(): boolean;
    private findPhpBinary;
    private findPhpactorPhar;
}
//# sourceMappingURL=engine.d.ts.map