// 1. Trazemos o Express para o projeto
import express from 'express';

// IMPORTANDO O DOTENV
import 'dotenv/config';
import express from 'express';

// 2. Inicializamos o Express
const app = express();

// 3. Pegamos a porta do ambiente (usando 3000)
const port = process.env.PORT || 3000;

// 4.  Middlewares para o Express entender os dados
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // <-- Super importante pro Bitrix!

// 5. Uma rota "GET" para a gente testar no navegador
app.get('/', (req, res) => {
  res.send('Meu servidor Bitrix está vivo!');
});

// 6.  A ROTA DO SEU WEBHOOK! 
// (async é importante para o fetch!)
app.post('/', async (req, res) => {
  
  // Os dados do Webhook de SAÍDA chegam aqui
  const data = req.body;
  
  console.log('--- 1. NOVO WEBHOOK DO BITRIX! (Saída) ---');
  console.log('Dados recebidos:', data); 
  
  // 7. AVISO IMPORTANTE (CORREÇÃO DA DUPLICIDADE)
  // Respondemos OK ao Bitrix IMEDIATAMENTE.
  res.status(200).send('OK');
  console.log('--- 2. Resposta 200/OK enviada ao Bitrix. ---');
  
  // 8. PROCESSAMENTO (FEITO DEPOIS DE RESPONDER)
  const evento = data.event;

  if (evento) {
    console.log('--- 3. Evento identificado:', evento, '---');
    
    // --- INÍCIO DA DEMANDA (EXIBIR OS DADOS DO CARD CORRESPONDENTE AO ID!)  ---
    
    try {
      // 1. Pegamos o ID do Deal que foi modificado
      // <--  AQUI ESTÁ A CORREÇÃO 
      const dealId = data.data.FIELDS.ID; 

      if (!dealId) {
        // (Mudei a mensagem de erro pra ficar mais clara!)
        console.log("Erro: Não consegui encontrar o ID em 'data.data.FIELDS.ID'.");
        return; // Para a execução se não tiver ID
      }

      console.log(`--- 4. ID do Deal extraído: ${dealId}. Buscando detalhes... ---`);

      // 2. Construímos a URL do Webhook de ENTRADA, POREM, usando o .env para proteger nossa chave API
      const baseUrl = process.env.BITRIX_WEBHOOK_URL;
      const inputWebhookUrl = `${baseUrl}/crm.deal.get?id=${dealId}`;

      // 3. Usamos o 'fetch' (embutido no Node) para buscar os dados
      const fetchResponse = await fetch(inputWebhookUrl);

      // 4. Verificamos se a busca deu certo
      if (!fetchResponse.ok) {
        console.log(`Erro ao buscar detalhes. Bitrix respondeu com status: ${fetchResponse.status}`);
        return;
      }

      // 5. Transformamos a resposta em JSON
      const dealDetails = await fetchResponse.json();

      // 6. EXIBIMOS NO CONSOLE (O SEU OBJETIVO!)
      console.log('--- 5.  DETALHES DO DEAL OBTIDOS! ---');
      console.log(JSON.stringify(dealDetails, null, 2)); // (Bonitinho igual seu print!)

    } catch (error) {
      console.log("Erro GIGANTE ao tentar fazer o 'fetch' para o Bitrix:", error);
    }
    
    // ---  FIM DA SUA NOVA DEMANDA  ---

  } else {
    console.log("Nenhum 'event' encontrado nos dados recebidos.");
  }
});

// 9. Ligamos o servidor!
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});