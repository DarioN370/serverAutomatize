const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware para parsear JSON
app.use(bodyParser.json());

// Variável para controlar duplicações (último evento recebido)
let ultimoEventoId = null;
let ultimaRequisicaoTimestamp = 0;

// Middleware opcional para evitar duplicadas enviadas rapidamente
app.use((req, res, next) => {
  const agora = Date.now();
  // Ignora requisições repetidas em menos de 1 segundo com o mesmo payload
  if (
    JSON.stringify(req.body) === ultimoEventoId &&
    agora - ultimaRequisicaoTimestamp < 1000
  ) {
    console.log("Requisição duplicada ignorada");
    return res.status(200).send("Duplicada ignorada");
  }

  ultimoEventoId = JSON.stringify(req.body);
  ultimaRequisicaoTimestamp = agora;
  next();
});

// Rota para receber o webhook
app.post("/webhook", (req, res) => {
  const evento = req.body;

  console.log("NOVO WEBHOOK DO BITRIX24!");
  console.log("Evento recebido:", {
    event: evento.event,
    handler: evento.handler,
    data: evento.data,
  });

  res.status(200).send("Recebido com sucesso");
});

// Teste básico para checar se o servidor está rodando
app.get("/", (req, res) => {
  res.send("Servidor ativo e recebendo webhooks!");
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});