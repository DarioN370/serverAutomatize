// IMPORTANDO O DOTENV
import 'dotenv/config';
import express from 'express';

// 1. Importamos o "tradutor" (driver) do PostgreSQL
import pg from 'pg';
// 2. Importamos o "Buffer" para decodificar o Base64
import { Buffer } from 'node:buffer'; //As chaves do banco (certificados SSL) vêm num formato de texto (Base64) que o "tradutor" pg não entende. O Buffer é a ferramenta que pega esse texto Base64 e o transforma de volta no "certificado" original que o pg consegue ler

// 2. Inicializamos o Express
//RESUMO - faz o trabalho de forma 1000x mais fácil
const app = express();

// 3. Pegamos a porta do ambiente (usando 3000)
const port = process.env.PORT || 3000;




// --- (Início) BLOCO DE CONEXÃO COM O BANCO DE DADOS (base64)---
const { Pool } = pg; //Importa a lib pg, , o nosso node , ou no caso o java script, não sabe falar a lingua do postgreSQL, então a gente importa um "interpretador" que faz essa comunicação

// "Decodificamos" as "tripas" das chaves Base64 que a Square Cloud nos dá
// A gente lê a variável (ex: PG_CA_CERT_BASE64) e transforma de volta no texto do certificado
// process.env.PG_CA_CERT_BASE64: Lê a sua variável de ambiente (aquela string gigante que você copiou do painel da Square Cloud).
//Buffer.from(..., 'base64'): Usa o "decodificador" para entender essa string como Base64.
//.toString('utf-8'): Converte o resultado de volta para um texto normal (o certificado).
const caCert = Buffer.from(process.env.PG_CA_CERT_BASE64, 'base64').toString('utf-8');
const clientKey = Buffer.from(process.env.PG_CLIENT_KEY_BASE64, 'base64').toString('utf-8');
const clientCert = Buffer.from(process.env.PG_CLIENT_CERT_BASE64, 'base64').toString('utf-8');

// Criamos nosso gerenciador de conexões e damos o endereço do banco de dados
const pool = new Pool({
  // O "tradutor pg" ainda lê a DATABASE_URL
  connectionString: process.env.DATABASE_URL, //aqui ele diz ao pool as informações basicas, User, senha, host, porta, nome do banco etc...
  
  // Agora passamos os certificados DECODIFICADOS!
  ssl: { //Aqui avisamos ao pool que a conexão é super segura e usa o SSL
    rejectUnauthorized: true, // trava de segurança. Diz: "Se o certificado do servidor não for 100% válido e confiável, recuse a conexão.
    ca: caCert, //Aqui está o certificado da 'Autoridade' (CA). Use isso para verificar se o servidor que estamos conectando é quem diz ser.
    key: clientKey, //Aqui está a minha chave privada ("Meu segredo")
    cert: clientCert // Aqui está o meu certificado público ("meu RG").

    //Juntando key e cert, você prova para o servidor quem você é. Juntando o ca, você garante que o servidor é quem ele diz ser. É uma trava de segurança dos dois lados!
  }
});

// (O nosso código de teste de "ping"!)
(async () => {
  try {
    // Tenta "pingar" o banco para ver se a conexão deu certo
    await pool.query('SELECT 1');
    console.log('--- ✅ CONEXÃO COM O BANCO POSTGRESQL BEM-SUCEDIDA! ---');
    } catch (err) {
    console.log('--- ❌ ERRO AO CONECTAR COM O BANCO: ---', err);
  }
  //EXPLICAÇÃO DO BLOCO
  //try { ... }: Ele "tenta" (try) fazer uma coisa.

  //await pool.query('SELECT 1');: Ele pede ao "Gerente" (pool) uma conexão emprestada e manda o comando mais simples possível para o banco: SELECT 1 (Basicamente: "Banco, me responda com o número 1?").

  //Se o banco responder, ele imprime o ✅ SUCESSO!.

  //Se o banco der erro (senha errada, certificado errado, etc.), ele pula pro catch { ... } e imprime o ERRO!

})();
// --- (Fim) BLOCO DE CONEXÃO COM O BANCO DE DADOS ---



// 4.  Middlewares para o Express entender os dados
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // <-- Super importante pro Bitrix!, por que ? resumindo o bitrix envia os dados no formato x-www-form-urlencoded. É um formato de texto que parece uma bagunça (tipo data[FIELDS][ID]=97&event=ONCRMDEALUPDATE&...), então essa linha que pega essa "bagunça" e a transforma magicamente naquele objeto JavaScript limpinho que a gente usa e aparece no terminal

// 5. Uma rota "GET" para a gente testar no navegador, e verifica se o servidor esta online, se estiver, ele fala
//GET = Uma requisição "GET" é o que o seu navegador (Chrome, Edge) faz toda vez que você digita um endereço e aperta Enter. É um pedido para "ME DÊ" (GET) a página.
app.get('/', (req, res) => {
  res.send('Meu servidor Bitrix está vivo!');// aqui usamos o objeto res(resposta) que o express nos deu, e usa a funcao .send()(Enviar) dele, e colocamos o texto que ele vai enviar
}); 
//(req, res) => { ... }: Essa é a "função de callback", o "O que fazer?". O Express promete: "Quando alguém visitar o /, eu vou executar exatamente o código que estiver dentro dessas chaves {}".
// req (Request / Requisição): É um objeto que tem todas as informações sobre quem está visitando (de onde ela veio, qual o IP, etc.). A gente não usou ele aqui.
// res (Response / Resposta): É um objeto que tem todas as ferramentas para a gente responder a essa visita. É o mais importante!

// 6.  A ROTA DO SEU WEBHOOK! (VERSÃO ATUALIZADA COM DELETE!)
app.post('/', async (req, res) => { 
  
  // Os dados do Webhook de SAÍDA chegam aqui
  const data = req.body; 
  console.log('--- 1. NOVO WEBHOOK DO BITRIX! (Saída) ---');
  console.log('Dados recebidos:', data); 
  
  // 7. AVISO IMPORTANTE (CORREÇÃO DA DUPLICIDADE)
  res.status(200).send('OK'); // Respondemos OK ao Bitrix IMEDIATAMENTE.
  console.log('--- 2. Resposta 200/OK enviada ao Bitrix. ---');
  
  // 8. PROCESSAMENTO (FEITO DEPOIS DE RESPONDER)
  
  // Pegamos o evento e o ID logo de cara, pois precisamos deles para o "roteamento"
  const evento = data.event; 
  const dealId = data.data?.FIELDS?.ID; // Usando optional chaining (?.), é mais seguro!

  // Se não tiver evento OU ID, não podemos fazer nada.
  if (!evento || !dealId) { 
    console.log("--- 3. Evento ou ID não encontrado nos dados. Ignorando. ---");
    return; // Para a execução
  }

  console.log(`--- 3. Evento identificado: ${evento}, ID do Deal: ${dealId} ---`);

  // --- ‼️ INÍCIO DA NOVA LÓGICA DE ROTAS ‼️ ---
  try {

    // ----------------------------------------------------
    // ROTA A: O Deal foi DELETADO
    // ----------------------------------------------------
    if (evento === 'ONCRMDEALDELETE') {
      
      console.log(`--- 4. Iniciando DELEÇÃO para o Deal ID: ${dealId} ---`);
      const deleteQuery = 'DELETE FROM deal_activity WHERE deal_id = $1';
      
      // Roda o comando no banco de dados!
      // Usamos parseInt para garantir que o ID é um número
      const result = await pool.query(deleteQuery, [parseInt(dealId)]);

      if (result.rowCount > 0) {
        console.log(`--- 5. ✅ SUCESSO! Deal ${dealId} deletado do banco! ---`);
      } else {
        console.log(`--- 5. ⚠️ AVISO! Deal ${dealId} para deletar não foi encontrado no banco. ---`);
      }

    // ----------------------------------------------------
    // ROTA B: O Deal foi CRIADO ou ATUALIZADO
    // ----------------------------------------------------
    } else if (evento === 'ONCRMDEALADD' || evento === 'ONCRMDEALUPDATE') {
      
      // --- (AQUI ENTRA O SEU CÓDIGO ORIGINAL DE FETCH E UPSERT!) ---

      console.log(`--- 4. ID do Deal extraído: ${dealId}. Buscando detalhes... ---`);

      // 2. Construímos a URL do Webhook de ENTRADA...
      const baseUrl = process.env.BITRIX_WEBHOOK_URL;
      const inputWebhookUrl = `${baseUrl}/crm.deal.get?id=${dealId}`;

      // 3. Usamos o 'fetch'...
      const fetchResponse = await fetch(inputWebhookUrl); 

      // 4. Verificamos se a busca deu certo
      if (!fetchResponse.ok) { 
        console.log(`Erro ao buscar detalhes (talvez o deal tenha sido deletado logo após?). Bitrix respondeu com status: ${fetchResponse.status}`);
        return; // Se não achou o deal, não podemos fazer UPSERT.
      }

      // 5. Transformamos a resposta em JSON
      const dealDetails = await fetchResponse.json(); 

      // 5.1 Checagem de segurança extra
      if (!dealDetails.result) {
        console.log("--- ERRO: O Bitrix respondeu OK, mas 'dealDetails.result' está vazio. Não posso fazer UPSERT. ---");
        return;
      }

      // 6. EXIBIMOS NO CONSOLE...
      console.log('--- 5.  DETALHES DO DEAL OBTIDOS! ---');
      console.log(JSON.stringify(dealDetails, null, 2)); 
      
      // --- 7. SALVANDO NO BANCO DE DADOS (O GRAN FINALE!) ---

      // Prepara a query "UPSERT"... (Seu código perfeito!)
      const upsertQuery = `
        INSERT INTO deal_activity (
          deal_id, title, stage_id, opportunity_value, currency, assigned_by_id,
          created_by_id, source_id, company_id, contact_id, date_create,
          date_modify, closed_date, closed, is_return_customer, last_activity_time
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
        ON CONFLICT (deal_id) DO UPDATE SET
          title = EXCLUDED.title,
          stage_id = EXCLUDED.stage_id,
          opportunity_value = EXCLUDED.opportunity_value,
          currency = EXCLUDED.currency,
          assigned_by_id = EXCLUDED.assigned_by_id,
          created_by_id = EXCLUDED.created_by_id,
          source_id = EXCLUDED.source_id,
          company_id = EXCLUDED.company_id,
          contact_id = EXCLUDED.contact_id,
          date_create = EXCLUDED.date_create,
          date_modify = EXCLUDED.date_modify,
          closed_date = EXCLUDED.closed_date,
          closed = EXCLUDED.closed,
          is_return_customer = EXCLUDED.is_return_customer,
          last_activity_time = EXCLUDED.last_activity_time;
      `;

      // Pega o objeto "result" que o Bitrix mandou
      const deal = dealDetails.result;

      // Prepara o array de valores... (Seu código perfeito!)
      const values = [
        parseInt(deal.ID) || null,
        deal.TITLE || null,
        deal.STAGE_ID || null,
        parseFloat(deal.OPPORTUNITY) || null,
        deal.CURRENCY_ID || null,
        parseInt(deal.ASSIGNED_BY_ID) || null,
        parseInt(deal.CREATED_BY_ID) || null,
        deal.SOURCE_ID || null,
        parseInt(deal.COMPANY_ID) || null,
        parseInt(deal.CONTACT_ID) || null,
        deal.DATE_CREATE || null,
        deal.DATE_MODIFY || null,
        deal.CLOSED_DATE || null,
        deal.CLOSED === 'Y',
        deal.IS_RETURN_CUSTOMER === 'Y',
        deal.LAST_ACTIVITY_TIME || null
      ];

      // Roda o comando no banco de dados!
      await pool.query(upsertQuery, values);

      console.log(`--- 6. ✅ SUCESSO! Deal ${deal.ID} salvo/atualizado no banco! ---`);

    } else {
      // Evento desconhecido (ex: ONCRMDEALRESTORE, etc.)
      console.log(`--- 4. Evento '${evento}' recebido, mas não há ação configurada para ele. Ignorando. ---`);
    }

  } catch (error) {
    // Erro GIGANTE (ex: falha de conexão com o banco, erro de sintaxe SQL, etc.)
    console.log(`--- ❌ ERRO GIGANTE no processamento do evento '${evento}' para o ID ${dealId}: ---`, error);
  }
  
});

// 9. Ligamos o servidor!
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
}); //Esse é o comando final. É o "play" do servidor, a gente manda o app(servidor) ir para a garagem (a port que a gente definiu) e começar a LISTEN (escutar) por conexões(visitas na rota GET, ou webhooks na rota POST). 
// () => { ... }: Essa é a "função de callback" (a "função de aviso"). O Express promete executar ela assim que o servidor estiver 100% online e funcionando pronto para receber visitas