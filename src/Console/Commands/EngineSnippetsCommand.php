<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Console\CommandInterface;

final class EngineSnippetsCommand implements CommandInterface
{
    public function getName(): string
    {
        return 'engine:snippets';
    }

    public function getDescription(): string
    {
        return 'List all available Cast template code snippets and shorthand triggers';
    }

    public function execute(array $args): int
    {
        echo "\n========================================================================================\n";
        echo "                           CAST TEMPLATE ENGINE SNIPPETS REFERENCE                      \n";
        echo "========================================================================================\n\n";

        $snippets = [
            ['Prefix', 'Description', 'Code Shorthand'],
            ['------', '-----------', '--------------'],
            ['ccomp', 'Component with children', '<Card title="Header">$0</Card>'],
            ['ccomp1', 'Self-closing component', '<Btns.Soft label="Save" />'],
            ['cslot', 'Named Slot', '<Slot name="left">$0</Slot>'],
            ['cprop', 'Expression Prop', 'total={$value}'],
            ['aecho', 'Print Expression', '@{ $variable }'],
            ['amap', 'Array/Object Map with Key', '@map($items, ($item, $i) => return(<Card key={$i}>...</Card>))'],
            ['amapobj', 'Object Map Shorthand', '@$items.map(($item, $i) => return(<Card key={$i}>...</Card>))'],
            ['afilter', 'Filter Collection', '@filter($items, ($item) => $item["qty"] > 0)'],
            ['achain', 'Chained Filter and Map', '@$items.filter(($item) => condition).map(($item, $i) => return(...))'],
            ['acast', 'Conditional Inline Render', '@{ $cond ? @cast(<p>Yes</p>) : @cast(<p>No</p>) }'],
            ['aforeach', 'Foreach Loop', '@foreach ($items as $item) ... @endforeach'],
            ['aforelse', 'Forelse with Empty', '@forelse ($items as $item) ... @empty ... @endforelse'],
            ['aif', 'If Condition', '@if ($condition) ... @endif'],
            ['aifelse', 'If / Else Condition', '@if ($cond) ... @else ... @endif'],
            ['aswitch', 'Switch Case Block', '@switch ($val) @case (1) ... @break @default ... @endswitch'],
            ['aphp', 'PHP Statement / Block', '@php($n = 1) or @php ... @endphp'],
            ['ascript', 'Component Client Script', '@script(handleEvent(\'click\', \'.btn\', (e, el) => { ... }))'],
            ['ajs', 'Component Script Alias', '@js(handleEvent(\'click\', \'.btn\', (e, el) => { ... }))'],
            ['acss', 'Scoped Component Styles', '@css(li.active { color: @{ $color }; })'],
            ['ascripts', 'Render Component Scripts', '@scripts'],
            ['astyles', 'Render Component Styles', '@styles'],
            ['aevent', 'Delegated Event Listener', 'handleEvent(\'click\', \'.selector\', (e, el) => { ... })'],
        ];

        foreach ($snippets as $row) {
            printf("  %-10s | %-30s | %s\n", $row[0], $row[1], $row[2]);
        }

        echo "\nTip: In VS Code, type any prefix above and press Tab or Enter to expand.\n\n";
        return 0;
    }
}
