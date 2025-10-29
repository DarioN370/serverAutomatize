// 1. Trazemos o Express para o projeto
import express from 'express';

// 2. Inicializamos o Express (criamos o nosso "carro")
const app = express();

// 3. Pegamos a porta do ambiente (como fizemos antes!)
const port = process.env.PORT || 3333;

// 4.  A LINHA MÁGICA! 
// Isso "ensina" o nosso servidor a entender JSON automaticamente.
// O Bitrix vai mandar JSON, e o Express já vai transformar em um objeto bonitinho.
app.use(express.json()); // "Porteiro" que entende JSON
app.use(express.urlencoded({ extended: true })); //(O { extended: true } é só uma configuração que permite ele entender dados mais complexos. É sempre bom usar).

// 5. [OPCIONAL] Uma rota "GET" para a gente testar no navegador
// Se você visitar o seu site (ex: http://localhost:3333/), ele vai responder isso.
app.get('/', (req, res) => {
  res.send('Meu servidor Bitrix está vivo! ');
});

// 6.  A ROTA DO SEU WEBHOOK! 
// Aqui é onde a mágica do Bitrix acontece.
// Estamos dizendo: "Quando o Bitrix mandar dados (via POST) para a rota /webhook..."
app.post('/webhook', (req, res) => {
  console.log('---  NOVO WEBHOOK DO BITRIX!  ---');
  
  // "req.body" é o nosso presente! 
  // Graças ao "app.use(express.json())", os dados já vêm prontos.
  // É aqui que você vai ver os dados do ONCRMDEALADD, ONCRMDEALUPDATE, etc.
  console.log(req.body); 
  
  // 7. AVISO IMPORTANTE:
  // Precisamos responder ao Bitrix para ele saber que deu tudo certo.
  // Se não fizermos isso, o Bitrix vai achar que falhou e ficar tentando de novo.
  res.status(200).send('OK');
});

// 8. Ligamos o servidor!
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port} `);
});