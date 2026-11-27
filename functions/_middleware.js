// Cloudflare Pages Function middleware — server-side brand injection.
//
// WHY: per-subdomain branding used to be applied by web/branding.js at
// load time, so the static HTML always said "wayback-social" (later the
// apex brand) and a no-JS crawler saw the wrong title/meta on every
// subdomain. This middleware rewrites the SERVED HTML with
// HTMLRewriter, per request hostname, before it reaches the visitor:
// <title>, meta description, og:title / og:description / og:site_name,
// twitter:title / twitter:description, JSON-LD name + description, and
// on the search page also the h1 wordmark, .sub tagline and footer.
// Canonical + og:url are only rewritten on production hosts
// (deletedproof.northforgelabs.dev), exactly like branding.js does client-side.
//
// Brand data comes from functions/_lib/brands.js, generated from
// web/brands.json (scripts/sync_brands.py) — the same file that
// generates web/branding.js, so client and server can never drift.
// Unknown hosts, localhost and *.pages.dev fall back to the apex
// ArchiveCheck brand (getBrand). Non-HTML responses, non-GET requests,
// non-200 responses and any path other than / /index.html
// /dashboard.html pass through untouched.
//
// The static files carry the apex brand as their fallback, so the page
// is correctly branded even where this middleware does not run
// (localhost dev servers, file://). web/branding.js remains as the
// client-side fallback for the accent colour, default preset and
// body[data-brand] — the middleware does not touch those.
import { getBrand } from "./_lib/brands.js";

const HTML_PATHS = new Set(["/", "/index.html", "/dashboard.html"]);

/** element(el) { el.setAttribute(name, value); } — meta/link tags. */
class SetAttr {
  constructor(name, value) {
    this.name = name;
    this.value = value;
  }
  element(el) {
    el.setAttribute(this.name, this.value);
  }
}

/** element(el) { el.setInnerContent(value); } — title / h1 / .sub / footer.
 *  `html: true` only for the h1 wordmark (it contains a <span>). */
class SetText {
  constructor(value, html = false) {
    this.value = value;
    this.html = html;
  }
  element(el) {
    el.setInnerContent(this.value, { html: this.html });
  }
}

/** JSON-LD: read the existing script text, keep every field it has
 *  (offers, applicationCategory, ...), replace name + description
 *  with the brand's, and write it back before the end tag. If the
 *  existing JSON will not parse, the script is left untouched. */
class JsonLd {
  constructor(brand) {
    this.brand = brand;
    this.json = "";
  }
  element(el) {
    el.onEndTag((tag) => {
      let data = null;
      try {
        data = JSON.parse(this.json);
      } catch (e) {
        return; // unparsable — leave the script alone
      }
      if (!data || typeof data !== "object") return;
      data.name = this.brand.jsonLdName;
      data.description = this.brand.metaDescription;
      tag.before(JSON.stringify(data), { html: true });
    });
  }
  text(t) {
    this.json += t.text;
    t.remove();
  }
}

function isProductionHost(hostname) {
  return (
    hostname === "deletedproof.northforgelabs.dev" ||
    hostname.endsWith(".deletedproof.northforgelabs.dev")
  );
}

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  if (context.request.method !== "GET") return response;
  if (response.status !== 200) return response;
  if (!HTML_PATHS.has(url.pathname)) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const brand = getBrand(url.hostname);
  const isIndex = url.pathname === "/" || url.pathname === "/index.html";
  // Dashboard keeps its own title ("Dashboard — <Brand>") and its own
  // page copy; only the index page gets the wordmark/tagline/footer.
  const title = isIndex ? brand.seoTitle : brand.dashboardTitle;

  const rewriter = new HTMLRewriter()
    .on("title", new SetText(title))
    .on('meta[name="description"]', new SetAttr("content", brand.metaDescription))
    .on('meta[property="og:title"]', new SetAttr("content", brand.seoTitle))
    .on('meta[property="og:description"]', new SetAttr("content", brand.metaDescription))
    .on('meta[property="og:site_name"]', new SetAttr("content", brand.name))
    .on('meta[name="twitter:title"]', new SetAttr("content", brand.seoTitle))
    .on('meta[name="twitter:description"]', new SetAttr("content", brand.metaDescription))
    .on('script[type="application/ld+json"]', new JsonLd(brand));
  if (isProductionHost(url.hostname)) {
    rewriter
      .on('link[rel="canonical"]', new SetAttr("href", brand.canonical))
      .on('meta[property="og:url"]', new SetAttr("content", brand.canonical));
  }
  if (isIndex) {
    rewriter
      .on("h1", new SetText(brand.wordmarkHtml, true))
      .on(".sub", new SetText(brand.tagline))
      .on("footer", new SetText(brand.footer));
  }
  return rewriter.transform(response);
}
