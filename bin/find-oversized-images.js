#!/usr/bin/env node
import { run } from '../src/cli.js';

// The reader went away (e.g. `| head -1`). Nothing left to print to, so say nothing.
process.stdout.on('error', (err) => {
  if (err.code !== 'EPIPE') throw err;
});

process.exitCode = await run(process.argv.slice(2));
