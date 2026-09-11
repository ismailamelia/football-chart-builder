const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  let q = {};
  try { q = new URLSearchParams(event.rawUrl.split("?")[1] || ""); } catch (e) {}
  let email = (q.get("email") || "").toLowerCase().trim();
  if (!email && event.body) {
    try { email = (new URLSearchParams(event.body).get("email") || "").toLowerCase().trim(); } catch (e) {}
    try { if (!email) email = (JSON.parse(event.body).email || "").toLowerCase().trim(); } catch (e) {}
  }
  const key = q.get("key") || "";
  const store = getStore("premium", { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });

  // --- ADMIN GRANT: ?key=SECRET&add=1&email=... (adds or extends 31 days) ---
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

  // --- ADMIN REMOVE (cancel): ?key=SECRET&remove=1&email=... ---
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

  // --- NORMAL CHECK ---
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
