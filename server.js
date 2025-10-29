// Importa o framework Express
import express from 'express';

// Importa a sua funcao de logica de negocio
// (Note o .js no final, pode ser necessario dependendo da sua configuracao de "type": "module")
import { identificarEProcessar } from './models/routerEntity.js';

// Importa o pool de conexao do banco de dados
// (Note o .js no final)
import { pool } from './db/conecBD.js';

// Bloco auto-executavel para validar a conexao com o banco de dados
(async () => {
  try {
    // Tenta executar uma query simples para validar a conexao
    await pool.query("SELECT 1");
    console.log("Conexão com o banco de dados validada com sucesso!");
  } catch (err) {
    // Se a conexao falhar, exibe o erro e encerra a aplicacao
    console.error("Falha ao validar conexão com o banco:", err);
    process.exit(1); // Encerra o processo com codigo de erro
  }
})();

// Inicializa a aplicacao Express
const app = express();

// Define a porta. Usa a porta do ambiente (ex: Square Cloud) ou 3000 (como no seu exemplo)
const port = process.env.PORT || 3000;

// Middleware para "ensinar" o Express a entender JSON
// É bom manter, caso o Bitrix envie outros formatos
app.use(express.json());

// Middleware para "ensinar" o Express a entender 'application/x-www-form-urlencoded'
// Esta é a linha que resolve o 'undefined'.
// É o equivalente no Express ao 'querystring.parse()' do seu exemplo.
app.use(express.urlencoded({ extended: true }));

// Rota principal para o Webhook (POST no /)
// Modificado de '/webhook' para '/' para bater com o seu exemplo funcional
app.post('/', (req, res) => {
  
  // Gracas ao 'express.urlencoded', os dados chegam prontos em 'req.body'
  const data = req.body;
  
  // Log para voce ver os dados que chegaram
  console.log("POST recebido no / com os seguintes dados (req.body):", data);

  // Pega o evento de dentro dos dados (igual ao 'data.event' do seu exemplo)
  const evento = data.event;

  // Verifica se a propriedade 'event' existe nos dados recebidos
  if (evento) {
    // Se existir, chama sua funcao de processamento (igual ao seu exemplo)
    identificarEProcessar(evento, data);
    console.log("Evento identificado e enviado para processamento:", evento);
  } else {
    // Loga se o evento nao for encontrado
    console.log("Nenhum 'event' encontrado nos dados recebidos.");
  }

  // Responde ao Bitrix com status 200 (OK) para ele saber que recebemos
  // (Equivalente a 'res.writeHead(200)' e 'res.end("OK")')
  res.status(200).send('OK');
});

// Rota GET / para podermos testar se o servidor esta no ar pelo navegador
app.get('/', (req, res) => {
  res.send('Servidor esta no ar. Aguardando webhooks (POST) do Bitrix24.');
});

// Inicia o servidor e o faz escutar na porta definida
app.listen(port, () => {
  console.log(`Servidor iniciado. App.js rodando na porta ${port}`);
});