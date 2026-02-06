import { describe, expect, it } from 'vitest';
import { createProgram } from '../src/cli/program.js';
import { createCliContext } from '../src/cli/shared.js';

describe('root help output', () => {
  it('mentions shorthand + json and lists user commands', () => {
    const ctx = createCliContext([]);
    const program = createProgram(ctx);
    let help = '';
    program.configureOutput({
      writeOut: (s) => {
        help += s;
      },
      writeErr: () => {},
    });
    program.outputHelp();

    expect(help).toContain('following');
    expect(help).toContain('followers');
    expect(help).toContain('likes');

    expect(help).toContain('owlet <tweet-id-or-url>');
    expect(help).toContain('--json');
    expect(help).toContain('--json-full');
    expect(help).toContain('_raw');
  });

  it('shows global options in subcommand help', () => {
    const ctx = createCliContext([]);
    const program = createProgram(ctx);
    const cmd = program.commands.find((c) => c.name() === 'read');
    if (!cmd) {
      throw new Error('Expected "read" command to be registered');
    }

    let help = '';
    const output = {
      writeOut: (s) => {
        help += s;
      },
      writeErr: () => {},
    };
    program.configureOutput(output);
    cmd.configureOutput(output);

    cmd.outputHelp();

    expect(help).toContain('--auth-token');
    expect(help).toContain('--ct0');
    expect(help).toContain('--timeout');
    expect(help).toContain('--quote-depth');
  });

  it('shows --json-full option in read command help', () => {
    const ctx = createCliContext([]);
    const program = createProgram(ctx);
    const cmd = program.commands.find((c) => c.name() === 'read');
    if (!cmd) {
      throw new Error('Expected "read" command to be registered');
    }

    let help = '';
    const output = {
      writeOut: (s) => {
        help += s;
      },
      writeErr: () => {},
    };
    program.configureOutput(output);
    cmd.configureOutput(output);

    cmd.outputHelp();

    expect(help).toContain('--json-full');
    expect(help).toContain('_raw');
  });

  it('shows --json-full option in search command help', () => {
    const ctx = createCliContext([]);
    const program = createProgram(ctx);
    const cmd = program.commands.find((c) => c.name() === 'search');
    if (!cmd) {
      throw new Error('Expected "search" command to be registered');
    }

    let help = '';
    const output = {
      writeOut: (s) => {
        help += s;
      },
      writeErr: () => {},
    };
    program.configureOutput(output);
    cmd.configureOutput(output);

    cmd.outputHelp();

    expect(help).toContain('--json-full');
  });
});
