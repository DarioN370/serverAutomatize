// 1. Trazemos o Express para o projeto
import express from 'express';

// (NENHUM OUTRO IMPORT AQUI)

// 2. Inicializamos o Express
const app = express(); 


// 3. Pegamos a porta do ambiente (usando 3000, como no seu exemplo funcional)
const port = process.env.PORT || 3000;

// 4.  Middlewares para o Express entender os dados
// Isso "ensina" o nosso servidor a entender JSON.
app.use(express.json());
// Isso "ensina" o nosso servidor a entender 'urlencoded' (o formato do Bitrix)
app.use(express.urlencoded({ extended: true }));

// 5. Uma rota "GET" para a gente testar no navegador
app.get('/', (req, res) => {
  res.send('Meu servidor Bitrix está vivo!');
});

// 6.  A ROTA DO SEU WEBHOOK! 
// (Ouvindo na rota '/', como seus logs de sucesso mostraram)
app.post('/', (req, res) => {
  
  // Os dados do Bitrix chegam aqui, prontos para usar
  const data = req.body;
  
  console.log('--- NOVO WEBHOOK DO BITRIX! ---');
  console.log('Dados recebidos:', data); 
  
  // 7. AVISO IMPORTANTE (CORREÇÃO DA DUPLICIDADE)
  // Respondemos OK ao Bitrix IMEDIATAMENTE.
  // Isso evita que ele dê timeout e mande o webhook de novo.
  res.status(200).send('OK');
  console.log('Resposta 200/OK enviada ao Bitrix.');
  
  // 8. PROCESSAMENTO (FEITO DEPOIS DE RESPONDER)
  // Agora podemos fazer nossa lógica.
  
  const evento = data.event;

  if (evento) {
    console.log('Evento identificado:', evento);
    
    //
    // AQUI é onde você vai colocar sua lógica futura
    // (O que fazer com o evento ONCRMDEALUPDATE, etc.)
    // Como tudo está no server.js, a lógica fica aqui.
    //
    
  } else {
    console.log("Nenhum 'event' encontrado nos dados recebidos.");
  }
});

// 9. Ligamos o servidor!
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});