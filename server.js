// // 1. Trazemos o Express para o projeto
// import express from 'express';

// // 2. Inicializamos o Express (criamos o nosso "carro")
// const app = express();

// // 3. Pegamos a porta do ambiente (como fizemos antes!)
// const port = process.env.PORT || 3333;

// // 4.  A LINHA MÁGICA! 
// // Isso "ensina" o nosso servidor a entender JSON automaticamente.
// // O Bitrix vai mandar JSON, e o Express já vai transformar em um objeto bonitinho.
// app.use(express.json()); // "Porteiro" que entende JSON
// app.use(express.urlencoded({ extended: true })); //(O { extended: true } é só uma configuração que permite ele entender dados mais complexos. É sempre bom usar).

// // 5. [OPCIONAL] Uma rota "GET" para a gente testar no navegador
// // Se você visitar o seu site (ex: http://localhost:3333/), ele vai responder isso.
// app.get('/', (req, res) => {
//   res.send('Meu servidor Bitrix está vivo! ');
// });

// // 6.  A ROTA DO SEU WEBHOOK! 
// // Aqui é onde a mágica do Bitrix acontece.
// // Estamos dizendo: "Quando o Bitrix mandar dados (via POST) para a rota /webhook..."
// app.post('/webhook', (req, res) => {
//   console.log('---  NOVO WEBHOOK DO BITRIX!  ---');
  
//   // "req.body" é o nosso presente! 
//   // Graças ao "app.use(express.json())", os dados já vêm prontos.
//   // É aqui que você vai ver os dados do ONCRMDEALADD, ONCRMDEALUPDATE, etc.
//   console.log(req.body); 
  
//   // 7. AVISO IMPORTANTE:
//   // Precisamos responder ao Bitrix para ele saber que deu tudo certo.
//   // Se não fizermos isso, o Bitrix vai achar que falhou e ficar tentando de novo.
//   res.status(200).send('OK');
// });

// // 8. Ligamos o servidor!
// app.listen(port, () => {
//   console.log(`Servidor rodando na porta ${port} `);
// });
// CODIGO PRA ESTUDAR V1 🔝

//Codigo funcionando V2
// 1. Trazemos o Express para o projeto
import express from 'express';

// <-- ADIÇÃO: Importa a sua funcao de logica de negocio
import { identificarEProcessar } from './models/routerEntity.js';

// <-- ADIÇÃO: Importa o pool de conexao do banco de dados
import { pool } from './db/conecBD.js';

// <-- ADIÇÃO: Bloco auto-executavel para validar a conexao com o banco
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("Conexão com o banco de dados validada com sucesso!");
  } catch (err) {
    console.error("Falha ao validar conexão com o banco:", err);
    process.exit(1);
  }
})();

// 2. Inicializamos o Express
const app = express();

// 3. Pegamos a porta do ambiente (Vou mudar para 3000, como no seu exemplo funcional)
const port = process.env.PORT || 3000; // <-- MUDANÇA (de 3333 para 3000)

// 4.  Middlewares para o Express entender os dados
// Isso "ensina" o nosso servidor a entender JSON.
app.use(express.json()); 
// Isso "ensina" o nosso servidor a entender "urlencoded" (o formato que o Bitrix usa)
app.use(express.urlencoded({ extended: true }));

// 5. Rota "GET" para a gente testar no navegador
app.get('/', (req, res) => {
  res.send('Meu servidor Bitrix está vivo!');
});

// 6.  A ROTA DO SEU WEBHOOK!
// <-- MUDANÇA: Alterado de '/webhook' para '/' para bater com seu exemplo funcional
app.post('/', (req, res) => {

  // "req.body" agora tem os dados, formatados pelo "express.urlencoded"
  const data = req.body;
  
  // Logamos os dados recebidos
  console.log('--- NOVO WEBHOOK DO BITRIX! (Dados recebidos): ---');
  console.log(data); 

  // 7. A CORREÇÃO DO SEU PROBLEMA (A INVERSÃO DA LÓGICA)
  // <-- MUDANÇA CRÍTICA: Respondemos OK ao Bitrix IMEDIATAMENTE.
  // Isso evita que o Bitrix pense que falhou (timeout) e envie o webhook de novo.
  res.status(200).send('OK');
  console.log("Resposta 200/OK enviada ao Bitrix para evitar timeout.");
  
  // 8. PROCESSAMENTO (FEITO DEPOIS DE RESPONDER)
  // <-- ADIÇÃO: Pegamos o evento e chamamos sua função de negócios
  // Agora podemos fazer a logica demorada (banco de dados)
  // sem nos preocuparmos com o timeout do Bitrix.
  const evento = data.event;
  
  if (evento) {
    console.log("Iniciando processamento do evento:", evento);
    identificarEProcessar(evento, data);
  } else {
    console.log("Nenhum 'event' encontrado nos dados recebidos.");
  }

});

// 9. Ligamos o servidor! (Era 8 no seu código)
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});