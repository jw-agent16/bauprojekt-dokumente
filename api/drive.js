const config = require("./drive-config");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!config.scriptUrl) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        error:
          "Drive-API noch nicht eingerichtet. Apps Script als Web-App deployen und scriptUrl in api/drive-config.js setzen.",
      })
    );
    return;
  }

  try {
    const url = new URL(config.scriptUrl);
    url.searchParams.set("token", config.apiToken);

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

    res.statusCode = data && data.ok ? 200 : 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
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
