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

  // rawRequest fallback (full submission JSON)
  if (!paymentStatus && body.get("rawRequest")) {
    try {
      const raw = JSON.parse(body.get("rawRequest"));
      paymentStatus = raw.paymentStatus || "";
    } catch (e) {}
  }

  // 3) Only paid submissions unlock premium
  if (paymentStatus !== "Completed") {
    return { statusCode: 200, body: "ignored: " + (paymentStatus || "none") };
  }
  if (!email || !email.includes("@")) {
    return { statusCode: 400, body: "bad email" };
  }

  // 4) Store paid email (31-day access from payment date)
  const store = getStore("premium");
  const emails = JSON.parse((await store.get("emails")) || "[]");
  if (!emails.find(e => e.email === email)) {
    emails.push({ email, until: Date.now() + 31 * 24 * 3600 * 1000 });
    await store.set("emails", JSON.stringify(emails));
  }
  return { statusCode: 200, body: "premium granted" };
};
