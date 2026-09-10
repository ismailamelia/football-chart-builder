const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  let email = "";
  try {
    email = new URLSearchParams(event.rawUrl.split("?")[1] || "").get("email") || "";
  } catch (e) {}
  if (!email && event.body) {
    try { email = new URLSearchParams(event.body).get("email") || ""; } catch (e) {}
    try { if (!email) email = JSON.parse(event.body).email || ""; } catch (e) {}
  }
  email = (email || "").toLowerCase().trim();
  if (!email.includes("@")) {
    return { statusCode: 400, headers, body: JSON.stringify({ premium: false, error: "invalid email" }) };
  }
  const store = getStore("premium");
  const emails = JSON.parse((await store.get("emails")) || "[]");
  const rec = emails.find(function (e) { return e.email === email; });
  if (rec && rec.until > Date.now()) {
    return { statusCode: 200, headers, body: JSON.stringify({ premium: true }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ premium: false }) };
};
