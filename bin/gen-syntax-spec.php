<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Directives.php';
require_once __DIR__ . '/../src/Props.php';

use CastTemplateEngine\Directives;
use CastTemplateEngine\Props;

// Reflection on Directives and Props to extract exact definitions
$refDirectives = new ReflectionClass(Directives::class);
$refProps = new ReflectionClass(Props::class);

// Extract constants
$constants = $refDirectives->getConstants();
$fnDirectives = $constants['FUNCTION_DIRECTIVES'] ?? [];
$wordPattern = $constants['WORD'] ?? '';
preg_match_all('/[a-zA-Z0-9]+/', $wordPattern, $wordMatches);
$allWords = array_values(array_unique($wordMatches[0] ?? []));

$propsConstants = $refProps->getConstants();
$allowedPropTypes = $propsConstants['TYPES'] ?? [];

$spec = [
    '$schema' => 'https://json-schema.org/draft/2020-12/schema',
    'title' => 'Cast Syntax Specification',
    'description' => 'Machine-readable specification of the Cast Template Engine syntax grammar and directives.',
    'version' => '1.8.0',
    'fileExtensions' => ['.cast.php'],
    'echo' => [
        'hole' => [
            'open' => '@{',
            'close' => '}',
            'description' => 'Echo interpolation for PHP expressions, equivalent to <?= ... ?> with automatic whitespace preservation.'
        ],
        'native' => [
            'open' => '<?=',
            'close' => '?>',
            'description' => 'Standard PHP short-echo tags.'
        ],
        'escapedLiteral' => [
            'token' => '@@',
            'output' => '@',
            'description' => 'Literal @ character escape.'
        ]
    ],
    'blocks' => [
        'if' => [
            'open' => '@if',
            'hasArgs' => true,
            'close' => '@endif',
            'intermediates' => ['@elseif', '@else'],
            'description' => 'Conditional block.'
        ],
        'unless' => [
            'open' => '@unless',
            'hasArgs' => true,
            'close' => '@endunless',
            'intermediates' => ['@else'],
            'description' => 'Inverted conditional block (if not).'
        ],
        'isset' => [
            'open' => '@isset',
            'hasArgs' => true,
            'close' => '@endisset',
            'intermediates' => ['@else'],
            'description' => 'Isset conditional block.'
        ],
        'for' => [
            'open' => '@for',
            'hasArgs' => true,
            'close' => '@endfor',
            'intermediates' => [],
            'description' => 'Standard for loop.'
        ],
        'foreach' => [
            'open' => '@foreach',
            'hasArgs' => true,
            'close' => '@endforeach',
            'intermediates' => [],
            'description' => 'Foreach iteration loop.'
        ],
        'forelse' => [
            'open' => '@forelse',
            'hasArgs' => true,
            'close' => '@endforelse',
            'intermediates' => ['@empty'],
            'description' => 'Foreach loop with empty fallback block.'
        ],
        'while' => [
            'open' => '@while',
            'hasArgs' => true,
            'close' => '@endwhile',
            'intermediates' => [],
            'description' => 'While loop.'
        ],
        'switch' => [
            'open' => '@switch',
            'hasArgs' => true,
            'close' => '@endswitch',
            'intermediates' => ['@case', '@default'],
            'description' => 'Switch statement block.'
        ],
        'php' => [
            'open' => '@php',
            'hasArgs' => false,
            'close' => '@endphp',
            'intermediates' => [],
            'inlineForm' => '@php(...)',
            'description' => 'Raw PHP block or inline statement.'
        ]
    ],
    'loopControl' => [
        'break' => [
            'directive' => '@break',
            'optionalCondition' => true,
            'description' => 'Break loop statement, optional condition argument.'
        ],
        'continue' => [
            'directive' => '@continue',
            'optionalCondition' => true,
            'description' => 'Continue loop statement, optional condition argument.'
        ]
    ],
    'collections' => [
        'map' => [
            'directive' => '@map',
            'signature' => '@map($collection, ($item, $i) => expr)',
            'description' => 'Transform collection elements.'
        ],
        'filter' => [
            'directive' => '@filter',
            'signature' => '@filter($collection, ($item) => condition[, ($item) => render])',
            'description' => 'Filter collection elements.'
        ],
        'fluentChain' => [
            'pattern' => '@(\\$?[A-Za-z_][A-Za-z0-9_]*)\\.(filter|map)\\(...\\)',
            'description' => 'Fluent chained collection transformation.'
        ]
    ],
    'assets' => [
        'css' => [
            'directive' => '@css',
            'signature' => '@css(...)',
            'scoped' => true,
            'description' => 'Component-scoped CSS with dynamic variable extraction and class scoping.'
        ],
        'script' => [
            'directive' => '@script',
            'alias' => '@js',
            'signature' => '@script(...)',
            'description' => 'Component-scoped JavaScript registration.'
        ],
        'renderStyles' => [
            'directive' => '@styles',
            'description' => 'Renders gathered component style tags in layout head.'
        ],
        'renderScripts' => [
            'directive' => '@scripts',
            'description' => 'Renders gathered component script tags before layout body close.'
        ]
    ],
    'content' => [
        'children' => [
            'directive' => '@children',
            'description' => 'Prints the content captured between a component\'s opening and closing tags, or a literal fallback when there was none.',
            'fallback' => 'empty content'
        ]
    ],
    'props' => [
        'directive' => '@props',
        'syntax' => '@props{ ... }',
        'inheritanceSyntax' => '@props extends::Dotted.ComponentPath{ ... }',
        'entryTerminator' => ';',
        'placement' => 'Must appear before any HTML markup in component view.',
        'supportedTypes' => $allowedPropTypes,
        'features' => [
            'nullable' => '?Type',
            'union' => 'TypeA|TypeB',
            'defaults' => '$name = expression;',
            'required' => '$name; (no default)',
            'comments' => 'Trailing comments // are allowed'
        ]
    ],
    'functionDirectives' => $fnDirectives,
    'components' => [
        'tagPattern' => '^[A-Z][A-Za-z0-9_]*(?:\\.[A-Z][A-Za-z0-9_]*)*$',
        'slotTag' => 'Slot',
        'attributes' => [
            'literalString' => 'name="value" or name=\'value\'',
            'phpExpression' => 'name={$expr}',
            'booleanFlag' => 'name',
            'spread' => '{...$expr}'
        ]
    ],
    'allDirectiveWords' => $allWords
];

$outputDir = __DIR__ . '/../editor/spec';
if (!is_dir($outputDir)) {
    mkdir($outputDir, 0777, true);
}

$outputFile = $outputDir . '/cast-syntax.json';
$json = json_encode($spec, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
file_put_contents($outputFile, $json);

echo "Wrote Cast Syntax Specification to $outputFile (" . strlen($json) . " bytes)\n";
