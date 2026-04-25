#!/usr/bin/env tsx

/**
 * @stallion-ai/cli — Unified CLI for Stallion
 *
 * Plugin:
 *   stallion plugin install <source>     Install from git URL or local path
 *     --skip=<components>   Skip specific components (comma-separated)
 *   stallion plugin preview <source>     Validate and preview plugin contents
 *   stallion plugin list                 List installed plugins
 *   stallion plugin remove <name>        Remove a plugin
 *   stallion plugin info <name>          Show plugin details
 *   stallion plugin update <name>        Update a plugin (git only)
 *   stallion plugin init [name]          Scaffold a new plugin
 *   stallion plugin create [name]        Scaffold a new plugin
 *     --template=<full|layout|provider>
 *   stallion plugin build                Build plugin bundle
 *   stallion plugin dev [port] [flags]   Dev preview server (default: 4200)
 *     --no-mcp              Disable MCP tool connections
 *     --tools-dir=<path>    Tool configs directory
 *
 * Registry:
 *   stallion registry [url]              Browse plugin registry (or set URL)
 *   stallion registry install <id>       Install a plugin from the configured registry
 *   stallion registry <catalog> <action> Manage agents/skills/integrations/plugins in the unified catalog
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from './commands/build.js';
import { configGet, configSet } from './commands/config.js';
import { runCoreCommand } from './commands/core.js';
import { exportConfig } from './commands/export.js';
import { resolveLifecycleHomeTarget } from './commands/helpers.js';
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
import {
  runRegistryCatalogCommand,
  runSurfaceCommand,
} from './commands/surfaces.js';
import { type DevFlags, startDevServer } from './dev/server.js';

export function usageText(): string {
  return `
Stallion CLI (@stallion-ai/cli)

Usage:
  stallion start                Start the application (auto-builds if needed)
    --clean               Wipe and rebuild before starting
    --force               Skip confirmation prompt (use with --clean)
    --allow-default-home-clean
                          Explicitly allow deleting ~/.stallion-ai
    --build               Force rebuild before starting
    --base=<dir>          Data directory (default: ~/.stallion-ai)
    --temp-home           Create and use a throwaway home under the system temp dir
    --instance=<name>     Stable instance name for targeted stop/restart flows
    --port=<n>            Server port (default: 3141)
    --ui-port=<n>         UI port (default: 3000)
    --features=<flags>    Comma-separated feature flags (e.g. strands-runtime)
    --log[=<path>]        Redirect server output to log file
  stallion stop                 Stop a running application instance
    --instance=<name>     Stop a named instance
    --base=<dir>          Stop the instance using a specific home
    --port=<n>            Match by server port
    --ui-port=<n>         Match by UI port
  stallion fresh               Remove the selected home + shared build output
    --force               Skip confirmation prompt
    --allow-default-home-clean
                          Explicitly allow deleting ~/.stallion-ai
    --base=<dir>          Data directory (default: ~/.stallion-ai)
    --temp-home           Create and clean a throwaway home under the system temp dir
    --instance=<name>     Stable instance name for targeted cleanup
    --port=<n>            Server port used for instance targeting
    --ui-port=<n>         UI port used for instance targeting
  stallion upgrade              Pull latest + rebuild (keeps plugins)

Configuration:
  stallion config               Show all config values
  stallion config get <key>     Get a config value
  stallion config set <key> <value>  Set a config value (use "null" to unset)
  stallion export --format=<format> [--output=<path>]
  stallion import <file>

Plugin:
  stallion plugin install <source>  Install plugin from git URL or local path
    --skip=<components>   Skip specific components (comma-separated)
    --clean               Wipe ~/.stallion-ai before installing
  stallion plugin preview <source>  Validate and preview plugin contents
  stallion plugin list              List installed plugins
  stallion plugin remove <name>     Remove a plugin
  stallion plugin info <name>       Show plugin details
  stallion plugin update <name>     Update a plugin (git only)
  stallion plugin init [name]       Scaffold a new plugin (full template)
  stallion plugin create [name]     Scaffold a new plugin
    --template=<full|layout|provider>
  stallion plugin build             Build plugin bundle
  stallion plugin dev [port] [flags]  Dev preview server (default: 4200)
    --no-mcp              Disable MCP tool connections
    --tools-dir=<path>    Tool configs directory

Core Workspace:
  stallion agents <action>      List/get/create/update/delete agents
  stallion chat <agent> <msg>   Chat with a defined agent
  stallion sessions <action>    List/read/interrupt managed and runtime sessions
  stallion projects <action>    CRUD projects and project layouts
  stallion skills <action>      List/get/create/update/delete/install skills
  stallion playbooks <action>   CRUD playbooks and record usage/outcomes
  stallion prompts <action>     Compatibility alias for playbooks
  stallion connections <action> Manage model/runtime connections
  stallion tools <action>       Manage tool servers (MCP integrations)
  stallion notifications <action> Manage inbox and approval notifications
  stallion monitoring <action>  Query monitoring stats, metrics, and events
  stallion schedule <action>    Manage scheduled jobs and scheduler status
  stallion runs <action>        Read global run history through the neutral runs API
  stallion knowledge <action>   Query knowledge status, search, namespaces, and documents
  stallion auth <action>        Check auth status and user directory info
  stallion branding <action>    Read resolved branding config
  stallion feedback <action>    Manage message ratings and learned behavior state
  stallion insights <action>    Read aggregated product insights
  stallion acp <action>         Manage ACP status, commands, and connections
  stallion voice <action>       Manage voice session status and lifecycle

Registry:
  stallion registry [url]           Browse plugin registry (or set URL)
  stallion registry install <id>    Install a plugin from the configured registry
  stallion registry <catalog> <action>  Manage agents/skills/integrations/plugins in the unified catalog

Setup:
  stallion doctor               Check prerequisites
  stallion link                 Add 'stallion' to PATH (/usr/local/bin)
  stallion shortcut             Create macOS app in ~/Applications
`;
}

interface ParsedLifecycleArgs {
  allowDefaultHomeClean: boolean;
  baseDir: string;
  buildFlag: boolean;
  features?: string;
  force: boolean;
  homeSource: 'env' | '--base' | '--temp-home' | 'default';
  instanceName?: string;
  logFile?: string;
  serverPort: number;
  uiPort: number;
}

function parseLifecycleArgs(args: string[]): ParsedLifecycleArgs {
  let serverPort = 3141;
  let uiPort = 3000;
  let logFile: string | undefined;
  let buildFlag = false;
  let baseDir: string | undefined;
  let features: string | undefined;
  let instanceName: string | undefined;
  const tempHome = args.includes('--temp-home');

  for (const arg of args) {
    if (arg.startsWith('--port=')) {
      serverPort = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--ui-port=')) {
      uiPort = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--log=')) {
      logFile = arg.split('=')[1];
    } else if (arg === '--log') {
      logFile = join(tmpdir(), 'stallion-server.log');
    } else if (arg === '--build') {
      buildFlag = true;
    } else if (arg.startsWith('--base=')) {
      baseDir = arg.split('=')[1];
    } else if (arg.startsWith('--features=')) {
      features = arg.split('=')[1];
    } else if (arg.startsWith('--instance=')) {
      instanceName = arg.split('=')[1];
    }
  }

  if (tempHome && baseDir) {
    throw new Error('--temp-home cannot be combined with --base.');
  }

  const homeTarget = resolveLifecycleHomeTarget({ baseDir, tempHome });

  return {
    serverPort,
    uiPort,
    logFile,
    buildFlag,
    baseDir: homeTarget.projectHome,
    homeSource: homeTarget.source,
    features,
    instanceName,
    force: args.includes('--force'),
    allowDefaultHomeClean: args.includes('--allow-default-home-clean'),
  };
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  switch (command) {
    case 'plugin': {
      const [sub, ...subArgs] = args;
      switch (sub) {
        case 'install': {
          if (subArgs.includes('--clean')) {
            const lifecycleArgs = parseLifecycleArgs(subArgs);
            await clean({
              actionLabel: 'plugin install --clean',
              allowDefaultHomeClean: lifecycleArgs.allowDefaultHomeClean,
              force: lifecycleArgs.force,
              homeSource: lifecycleArgs.homeSource,
              instanceName: lifecycleArgs.instanceName,
              projectHome: lifecycleArgs.baseDir,
              serverPort: lifecycleArgs.serverPort,
              uiPort: lifecycleArgs.uiPort,
            });
          }
          const skipArg = subArgs.find((a) => a.startsWith('--skip='));
          const skipList = skipArg
            ? skipArg.replace('--skip=', '').split(',')
            : [];
          const source = subArgs.find((a) => !a.startsWith('--'));
          await install(source!, skipList);
          break;
        }
        case 'preview':
          preview(subArgs[0]);
          break;
        case 'list':
          list();
          break;
        case 'remove':
          remove(subArgs[0]);
          break;
        case 'info':
          info(subArgs[0]);
          break;
        case 'update':
          update(subArgs[0]);
          break;
        case 'registry':
          if (
            ['agents', 'skills', 'integrations', 'plugins'].includes(subArgs[0])
          ) {
            await runRegistryCatalogCommand(subArgs);
            break;
          }
          if (subArgs[0] === 'install') {
            const registryId = subArgs[1];
            const source = await resolveRegistryPluginSource(registryId);
            const installed = await install(source, []);
            recordRegistryInstall(registryId, installed.pluginName);
            break;
          }
          registry(subArgs[0]);
          break;
        case 'init':
          init(subArgs[0]);
          break;
        case 'create': {
          const name = subArgs.find((arg) => !arg.startsWith('--'));
          const templateArg = subArgs.find((arg) =>
            arg.startsWith('--template='),
          );
          const template = templateArg?.split('=')[1] as
            | PluginTemplate
            | undefined;
          createPlugin(name, { template });
          break;
        }
        case 'build':
          await build();
          break;
        case 'dev': {
          const flags: DevFlags = {};
          let devPort = 4200;
          for (const arg of subArgs) {
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
      break;
    }
    case 'start': {
      const lifecycleArgs = parseLifecycleArgs(args);
      if (args.includes('--clean')) {
        await clean({
          actionLabel: 'start --clean',
          allowDefaultHomeClean: lifecycleArgs.allowDefaultHomeClean,
          force: lifecycleArgs.force,
          homeSource: lifecycleArgs.homeSource,
          instanceName: lifecycleArgs.instanceName,
          projectHome: lifecycleArgs.baseDir,
          serverPort: lifecycleArgs.serverPort,
          uiPort: lifecycleArgs.uiPort,
        });
      }
      await start({
        serverPort: lifecycleArgs.serverPort,
        uiPort: lifecycleArgs.uiPort,
        logFile: lifecycleArgs.logFile,
        build: lifecycleArgs.buildFlag,
        baseDir: lifecycleArgs.baseDir,
        homeSource: lifecycleArgs.homeSource,
        instanceName: lifecycleArgs.instanceName,
        features: lifecycleArgs.features,
      });
      break;
    }
    case 'stop': {
      const lifecycleArgs = parseLifecycleArgs(args);
      const hasExplicitBase = args.some((arg) => arg.startsWith('--base='));
      const hasSelector =
        args.some((arg) => arg.startsWith('--instance=')) ||
        args.some((arg) => arg.startsWith('--port=')) ||
        args.some((arg) => arg.startsWith('--ui-port='));
      stop({
        baseDir:
          hasExplicitBase || !hasSelector ? lifecycleArgs.baseDir : undefined,
        instanceName: lifecycleArgs.instanceName,
        serverPort: args.some((arg) => arg.startsWith('--port='))
          ? lifecycleArgs.serverPort
          : undefined,
        uiPort: args.some((arg) => arg.startsWith('--ui-port='))
          ? lifecycleArgs.uiPort
          : undefined,
      });
      break;
    }
    case 'fresh':
      {
        const lifecycleArgs = parseLifecycleArgs(args);
        await clean({
          actionLabel: 'fresh',
          allowDefaultHomeClean: lifecycleArgs.allowDefaultHomeClean,
          force: lifecycleArgs.force,
          homeSource: lifecycleArgs.homeSource,
          instanceName: lifecycleArgs.instanceName,
          projectHome: lifecycleArgs.baseDir,
          serverPort: lifecycleArgs.serverPort,
          uiPort: lifecycleArgs.uiPort,
        });
      }
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
        throw new Error(
          'Usage: stallion export --format=<agents-md|claude-desktop>',
        );
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
    case 'agents':
    case 'sessions':
    case 'projects':
    case 'skills':
    case 'playbooks':
    case 'prompts':
    case 'chat':
      await runCoreCommand(command, args);
      break;
    case 'registry':
      if (['agents', 'skills', 'integrations', 'plugins'].includes(args[0])) {
        await runRegistryCatalogCommand(args);
        break;
      }
      if (args[0] === 'install') {
        const registryId = args[1];
        const source = await resolveRegistryPluginSource(registryId);
        const installed = await install(source, []);
        recordRegistryInstall(registryId, installed.pluginName);
        break;
      }
      registry(args[0]);
      break;
    case 'connections':
    case 'tools':
    case 'notifications':
    case 'monitoring':
    case 'schedule':
    case 'runs':
    case 'knowledge':
    case 'auth':
    case 'branding':
    case 'feedback':
    case 'insights':
    case 'acp':
    case 'voice':
      await runSurfaceCommand(command, args);
      break;
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
