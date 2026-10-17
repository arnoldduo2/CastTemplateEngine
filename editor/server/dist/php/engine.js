"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhpEngineManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
class PhpEngineManager {
    hasNotifiedUser = false;
    resolution = null;
    resolve(configuredPhpPath) {
        if (this.resolution) {
            return this.resolution;
        }
        const phpPath = this.findPhpBinary(configuredPhpPath);
        if (!phpPath) {
            this.resolution = {
                phpPath: null,
                phpactorPath: null,
                status: 'missing-php',
                reason: 'PHP runtime not found on PATH or configured path. PHP intelligence disabled.'
            };
            return this.resolution;
        }
        const phpactorPath = this.findPhpactorPhar();
        if (!phpactorPath) {
            this.resolution = {
                phpPath,
                phpactorPath: null,
                status: 'missing-phpactor',
                reason: 'Bundled Phpactor phar not found. PHP intelligence disabled.'
            };
            return this.resolution;
        }
        this.resolution = {
            phpPath,
            phpactorPath,
            command: phpPath,
            args: [phpactorPath, 'language-server'],
            status: 'ready'
        };
        return this.resolution;
    }
    shouldNotify() {
        if (this.hasNotifiedUser)
            return false;
        this.hasNotifiedUser = true;
        return true;
    }
    findPhpBinary(configuredPath) {
        if (configuredPath && fs.existsSync(configuredPath)) {
            return configuredPath;
        }
        // Try PATH
        try {
            const isWindows = process.platform === 'win32';
            const cmd = isWindows ? 'where php' : 'which php';
            const result = (0, child_process_1.execSync)(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
            const firstLine = result.split('\n')[0].trim();
            if (firstLine && fs.existsSync(firstLine)) {
                return firstLine;
            }
        }
        catch {
            // Not on PATH
        }
        // Known Windows fallback paths (XAMPP etc.)
        const fallbacks = [
            'd:\\APPDEV\\xampp\\php\\php.exe',
            'c:\\xampp\\php\\php.exe',
            'c:\\tools\\php\\php.exe',
            'c:\\php\\php.exe'
        ];
        for (const fb of fallbacks) {
            if (fs.existsSync(fb)) {
                return fb;
            }
        }
        return null;
    }
    findPhpactorPhar() {
        const candidates = [
            path.resolve(__dirname, '../../bin/phpactor.phar'),
            path.resolve(__dirname, '../../../bin/phpactor.phar'),
            path.resolve(process.cwd(), 'bin/phpactor.phar')
        ];
        for (const c of candidates) {
            if (fs.existsSync(c)) {
                return c;
            }
        }
        return null;
    }
}
exports.PhpEngineManager = PhpEngineManager;
//# sourceMappingURL=engine.js.map