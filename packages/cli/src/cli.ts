#!/usr/bin/env tsx

/**
 * @stallion-ai/cli — Unified CLI for Stallion
 *
 * Plugin Management:
 *   stallion install <source>     Install from git URL or local path
 *     --skip=<components>   Skip specific components (comma-separated)
 *   stallion preview <source>     Validate and preview plugin contents
 *   stallion list                 List installed plugins
 *   stallion remove <name>        Remove a plugin
 *   stallion info <name>          Show plugin details
 *   stallion update <name>        Update a plugin (git only)
 *   stallion registry [url]       Browse plugin registry (or set URL)
 *   stallion registry install <id> Install a plugin from the configured registry
 *
 * Plugin Development:
 *   stallion init [name]          Scaffold a new plugin (compat alias)
 *   stallion create-plugin [name] Scaffold a new plugin
 *     --template=<full|layout|provider>
 *   stallion export --format=agents-md [--output=path]
 *   stallion import <file>
 *   stallion build                Build plugin bundle
 *   stallion dev [port] [flags]   Dev preview server (default: 4200)
 *     --no-mcp              Disable MCP tool connections
 *     --tools-dir=<path>    Tool configs directory
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from './commands/build.js';
import { configGet, configSet } from './commands/config.js';
import { exportConfig } from './commands/export.js';
import { importConfig } from './commands/import.js';
import { createPlugin, init, type PluginTemplate } from './commands/init.js';
import {
  info,
  install,
  list,
  preview,
  registry,
  remove,
  update,
} from './commands/install.js';
import {
  recordRegistryInstall,
  resolveRegistryPluginSource,
} from './commands/install-registry.js';
import {
  clean,
  doctor,
  link,
  shortcut,
  start,
  stop,
  upgrade,
} from './commands/lifecycle.js';
import { type DevFlags, startDevServer } from './dev/server.js';

export function usageText(): string {
  return `
Stallion CLI (@stallion-ai/cli)

Usage:
  stallion install <source>     Install plugin + build app
    --skip=<components>   Skip specific components (comma-separated)
    --clean               Wipe ~/.stallion-ai before installing
  stallion preview <source>     Validate and preview plugin contents
  stallion start                Start the application (auto-builds if needed)
    --clean               Wipe and rebuild before starting
    --force               Skip confirmation prompt (use with --clean)
    --build               Force rebuild before starting
    --base=<dir>          Data directory (default: ~/.stallion-ai)
    --port=<n>            Server port (default: 3141)
    --ui-port=<n>         UI port (default: 3000)
    --features=<flags>    Comma-separated feature flags (e.g. strands-runtime)
    --log[=<path>]        Redirect server output to log file
  stallion stop                 Stop running application
  stallion upgrade              Pull latest + rebuild (keeps plugins)

Configuration:
  stallion config               Show all config values
  stallion config get <key>     Get a config value
  stallion config set <key> <value>  Set a config value (use "null" to unset)
  stallion export --format=<format> [--output=<path>]
  stallion import <file>

Plugin Management:
  stallion list                 List installed plugins
  stallion remove <name>        Remove a plugin
  stallion info <name>          Show plugin details
  stallion update <name>        Update a plugin (git only)
  stallion registry [url]       Browse plugin registry (or set URL)
  stallion registry install <id> Install a plugin from the configured registry

Setup:
  stallion doctor               Check prerequisites
  stallion link                 Add 'stallion' to PATH (/usr/local/bin)
  stallion shortcut             Create macOS app in ~/Applications

Plugin Development:
  stallion init [name]          Scaffold a new plugin (compat alias)
  stallion create-plugin [name] Scaffold a new plugin
    --template=<full|layout|provider>
  stallion export --format=agents-md [--output=<path>]
  stallion import <file>        Import a Stallion-exported AGENTS.md
  stallion build                Build plugin bundle
  stallion dev [port] [flags]   Dev preview server (default: 4200)
    --no-mcp              Disable MCP tool connections
    --tools-dir=<path>    Tool configs directory
`;
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  switch (command) {
    case 'install': {
      if (args.includes('--clean')) clean();
      const skipArg = args.find((a) => a.startsWith('--skip='));
      const skipList = skipArg ? skipArg.replace('--skip=', '').split(',') : [];
      const source = args.find((a) => !a.startsWith('--'));
      await install(source!, skipList);
      break;
    }
    case 'preview':
      preview(args[0]);
      break;
    case 'list':
      list();
      break;
    case 'remove':
      remove(args[0]);
      break;
    case 'info':
      info(args[0]);
      break;
    case 'update':
      update(args[0]);
      break;
    case 'registry':
      if (args[0] === 'install') {
        const registryId = args[1];
        const source = await resolveRegistryPluginSource(registryId);
        const installed = await install(source, []);
        recordRegistryInstall(registryId, installed.pluginName);
        break;
      }
      registry(args[0]);
      break;
    case 'init':
      init(args[0]);
      break;
    case 'create-plugin': {
      const name = args.find((arg) => !arg.startsWith('--'));
      const templateArg = args.find((arg) => arg.startsWith('--template='));
      const template = templateArg?.split('=')[1] as PluginTemplate | undefined;
      createPlugin(name, { template });
      break;
    }
    case 'build':
      await build();
      break;
    case 'start': {
      if (args.includes('--clean')) await clean(args.includes('--force'));
      let serverPort = 3141;
      let uiPort = 3000;
      let logFile: string | undefined;
      let buildFlag = false;
      let baseDir: string | undefined;
      let features: string | undefined;
      for (const arg of args) {
        if (arg.startsWith('--port='))
          serverPort = parseInt(arg.split('=')[1], 10);
        else if (arg.startsWith('--ui-port='))
          uiPort = parseInt(arg.split('=')[1], 10);
        else if (arg.startsWith('--log=')) logFile = arg.split('=')[1];
        else if (arg === '--log')
          logFile = join(tmpdir(), 'stallion-server.log');
        else if (arg === '--build') buildFlag = true;
        else if (arg.startsWith('--base=')) baseDir = arg.split('=')[1];
        else if (arg.startsWith('--features=')) features = arg.split('=')[1];
      }
      start({
        serverPort,
        uiPort,
        logFile,
        build: buildFlag,
        baseDir,
        features,
      });
      break;
    }
    case 'stop':
      stop();
      break;
    case 'fresh':
      await clean(args.includes('--force'));
      break;
    case 'upgrade':
      upgrade();
      break;
    case 'doctor':
      await doctor();
      break;
    case 'link':
      link();
      break;
    case 'shortcut':
      shortcut();
      break;
    case 'config': {
      const [sub, key, ...rest] = args;
      if (sub === 'set') configSet(key, rest[0]);
      else if (sub === 'get') configGet(key);
      else configGet(); // bare `stallion config` shows all
      break;
    }
    case 'export': {
      const formatArg = args.find((arg) => arg.startsWith('--format='));
      const outputArg = args.find((arg) => arg.startsWith('--output='));
      const format = formatArg?.split('=')[1];
      if (!format) {
        throw new Error('Usage: stallion export --format=<agents-md>');
      }
      exportConfig({
        format: format as 'agents-md' | 'claude-desktop',
        output: outputArg?.split('=')[1],
      });
      break;
    }
    case 'import':
      importConfig(args[0]);
      break;
    case 'dev': {
      const flags: DevFlags = {};
      let devPort = 4200;
      for (const arg of args) {
        if (arg === '--no-mcp') flags.mcp = false;
        else if (arg === '--mcp') flags.mcp = true;
        else if (arg.startsWith('--tools-dir='))
          flags.toolsDir = arg.split('=')[1];
        else if (/^\d+$/.test(arg)) devPort = parseInt(arg, 10);
      }
      await startDevServer(devPort, flags);
      break;
    }
    default:
      console.log(usageText());
  }
}

const invokedAsScript =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedAsScript) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
