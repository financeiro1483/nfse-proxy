import https from "node:https";
import http from "node:http";

const URLS = {
  homologacao: "https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse",
  producao: "https://sefin.nfse.gov.br/SefinNacional/nfse",
};

const TOKEN = process.env.PROXY_TOKEN || "";
const PFX_BASE64 = process.env.PFX_BASE64 || "";
const PASS = process.env.PFX_PASSPHRASE || "";
const PORT = process.env.PORT || 8080;

if (!TOKEN || !PFX_BASE64 || !PASS) {
  console.error("Defina PROXY_TOKEN, PFX_BASE64 e PFX_PASSPHRASE.");
  process.exit(1);
}

const pfxBuffer = Buffer.from(PFX_BASE64, "base64");

function enviarSefin(ambiente, dpsXmlGZipB64) {
  return new Promise((resolve, reject) => {
    const url = URLS[ambiente] || URLS.homologacao;
    const body = JSON.stringify({ dpsXmlGZipB64 });
    const agent = new https.Agent({ pfx: pfxBuffer, passphrase: PASS, rejectUnauthorized: true });
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "FenixNFSe-Proxy/1.0", "Content-Length": Buffer.byteLength(body) },
      agent,
    }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", reject); req.write(body); req.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/nfse") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ erro: "Use POST /nfse" }));
  }
  if (req.headers["x-proxy-token"] !== TOKEN) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ erro: "Token inválido" }));
  }
  let raw = ""; for await (const chunk of req) raw += chunk;
  let payload; try { payload = JSON.parse(raw); } catch (_) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ erro: "JSON inválido" }));
  }
  try {
    const r = await enviarSefin(payload.ambiente, payload.dpsXmlGZipB64);
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(r.body);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ erro: e.message }));
  }
});

server.listen(PORT, () => console.log(`Proxy NFS-e mTLS rodando na porta ${PORT}`));
