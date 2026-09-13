const SITE_ID = process.env.BLOBS_SITE_ID;
const TOKEN = process.env.BLOBS_TOKEN;
const BLOB_EMAILS = "https://api.netlify.com/api/v1/blobs/" + SITE_ID + "/premium/emails";
const BLOB_CANCELS = "https://api.netlify.com/api/v1/blobs/" + SITE_ID + "/premium/cancels";

async function blobGet(url) {
  const res = await fetch(url, { headers: { Authorization: "Bearer " + TOKEN } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error("read " + res.status);
  return JSON.parse(await res.text());
}
async function blobSet(url, list) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/octet-stream" },
    body: JSON.stringify(list)
  });
  if (!res.ok) throw new Error("write " + res.status);
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  let q;
  try { q = new URLSearchParams(event.rawUrl.split("?")[1] || ""); } catch (e) { q = new URLSearchParams(); }
  const key = q.get("key") || "";
  const email = (q.get("email") || "").toLowerCase().trim();

  // ADMIN: view cancellation requests -> then cancel them in your Square dashboard
  if (q.get("list") === "1") {
    if (key !== process.env.JOTFORM_SECRET) return { statusCode: 403, headers, body: JSON.stringify({ error: "forbidden" }) };
    try {
      const cancels = await blobGet(BLOB_CANCELS);
      return { statusCode: 200, headers, body: JSON.stringify({ cancellations: cancels }) };
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
  }

  // USER: cancel own subscription
  if (!email || !email.includes("@")) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid email" }) };
  }
  try {
    const emails = await blobGet(BLOB_EMAILS);
    const rec = emails.find(function (r) { return r.email === email; });
    if (rec) { rec.until = Date.now(); await blobSet(BLOB_EMAILS, emails); }
    const cancels = await blobGet(BLOB_CANCELS);
    cancels.push({ email: email, at: new Date().toISOString() });
    await blobSet(BLOB_CANCELS, cancels);
    return { statusCode: 200, headers, body: JSON.stringify({ cancelled: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
