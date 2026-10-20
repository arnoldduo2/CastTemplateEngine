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
exports.getCastSyntaxSpec = getCastSyntaxSpec;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let cachedSpec = null;
function getCastSyntaxSpec() {
    if (cachedSpec) {
        return cachedSpec;
    }
    // Look for cast-syntax.json in editor/spec relative to this file
    const candidatePaths = [
        path.resolve(__dirname, '../../spec/cast-syntax.json'),
        path.resolve(__dirname, '../../../editor/spec/cast-syntax.json'),
        path.resolve(process.cwd(), 'editor/spec/cast-syntax.json'),
    ];
    for (const candidate of candidatePaths) {
        if (fs.existsSync(candidate)) {
            try {
                const content = fs.readFileSync(candidate, 'utf-8');
                cachedSpec = JSON.parse(content);
                return cachedSpec;
            }
            catch {
                // Fall back to embedded default
            }
        }
    }
    // Embedded fallback matching cast-syntax.json
    cachedSpec = {
        version: '1.8.0',
        echo: {
            hole: { open: '@{', close: '}', description: 'Echo interpolation for PHP expressions' },
            native: { open: '<?=', close: '?>', description: 'Standard PHP short-echo tags' },
            escapedLiteral: { token: '@@', output: '@', description: 'Literal @ character escape' }
        },
        blocks: {
            if: { open: '@if', hasArgs: true, close: '@endif', intermediates: ['@elseif', '@else'], description: 'Conditional block.' },
            unless: { open: '@unless', hasArgs: true, close: '@endunless', intermediates: ['@else'], description: 'Inverted conditional block.' },
            isset: { open: '@isset', hasArgs: true, close: '@endisset', intermediates: ['@else'], description: 'Isset conditional block.' },
            for: { open: '@for', hasArgs: true, close: '@endfor', intermediates: [], description: 'Standard for loop.' },
            foreach: { open: '@foreach', hasArgs: true, close: '@endforeach', intermediates: [], description: 'Foreach iteration loop.' },
            forelse: { open: '@forelse', hasArgs: true, close: '@endforelse', intermediates: ['@empty'], description: 'Foreach loop with empty fallback block.' },
            while: { open: '@while', hasArgs: true, close: '@endwhile', intermediates: [], description: 'While loop.' },
            switch: { open: '@switch', hasArgs: true, close: '@endswitch', intermediates: ['@case', '@default'], description: 'Switch statement block.' },
            php: { open: '@php', hasArgs: false, close: '@endphp', intermediates: [], description: 'Raw PHP block or inline statement.' }
        },
        props: {
            directive: '@props',
            syntax: '@props{ ... }',
            inheritanceSyntax: '@props extends::Dotted.ComponentPath{ ... }',
            entryTerminator: ';',
            supportedTypes: ['string', 'int', 'float', 'bool', 'array', 'object', 'iterable', 'callable', 'mixed']
        },
        functionDirectives: {
            htchars: 'htchars',
            route: 'route',
            cast: '__cast',
            csrf: '__csrf',
            alerts: '__getAlerts',
            modules: '__modules',
            includes: '__includes'
        },
        components: {
            tagPattern: '^[A-Z][A-Za-z0-9_]*(?:\\.[A-Z][A-Za-z0-9_]*)*$',
            slotTag: 'Slot'
        },
        allDirectiveWords: [
            'forelse', 'foreach', 'elseif', 'endforelse', 'endforeach', 'endswitch',
            'endunless', 'endisset', 'endwhile', 'endphp', 'endfor', 'endif',
            'switch', 'unless', 'isset', 'default', 'empty', 'else', 'case',
            'for', 'while', 'if', 'php', 'break', 'continue', 'map', 'filter',
            'scripts', 'styles', 'script', 'js', 'css', 'includes', 'children'
        ]
    };
    return cachedSpec;
}
//# sourceMappingURL=syntaxSpec.js.map