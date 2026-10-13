<?php

declare(strict_types=1);

namespace CastTemplateEngine\Console\Commands;

use CastTemplateEngine\Build\Bundler;
use CastTemplateEngine\Console\CommandInterface;

final class EngineBuildCommand implements CommandInterface
{
    public function getName(): string
    {
        return 'engine:build';
    }

    public function getDescription(): string
    {
        return 'Minify and bundle component CSS and JS into app.css and app.js';
    }

    public function execute(array $args): int
    {
        if (in_array('--help', $args, true) || in_array('-h', $args, true)) {
            echo "\nUsage: php cast engine:build [project-root]\n\n";
            echo "Minifies and bundles component CSS and JS into app.css and app.js.\n";
            echo "Component files are discovered from resources/css/components and resources/js/components.\n\n";
            return 0;
        }

        $root = $args[0] ?? getcwd();
        echo "\n[Cast Engine] Building component assets for deploy in {$root}...\n";

        $res = Bundler::build($root);

        echo "  \033[32m✔\033[0m Bundled {$res['css_count']} component CSS file(s) into {$res['app_css']}\n";
        echo "  \033[32m✔\033[0m Bundled {$res['js_count']} component JS file(s) + cast.js runtime into {$res['app_js']}\n";
        echo "\n[Cast Engine] Build complete.\n\n";

        return 0;
    }
}
