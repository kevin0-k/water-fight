import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const port = 4173;
const root = process.cwd();
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

http
  .createServer(async (req, res) => {
    try {
      const requestPath = req.url === "/" ? "index.html" : decodeURIComponent(req.url.slice(1));
      const filePath = normalize(join(root, requestPath));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": types[extname(filePath)] || "text/plain; charset=utf-8" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Preview running at http://localhost:${port}`);
  });
