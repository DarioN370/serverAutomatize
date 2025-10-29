import express from 'express';

const app = express(); 


const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Meu servidor Bitrix está vivo!');
});

app.post('/', (req, res) => {
  
  const data = req.body;
  
  console.log('--- NOVO WEBHOOK DO BITRIX! ---');
  console.log('Dados recebidos:', data); 
  
  res.status(200).send('OK');
  console.log('Resposta 200/OK enviada ao Bitrix.');
  
  
  const evento = data.event;

  if (evento) {
    console.log('Evento identificado:', evento);
    
  } else {
    console.log("Nenhum 'event' encontrado nos dados recebidos.");
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});