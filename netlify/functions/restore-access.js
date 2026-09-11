const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN = process.env.BLOBS_TOKEN;
const BLOB_URL = "https://api.netlify.com/api/v1/blobs/" + SITE_ID + "/premium/emails";

async function blobGet() {
  const res = await fetch(BLOB_URL, { headers: { Authorization: "Bearer " + TOKEN } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("blob read failed, HTTP " + res.status);
  return JSON.parse(await res.text());
}
async function blobSet(list) {
  const res = await fetch(BLOB_URL, {
    method: "PUT",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/octet-stream" },
    body: JSON.stringify(list)
  });
  if (!res.ok) throw new Error("blob write failed, HTTP " + res.status);
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  let q = {};
  try { q = new URLSearchParams(event.rawUrl.split("?")[1] || ""); } catch (e) {}

  // DEBUG: ?debug=1 - reports env state AND tests real blob connectivity
  if (q.get("debug") === "1") {
    let blobTest = "not tested";
    if (SITE_ID && TOKEN) {
      try { await blobGet(); blobTest = "ok"; } catch (e) { blobTest = String(e.message); }
    }
    return { statusCode: 200, headers, body: JSON.stringify({
      site_id_set: !!SITE_ID,
      token_set: !!TOKEN,
      blob_connection: blobTest
    })};
  }

  const missing = [];
  if (!SITE_ID) missing.push("BLOBS_SITE_ID");
  if (!TOKEN) missing.push("BLOBS_TOKEN");
  if (missing.length) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing env vars: " + missing.join(" and ") + ". Add them in Netlify Environment variables, then Trigger deploy." }) };
  }

  let email = (q.get("email") || "").toLowerCase().trim();
  if (!email && event.body) {
    try { email = (new URLSearchParams(event.body).get("email") || "").toLowerCase().trim(); } catch (e) {}
    try { if (!email) email = (JSON.parse(event.body).email || "").toLowerCase().trim(); } catch (e) {}
  }
  const key = q.get("key") || "";

  // ADMIN GRANT: ?key=SECRET&add=1&email=...
  if (q.get("add") === "1") {
    if (key !== process.env.JOTFORM_SECRET) return { statusCode: 403, headers, body: JSON.stringify({ error: "forbidden" }) };
    if (!email || !email.includes("@")) return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid email" }) };
    try {
      const emails = await blobGet();
      const until = Date.now() + 31 * 24 * 3600 * 1000;
      const existing = emails.find(function (e) { return e.email === email; });
      if (existing) { existing.until = until; } else { emails.push({ email: email, until: until }); }
      await blobSet(emails);
      return { statusCode: 200, headers, body: JSON.stringify({ granted: true, email: email, until: until }) };
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message) }) }; }
  }

  // ADMIN REMOVE: ?key=SECRET&remove=1&email=...
  if (q.get("remove") === "1") {
    if (key !== process.env.JOTFORM_SECRET) return { statusCode: 403, headers, body: JSON.stringify({ error: "forbidden" }) };
    try {
      let emails = await blobGet();
      const before = emails.length;
      emails = emails.filter(function (e) { return e.email !== email; });
      await blobSet(emails);
      return { statusCode: 200, headers, body: JSON.stringify({ removed: emails.length < before, email: email }) };
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message) }) }; }
  }

  // NORMAL CHECK
  if (!email || !email.includes("@")) return { statusCode: 400, headers, body: JSON.stringify({ premium: false, error: "invalid email" }) };
  try {
    const emails = await blobGet();
    const rec = emails.find(function (e) { return e.email === email; });
    if (rec && rec.until > Date.now()) return { statusCode: 200, headers, body: JSON.stringify({ premium: true }) };
    return { statusCode: 200, headers, body: JSON.stringify({ premium: false }) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: String(e.message) }) }; }
};
