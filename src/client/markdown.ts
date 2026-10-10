import { Marked } from 'marked';

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CLICKABLE = /^(https?|mailto):/i;

// The page can be on the home network (--lan), so a message must never inject markup or script.
const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!CLICKABLE.test(href.trim())) return text;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/** GFM Markdown as HTML; raw HTML stays text and only http(s)/mailto links are clickable. */
export const renderMarkdown = (source: string) => marked.parse(source) as string;
