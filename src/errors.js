/** An expected failure: printed as "Error: <message>" and the CLI exits with code 2. */
export class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolError';
  }
}

/** First line of an error message. Playwright errors carry long call logs after it. */
export const firstLine = (err) => String(err?.message ?? err).split('\n')[0];
