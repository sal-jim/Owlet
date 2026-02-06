#!/usr/bin/env node

/**
 * owlet - CLI tool for reading tweets and compiling timelines
 *
 * Usage:
 *   owlet read <tweet-id-or-url>
 *   owlet news -n 10
 *   owlet search "ai safety" -n 10 --json
 */

import { createProgram, KNOWN_COMMANDS } from './cli/program.js';
import { createCliContext } from './cli/shared.js';
import { resolveCliInvocation } from './lib/cli-args.js';

const rawArgs: string[] = process.argv.slice(2);
const normalizedArgs: string[] = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

const ctx = createCliContext(normalizedArgs);

const program = createProgram(ctx);

const { argv, showHelp } = resolveCliInvocation(normalizedArgs, KNOWN_COMMANDS);

if (showHelp) {
  program.outputHelp();
  process.exit(0);
}

if (argv) {
  program.parse(argv);
} else {
program.parse(['node', 'owlet', ...normalizedArgs]);
}
