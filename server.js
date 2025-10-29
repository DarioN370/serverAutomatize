// 1. Trazemos o Express para o projeto
import express from 'express';

// <-- ALTERAÇÃO AQUI: Importamos suas lógicas de negócio e banco
// POR FAVOR, VERIFIQUE SE O NOME DAS PASTAS E ARQUIVOS ESTÁ IDÊNTICO (MAIÚSCULA/MINÚSCULA)
// O erro 'ERR_MODULE_NOT_FOUND' é 99% de certeza por causa disso.
// Ex: Se a pasta for 'Models', o import tem que ser './Models/routerEntity.js'
import { identificarEProcessar } from './models/routerEntity.js';
import { pool } from './db/conecBD.js';

// <-- ALTERAÇÃO AQUI: Adicionamos a validação do banco de dados
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("Conexão com o banco de dados validada com sucesso!");
  } catch (err) {
    console.error("Falha ao validar conexão com o banco:", err);
    process.exit(1); // Encerra o app se o banco falhar
  }
})();

// 2. Inicializamos o Express
const app = express();

// 3. Pegamos a porta do ambiente (como fizemos antes!)
// (Mantive a 3333 que você colou, mas 3000 também funcionaria)
const port = process.env.PORT || 3333;

// 4. Middlewares para o Express entender os dados
// Isso "ensina" o nosso servidor a entender JSON.
app.use(express.json());
// Isso "ensina" o nosso servidor a entender 'urlencoded' (o formato do Bitrix)
app.use(express.urlencoded({ extended: true }));

// 5. Uma rota "GET" para a gente testar no navegador
app.get('/', (req, res) => {
  res.send('Meu servidor Bitrix está vivo!');
});

// 6. A ROTA DO SEU WEBHOOK! 
// <-- ALTERAÇÃO AQUI: Mudamos de '/webhook' para '/'
// Seus logs de sucesso (image_f6f404.jpg) mostraram que o Bitrix chama a rota raiz '/'
app.post('/', (req, res) => {
  
  // Os dados do Bitrix já chegam prontos no 'req.body'
  const data = req.body;
  
  console.log('--- NOVO WEBHOOK DO BITRIX! ---');
  console.log('Dados recebidos:', data); 
  
  // 7. AVISO IMPORTANTE (CORREÇÃO DA DUPLICIDADE)
  // <-- ALTERAÇÃO AQUI: Respondemos OK ao Bitrix IMEDIATAMENTE.
  // Isso evita que ele dê timeout e mande o webhook de novo.
  res.status(200).send('OK');
  console.log('Resposta 200/OK enviada ao Bitrix.');
  
  // 8. PROCESSAMENTO (DEPOIS DE RESPONDER)
  // <-- ALTERAÇÃO AQUI: Adicionamos a lógica de processamento
  // Agora podemos fazer o trabalho pesado (falar com o banco)
  // sem nos preocuparmos com o timeout do Bitrix.
  
  const evento = data.event;

  if (evento) {
    console.log('Iniciando processamento do evento:', evento);
    // Chamamos sua função que fala com o banco
    identificarEProcessar(evento, data);
  } else {
    console.log("Nenhum 'event' encontrado nos dados recebidos.");
  }
});

// 9. Ligamos o servidor! (Era 8 no seu código)
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});