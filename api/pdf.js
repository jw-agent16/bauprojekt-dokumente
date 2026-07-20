const config = require("./drive-config");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const rawId = req.query && req.query.id;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "id fehlt" }));
    return;
  }

  if (!config.scriptUrl) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        error: "Drive-API noch nicht eingerichtet.",
      })
    );
    return;
  }

  try {
    const url = new URL(config.scriptUrl);
    url.searchParams.set("token", config.apiToken);
    url.searchParams.set("action", "pdf");
    url.searchParams.set("id", id);

    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "application/json" },
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: false,
          error: "Ungültige Antwort von Apps Script",
          detail: text.slice(0, 300),
        })
      );
      return;
    }

    if (!data || !data.ok || !data.base64) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: false,
          error: (data && data.error) || "PDF nicht geladen",
        })
      );
      return;
    }

    const buffer = Buffer.from(data.base64, "base64");
    const safeName = String(data.name || "dokument.pdf").replace(
      /[^\w.\- äöüÄÖÜß]+/g,
      "_"
    );

    res.statusCode = 200;
    res.setHeader("Content-Type", data.mimeType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${safeName}"`
    );
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
};
