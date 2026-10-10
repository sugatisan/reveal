// Expo's default Metro config, plus one addition: requests to /api/* on the app's own address
// are passed through to the Reveal server (port 5177). The web app then talks to a single address,
// which some embedded browsers require (they block calls to a second localhost port).
const { getDefaultConfig } = require("expo/metro-config");
const http = require("http");

const config = getDefaultConfig(__dirname);
const API_PORT = Number(process.env.REVEAL_API_PORT || 5177);
const original = config.server?.enhanceMiddleware; // keep Expo's own middleware chain

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = original ? original(middleware, server) : middleware;
    return (req, res, next) => {
      if (!req.url || !req.url.startsWith("/api/")) return base(req, res, next);
      const upstream = http.request(
        { host: "127.0.0.1", port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${API_PORT}` } },
        (r) => { res.writeHead(r.statusCode || 502, r.headers); r.pipe(res); }
      );
      upstream.on("error", () => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: `Can't reach the Reveal server on port ${API_PORT}. Is "npm run dev" running?` }));
      });
      req.pipe(upstream);
    };
  },
};

module.exports = config;
