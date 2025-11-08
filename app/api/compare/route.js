\
import { NextResponse } from "next/server";

const SITES = [
  { key: "1mg",       build: (q) => `https://www.1mg.com/search/all?name=${encodeURIComponent(q)}`, base: "https://www.1mg.com" },
  { key: "Netmeds",   build: (q) => `https://www.netmeds.com/catalogsearch/result/${encodeURIComponent(q).replace(/%20/g,'-')}/all`, base: "https://www.netmeds.com" },
  { key: "PharmEasy", build: (q) => `https://pharmeasy.in/search/all?name=${encodeURIComponent(q)}`, base: "https://pharmeasy.in" },
  { key: "Apollo Pharmacy", build: (q) => `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(q)}`, base: "https://www.apollopharmacy.in" },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function reader(url) {
  // Reader proxy to bypass JS/CORS; returns text content with HTML
  return "https://r.jina.ai/http://" + url.replace(/^https?:\/\//, "");
}

function clean(text) {
  return text.replace(/\s+/g, " ").trim();
}

function priceFromJsonLd(html) {
  // Pull prices from JSON-LD if present
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const s of scripts) {
    try {
      const json = JSON.parse(s[1]);
      const arr = Array.isArray(json) ? json : [json];
      for (const obj of arr) {
        const offers = obj?.offers;
        if (offers) {
          const list = Array.isArray(offers) ? offers : [offers];
          for (const o of list) {
            const p = parseFloat(String(o.price || o.lowPrice || o.highPrice).replace(/[^\d.]/g,""));
            if (isFinite(p)) return p;
          }
        }
        if (obj?.price) {
          const p = parseFloat(String(obj.price).replace(/[^\d.]/g,""));
          if (isFinite(p)) return p;
        }
      }
    } catch {}
  }
  return null;
}

function metaPrice(html) {
  const candidates = [];
  const metas = [...html.matchAll(/<meta[^>]+>/gi)].map(m=>m[0]);
  for (const tag of metas) {
    if (/price|amount|product:price/i.test(tag)) {
      const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
      if (content) {
        const p = parseFloat(content.replace(/[^\d.]/g,""));
        if (isFinite(p)) candidates.push(p);
      }
    }
  }
  return candidates.length ? Math.min(...candidates) : null;
}

function regexPrices(html) {
  // robust rupee matching
  const out = [];
  const t = html.replace(/\s+/g, " ");
  const re = /(?:₹|rs\.?\s*|mrp\s*:?\s*₹?)\s*([0-9]{2,6}(?:\.[0-9]{1,2})?)/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    const val = parseFloat(m[1]);
    if (isFinite(val)) out.push(val);
  }
  return out;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]{3,160})<\/title>/i);
  if (m) return clean(m[1]).slice(0,120);
  // fallback to first h1/h2
  const h = html.match(/<(h1|h2)[^>]*>([^<]{3,160})<\/\1>/i);
  if (h) return clean(h[2]).slice(0,120);
  return "Medicine";
}

// basic token similarity: Jaccard + Dice
function scoreName(query, name) {
  const toks = (s)=>clean(s.toLowerCase()).replace(/[^a-z0-9\s.%-]/g," ").split(/\s+/).filter(Boolean);
  const a = new Set(toks(query));
  const b = new Set(toks(name));
  const inter = new Set([...a].filter(x=>b.has(x)));
  const jaccard = inter.size / Math.max(1, new Set([...a, ...b]).size);
  const dice = (2*inter.size) / Math.max(1, (a.size + b.size));
  // weight dosage keywords to push accuracy
  let bonus = 0;
  for (const k of ["mg","mcg","%","tablet","tab","capsule","syrup","ointment","gel","injection","500","650","250","1000"]) {
    if (a.has(k) && b.has(k)) bonus += 0.02;
  }
  return Math.min(1, 0.6*jaccard + 0.4*dice + bonus);
}

async function fetchSite(site, q) {
  const url = site.build(q);
  const res = await fetch(reader(url), { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) return null;
  const html = await res.text();

  // Try structured data first
  let price = priceFromJsonLd(html) || metaPrice(html);

  // If still missing, use regex but pick a conservative min
  if (!price) {
    const prices = regexPrices(html).filter(p => p>1 && p<50000);
    if (prices.length) price = Math.min(...prices);
  }

  if (!price) return null;

  const name = extractTitle(html);
  const score = scoreName(q, name);

  // Require a minimal score to avoid false positives
  if (score < 0.25) return null;

  // canonical URL if available
  const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];
  let finalUrl = canon || url;
  if (finalUrl.startsWith("/")) finalUrl = site.base + finalUrl;

  return { pharmacy: site.key, medicine: name, price, url: finalUrl, score };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const q = (body?.medicine || "").trim();
    if (!q || q.length < 2) return NextResponse.json({ error: "Please enter a medicine name" }, { status: 400 });

    const results = [];
    for (const site of SITES) {
      try {
        const r = await fetchSite(site, q);
        if (r) results.push(r);
      } catch {}
    }
    results.sort((a,b)=>a.price-b.price || b.score-a.score);

    if (results.length === 0) {
      return NextResponse.json({ medicine: q, results: [], bestPrice: null, savings: null, savingsPercentage: null, count: 0 }, { status: 200 });
    }
    let savings = null, savingsPercentage = null;
    if (results.length > 1) {
      savings = results[results.length-1].price - results[0].price;
      savingsPercentage = results[results.length-1].price > 0 ? (savings / results[results.length-1].price) * 100 : 0;
    }
    return NextResponse.json({
      medicine: q,
      results,
      bestPrice: results[0].price,
      savings, savingsPercentage,
      count: results.length
    }, { status: 200 });

  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
