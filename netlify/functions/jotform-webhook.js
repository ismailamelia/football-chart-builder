const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };

  // 1) Secret check - strangers can't call this endpoint
  const url = new URL(event.rawUrl, "https://example.com");
  if (url.searchParams.get("key") !== process.env.JOTFORM_SECRET) {
    return { statusCode: 403, body: "forbidden" };
  }

  // 2) Parse Jotform webhook (form-urlencoded)
  const body = new URLSearchParams(event.body);
  const email = (body.get("email") || "").toLowerCase().trim();
  let paymentStatus = body.get("paymentStatus") || "";
  if (!paymentStatus && body.get("rawRequest")) {
    try {
      const raw = JSON.parse(body.get("rawRequest"));
      paymentStatus = raw.paymentStatus || "";
    } catch (e) {}
  }

  // 3) Only completed payments count (first payment AND monthly renewals)
  if (paymentStatus !== "Completed") {
    return { statusCode: 200, body: "ignored: " + (paymentStatus || "none") };
  }
  if (!email || !email.includes("@")) {
    return { statusCode: 400, body: "bad email" };
  }

  // 3b) Clear error if blob env vars are missing
  const missing = [];
  if (!process.env.BLOBS_SITE_ID) missing.push("BLOBS_SITE_ID");
  if (!process.env.BLOBS_TOKEN) missing.push("BLOBS_TOKEN");
  if (missing.length) {
    return { statusCode: 500, body: "Missing env vars: " + missing.join(" and ") + ". Add in Netlify, then redeploy." };
  }

  // 4) Add OR EXTEND access by 31 days from each successful charge
  const store = getStore("premium", { siteID: process.env.BLOBS_SITE_ID, token: process.env.BLOBS_TOKEN });
  const emails = JSON.parse((await store.get("emails")) || "[]");
  const until = Date.now() + 31 * 24 * 3600 * 1000;
  const existing = emails.find(function (e) { return e.email === email; });
  if (existing) { existing.until = until; } else { emails.push({ email: email, until: until }); }
  await store.set("emails", JSON.stringify(emails));
  return { statusCode: 200, body: "premium granted" };
};
