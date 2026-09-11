const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  let q = {};
  try { q = new URLSearchParams(event.rawUrl.split("?")[1] || ""); } catch (e) {}

  // DEBUG MODE: ?debug=1 shows env state without revealing secrets
  if (q.get("debug") === "1") {
    return { statusCode: 200, headers, body: JSON.stringify({
      site_id_set: !!process.env.BLOBS_SITE_ID,
      token_set: !!process.env.BLOBS_TOKEN,
      site_id_starts_with: (process.env.BLOBS_SITE_ID || "").slice(0, 8)
    })};
  }

  // Clear error if env vars are missing (instead of a cryptic crash)
  const missing = [];
  if (!process.env.BLOBS_SITE_ID) missing.push("BLOBS_SITE_ID");
  if (!process.env.BLOBS_TOKEN) missing.push("BLOBS_TOKEN");
  if (missing.length) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing env vars: " + missing.join(" and ") + ". Add them in Netlify Environment variables, then Trigger deploy." }) };
  }

  let email = (q.get("email") || "").toLowerCase().trim();
  if (!email && event.body) {
    try { email = (new URLSearchParams(event.body).get("email") || "").toLowerCase().trim(); } catch (e) {}
    try { if (!email) email = (JSON.parse(event.body).email || "").toLowerCase().trim(); } catch (e) {}
  }
  const key = q.get("key") || "";
  const store = getStore("premium", { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });

  // ADMIN GRANT: ?key=SECRET&add=1&email=...
  if (q.get("add") === "1") {
    if (key !== process.env.JOTFORM_SECRET) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "forbidden" }) };
    }
    if (!email || !email.includes("@")) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid email" }) };
    }
    const emails = JSON.parse((await store.get("emails")) || "[]");
    const until = Date.now() + 31 * 24 * 3600 * 1000;
    const existing = emails.find(function (e) { return e.email === email; });
    if (existing) { existing.until = until; } else { emails.push({ email: email, until: until }); }
    await store.set("emails", JSON.stringify(emails));
    return { statusCode: 200, headers, body: JSON.stringify({ granted: true, email: email, until: until }) };
  }

  // ADMIN REMOVE: ?key=SECRET&remove=1&email=...
  if (q.get("remove") === "1") {
    if (key !== process.env.JOTFORM_SECRET) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "forbidden" }) };
    }
    let emails = JSON.parse((await store.get("emails")) || "[]");
    const before = emails.length;
    emails = emails.filter(function (e) { return e.email !== email; });
    await store.set("emails", JSON.stringify(emails));
    return { statusCode: 200, headers, body: JSON.stringify({ removed: emails.length < before, email: email }) };
  }

  // NORMAL CHECK
  if (!email || !email.includes("@")) {
    return { statusCode: 400, headers, body: JSON.stringify({ premium: false, error: "invalid email" }) };
  }
  const emails = JSON.parse((await store.get("emails")) || "[]");
  const rec = emails.find(function (e) { return e.email === email; });
  if (rec && rec.until > Date.now()) {
    return { statusCode: 200, headers, body: JSON.stringify({ premium: true }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ premium: false }) };
};
