import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface PhpEngineResolution {
  phpPath: string | null;
  phpactorPath: string | null;
  command?: string;
  args?: string[];
  status: 'ready' | 'missing-php' | 'missing-phpactor' | 'disabled';
  reason?: string;
}

export class PhpEngineManager {
  private hasNotifiedUser: boolean = false;
  private resolution: PhpEngineResolution | null = null;

  public resolve(configuredPhpPath?: string): PhpEngineResolution {
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

  public shouldNotify(): boolean {
    if (this.hasNotifiedUser) return false;
    this.hasNotifiedUser = true;
    return true;
  }

  private findPhpBinary(configuredPath?: string): string | null {
    if (configuredPath && fs.existsSync(configuredPath)) {
      return configuredPath;
    }

    // Try PATH
    try {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows ? 'where php' : 'which php';
      const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      const firstLine = result.split('\n')[0].trim();
      if (firstLine && fs.existsSync(firstLine)) {
        return firstLine;
      }
    } catch {
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

  private findPhpactorPhar(): string | null {
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
