// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderMarkdown } from '../src/client/markdown.ts';

const render = (source: string) => {
  const box = document.createElement('div');
  box.innerHTML = renderMarkdown(source);
  return box;
};

describe('#17 AC1 Markdown elements', () => {
  it('#17 AC1 headings, emphasis, lists, quotes, inline and fenced code become their elements', () => {
    const box = render([
      '# Title', '', '**hi** and *there*', '', '- one', '- two', '', '1. first', '', '> quoted', '',
      'run `npm test`', '', '```ts', 'const a = 1;', '```',
    ].join('\n'));
    expect(box.querySelector('h1')!.textContent).toBe('Title');
    expect(box.querySelector('strong')!.textContent).toBe('hi');
    expect(box.querySelector('em')!.textContent).toBe('there');
    expect(box.querySelectorAll('ul li')).toHaveLength(2);
    expect(box.querySelector('ol li')!.textContent).toBe('first');
    expect(box.querySelector('blockquote')!.textContent).toContain('quoted');
    expect(box.querySelector('p code')!.textContent).toBe('npm test');
    expect(box.querySelector('pre code')!.textContent).toBe('const a = 1;\n');
  });
});

describe('#17 AC2 tables', () => {
  it('#17 AC2 a GFM table renders with header and body rows', () => {
    const box = render('| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |');
    const table = box.querySelector('table')!;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['a', 'b']);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});

describe('#17 AC3 links', () => {
  it('#17 AC3 Markdown links and bare https URLs open in a new tab safely', () => {
    const box = render('See [docs](https://example.com/docs) or https://example.org/x.');
    const links = [...box.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/docs', 'https://example.org/x']);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
});

describe('#17 AC4 link schemes', () => {
  it('#17 AC4 http, https and mailto are clickable', () => {
    const box = render('[a](http://a.test) [b](https://b.test) [c](mailto:c' + '@d.test)');
    expect([...box.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['http://a.test', 'https://b.test', 'mailto:c' + '@d.test']);
  });

  it('#17 AC4 javascript: and other schemes show as plain text', () => {
    for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'vbscript:x']) {
      const box = render(`[click me](${href})`);
      expect(box.querySelector('a')).toBeNull();
      expect(box.textContent).toContain('click me');
    }
  });

  it('#17 AC4 images are not rendered (no img element, even with a javascript: src)', () => {
    const box = render('![pic](javascript:alert(1)) ![pic2](https://x.test/a.png)');
    expect(box.querySelector('img')).toBeNull();
    expect(box.querySelector('a')).toBeNull();
  });
});

describe('#17 AC5 raw HTML', () => {
  it('#17 AC5 block and inline HTML shows as text and never becomes an element', () => {
    const box = render('<script>alert(1)</script>\n\nhello <img src=x onerror="alert(1)"> <b>bold</b>\n\n<div onclick="x">block</div>');
    expect(box.querySelector('script, img, b, div')).toBeNull();
    expect(box.textContent).toContain('<script>alert(1)</script>');
    expect(box.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(box.textContent).toContain('<div onclick="x">block</div>');
  });

  it('#17 AC5 link text and titles cannot break out of the attribute', () => {
    const box = render('[x](https://a.test/"onmouseover="alert(1) "t\\"itle")');
    for (const a of box.querySelectorAll('a')) expect(a.getAttribute('onmouseover')).toBeNull();
  });
});

describe('#17 AC6 wide content scrolls inside the card', () => {
  it('#17 AC6 tables and code blocks scroll sideways in their own box', () => {
    const css = readFileSync('src/client/style.css', 'utf8');
    const rule = (selector: string) => css.match(new RegExp(`(^|\\n)\\s*${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';
    expect(rule('.desc pre')).toMatch(/overflow-x:\s*auto/);
    expect(rule('.desc table')).toMatch(/display:\s*block/);
    expect(rule('.desc table')).toMatch(/overflow-x:\s*auto/);
    expect(rule('.section')).toMatch(/min-width:\s*0/);
  });
});
