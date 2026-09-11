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
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };

  const url = new URL(event.rawUrl, "https://example.com");
  if (url.searchParams.get("key") !== process.env.JOTFORM_SECRET) {
    return { statusCode: 403, body: "forbidden" };
  }

  const missing = [];
  if (!SITE_ID) missing.push("BLOBS_SITE_ID");
  if (!TOKEN) missing.push("BLOBS_TOKEN");
  if (missing.length) return { statusCode: 500, body: "Missing env vars: " + missing.join(" and ") + ". Add in Netlify, then redeploy." };

  const body = new URLSearchParams(event.body);
  const email = (body.get("email") || "").toLowerCase().trim();
  let paymentStatus = body.get("paymentStatus") || "";
  if (!paymentStatus && body.get("rawRequest")) {
    try { paymentStatus = JSON.parse(body.get("rawRequest")).paymentStatus || ""; } catch (e) {}
  }

  if (paymentStatus !== "Completed") return { statusCode: 200, body: "ignored: " + (paymentStatus || "none") };
  if (!email || !email.includes("@")) return { statusCode: 400, body: "bad email" };

  try {
    const emails = await blobGet();
    const until = Date.now() + 31 * 24 * 3600 * 1000;
    const existing = emails.find(function (e) { return e.email === email; });
    if (existing) { existing.until = until; } else { emails.push({ email: email, until: until }); }
    await blobSet(emails);
    return { statusCode: 200, body: "premium granted" };
  } catch (e) { return { statusCode: 500, body: "error: " + e.message }; }
};
