/* Minimal HTMLRewriter polyfill for Node tests ONLY — never import
 * this from a Function. It implements the subset of the Workers
 * HTMLRewriter API the brand middleware uses: .on(selector, handler)
 * with element()/text() handlers, el.setAttribute/getAttribute/
 * setInnerContent/onEndTag, text.remove()/replace(), endTag.before().
 * Matching is regex-based and only supports the selectors the
 * middleware registers (tag, tag[attr="value"], .class). The real
 * HTMLRewriter runs on Cloudflare; this shim exists because wrangler
 * is not installable in this VM, so the middleware cannot be exercised
 * through `wrangler pages dev` here. The Playwright SSR test
 * (tests/e2e/test_ssr_branding.py) covers the same rewrite over real
 * HTTP via scripts/dev-server.mjs.
 */
"use strict";

const VOID = new Set(["meta", "link", "base", "br", "hr", "img", "input"]);

function parseAttrs(attrStr) {
  const attrs = new Map();
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(attrStr))) {
    attrs.set(m[1], m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

function escAttr(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function parseSelector(selector) {
  selector = selector.trim();
  if (selector.startsWith(".")) {
    return { tag: null, cls: selector.slice(1), attr: null };
  }
  const m = selector.match(/^([a-zA-Z][\w-]*)(?:\[([\w:-]+)="([^"]*)"\])?$/);
  if (!m) throw new Error("unsupported selector in test shim: " + selector);
  return {
    tag: m[1].toLowerCase(),
    cls: null,
    attr: m[2] ? { name: m[2], value: m[3] } : null,
  };
}

function matches(attrs, tag, sel) {
  if (sel.tag && sel.tag !== tag) return false;
  if (sel.cls) {
    const cls = (attrs.get("class") || "").split(/\s+/);
    if (!cls.includes(sel.cls)) return false;
  }
  if (sel.attr && attrs.get(sel.attr.name) !== sel.attr.value) return false;
  return true;
}

function serializeAttrs(attrs) {
  return [...attrs.entries()]
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join("");
}

function applyHandler(html, selector, handler) {
  const sel = parseSelector(selector);
  if (sel.tag && VOID.has(sel.tag)) {
    // Void elements: <meta ...> / <link ...> — element() only, no inner.
    const re = new RegExp(`<${sel.tag}\\b([^>]*)>`, "gi");
    return html.replace(re, (whole, attrStr) => {
      const attrs = parseAttrs(attrStr);
      if (!matches(attrs, sel.tag, sel)) return whole;
      const el = {
        tagName: sel.tag,
        getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
        setAttribute: (n, v) => attrs.set(n, v),
        removeAttribute: (n) => attrs.delete(n),
      };
      if (handler.element) handler.element(el);
      return `<${sel.tag}${serializeAttrs(attrs)}>`;
    });
  }
  // Container elements. Class-only selectors in our use are <p class="sub">.
  const tag = sel.tag || "p";
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi");
  return html.replace(re, (whole, attrStr, inner) => {
    const attrs = parseAttrs(attrStr);
    if (!matches(attrs, tag, sel)) return whole;
    let current = inner;
    const endTagCbs = [];
    const el = {
      tagName: tag,
      getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
      setAttribute: (n, v) => attrs.set(n, v),
      removeAttribute: (n) => attrs.delete(n),
      setInnerContent: (content) => {
        current = content;
      },
      onEndTag: (cb) => endTagCbs.push(cb),
      append: (content) => {
        current += content;
      },
    };
    if (handler.element) handler.element(el);
    if (handler.text) {
      const text = {
        get text() {
          return current;
        },
        remove() {
          current = "";
        },
        replace(v) {
          current = v;
        },
      };
      handler.text(text);
    }
    for (const cb of endTagCbs) {
      cb({
        before: (content) => {
          current += content;
        },
      });
    }
    return `<${tag}${serializeAttrs(attrs)}>${current}</${tag}>`;
  });
}

export class HTMLRewriter {
  constructor() {
    this.handlers = [];
  }
  on(selector, handler) {
    this.handlers.push([selector, handler]);
    return this;
  }
  async transform(response) {
    let html = await response.text();
    // Raw-text regions must never be parsed as elements: a literal tag
    // name inside a <style> block (e.g. `<footer>` in a CSS comment)
    // or an HTML comment is NOT an element, but the container regex
    // below would match it as the first `<footer` and eat everything
    // up to the real </footer> (found live 2026-11-26, issue #9: a
    // style comment ate the whole page body). The real HTMLRewriter
    // parses properly; this shim has to protect raw text itself.
    // <script> blocks are NOT protected: the middleware's JSON-LD
    // handler targets script[type="application/ld+json"] and must
    // still see it.
    const raws = [];
    html = html.replace(
      /<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi,
      (m) => {
        raws.push(m);
        return "\0RAW" + (raws.length - 1) + "\0";
      });
    for (const [selector, handler] of this.handlers) {
      html = applyHandler(html, selector, handler);
    }
    html = html.replace(/\0RAW(\d+)\0/g, (_, i) => raws[+i]);
    return new Response(html, {
      status: response.status,
      headers: response.headers,
    });
  }
}
