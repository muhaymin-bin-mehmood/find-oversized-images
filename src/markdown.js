import { shortName } from './format.js';

const WORDPRESS_NOTE = `## WordPress

WordPress builds srcset itself from the sizes it has registered, so there is no per-image
snippet to paste. Register the widths above with \`add_image_size\`, regenerate thumbnails,
and return the \`sizes\` value above from the \`wp_calculate_image_sizes\` filter.`;

/**
 * The fixes as markdown, so they paste into an issue, a pull request or a chat.
 * @param {{url:string, version:string}} report
 * @param {{joined:object, fix:object}[]} fixes
 */
export function formatMarkdown(report, fixes) {
  const head = `# Image fixes for ${report.url}\n\nFrom find-oversized-images ${report.version}.`;
  if (fixes.length === 0) return `${head}\n\nNo images needed a fix.\n`;

  const blocks = fixes.map(({ joined, fix }) => {
    const title = `## ${shortName(joined.url)}`;
    const facts = `File is ${joined.file.width}x${joined.file.height}. Paste on the \`<${fix.target}>\`.`;
    const warning = fix.confident ? '' : '\n\n**Not fully measured.** Check this one before pasting.';
    const notes = fix.notes.length ? `\n\n${fix.notes.map((n) => `- ${n}`).join('\n')}` : '';
    return `${title}\n\n${facts}${warning}\n\n\`\`\`html\n${fix.html}\n\`\`\`${notes}`;
  });

  return `${head}\n\n${blocks.join('\n\n')}\n\n${WORDPRESS_NOTE}\n`;
}
