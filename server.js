import express from "express";

const app = express();
const PORT = process.env.PORT || 80;

// Aceita JSON e x-www-form-urlencoded (Bitrix24 usa urlencoded por padrão)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Controle de duplicadas
const seen = new Map();
const WINDOW_MS = 2000;

function isDuplicate(payload) {
  const key = JSON.stringify(payload  || {});
  const now = Date.now();
  const prev = seen.get(key);
  seen.set(key, now);

  // limpeza de chaves antigas
  for (const [k, t] of seen) {
    if (now - t > WINDOW_MS * 5) seen.delete(k);
  }

  return prev && now - prev < WINDOWMS;
}

app.post("/webhook", (req, res) => {
  const payload = req.body && Object.keys(req.body).length ? req.body : {};

  if (isDuplicate(payload)) {
    console.log("Requisição duplicada ignorada");
    return res.status(200).end();
  }

  const event = payload.event ?? null;
  const handler = payload.handler ?? null;

  console.log("NOVO WEBHOOK DO BITRIX24!", {
    event,
    handler,
    contentType: req.headers["content-type"],
    keys: Object.keys(payload)
  });

  return res.status(200).send("ok");
});

app.get("/", (_, res) => res.status(200).send("up"));
app.all("*", (_, res) => res.status(200).send("ok"));

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});