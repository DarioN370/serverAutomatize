// =================================================================
// SEÇÃO 1: IMPORTAÇÕES E CONFIGURAÇÃO INICIAL
// =================================================================

// IMPORTANDO O DOTENV
import 'dotenv/config';
import express from 'express';

// 1. Importamos o "tradutor" (driver) do PostgreSQL
import pg from 'pg';
// 2. Importamos o "Buffer" para decodificar o Base64
// As chaves do banco (certificados SSL) vêm num formato de texto (Base64).
// O Buffer é a ferramenta que pega esse texto e o transforma de volta no certificado original.
import { Buffer } from 'node:buffer'; 

// 2. Inicializamos o Express
// O Express simplifica a criação de rotas e o gerenciamento do servidor web.
const app = express();

// 3. Pegamos a porta do ambiente ou usamos a 3000 como padrão
const port = process.env.PORT || 3000;

// =================================================================
// SEÇÃO 2: CONFIGURAÇÃO DO BANCO DE DADOS (POSTGRESQL)
// =================================================================

// --- (Início) BLOCO DE CONEXÃO COM O BANCO DE DADOS (base64)---
const { Pool } = pg; // Importamos o "Pool" da biblioteca pg. O Pool gerencia múltiplas conexões.

// "Decodificamos" as chaves Base64 que a Square Cloud nos fornece
// 1. Lemos a variável de ambiente (ex: PG_CA_CERT_BASE64)
// 2. Buffer.from(..., 'base64') entende essa string como Base64.
// 3. .toString('utf-8') converte o resultado de volta para um texto normal.
const caCert = Buffer.from(process.env.PG_CA_CERT_BASE64, 'base64').toString('utf-8');
const clientKey = Buffer.from(process.env.PG_CLIENT_KEY_BASE64, 'base64').toString('utf-8');
const clientCert = Buffer.from(process.env.PG_CLIENT_CERT_BASE64, 'base64').toString('utf-8');

// Criamos nosso gerenciador de conexões (Pool)
const pool = new Pool({
  // O driver 'pg' lê a DATABASE_URL para pegar User, Senha, Host, Porta e Nome do Banco.
  connectionString: process.env.DATABASE_URL, 
  
  // Passamos os certificados decodificados para a conexão SSL
  ssl: { 
    rejectUnauthorized: true, // Trava de segurança: Recusa a conexão se o certificado do servidor não for 100% válido.
    ca: caCert,       // Certificado da 'Autoridade' (CA): Verifica a identidade do servidor.
    key: clientKey,   // Chave privada ("Nosso segredo"): Prova a nossa identidade para o servidor.
    cert: clientCert  // Certificado público ("Nosso RG"): Prova a nossa identidade para o servidor.
  }
});

// --- (Fim) BLOCO DE CONEXÃO COM O BANCO DE DADOS ---


// =================================================================
// SEÇÃO 3: TESTE DE INICIALIZAÇÃO DO BANCO DE DADOS
// =================================================================
// (Este bloco de código auto-executável roda assim que o servidor liga)
(async () => {
  try {
    // Tenta "pingar" o banco para ver se a conexão deu certo
    // (Pede ao Pool uma conexão, envia 'SELECT 1' e a devolve)
    await pool.query('SELECT 1');
    console.log('--- CONEXAO COM O BANCO POSTGRESQL BEM-SUCEDIDA! ---');
    } catch (err) {
    // Se der erro (senha, certificado, etc.), ele avisa no log.
    console.log('--- ERRO AO CONECTAR COM O BANCO: ---', err);
  }
})();


// =================================================================
// SEÇÃO 4: FERRAMENTAS DE AUTOMAÇÃO (BITRIX API)
// =================================================================

/**
 * Função "helper" que atualiza o título de um Deal no Bitrix24.
 * Usa o método 'crm.deal.update.json' da API.
 * @param {string} dealId - O ID do Deal a ser atualizado.
 * @param {string} novoTitulo - O novo título para o Deal.
 */
async function updateBitrixTitle(dealId, novoTitulo) {
  console.log(`--- [AUTOMACAO] Atualizando Bitrix... Novo Titulo: ${novoTitulo} ---`);
  
  const baseUrl = process.env.BITRIX_WEBHOOK_URL;
  // O método de update é 'crm.deal.update.json'
  const updateUrl = `${baseUrl}/crm.deal.update.json`;

  // O Bitrix espera um 'id' e um objeto 'fields'
  const body = {
    id: dealId,
    fields: {
      TITLE: novoTitulo
    }
  };

  try {
    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }); 
    
    if (!updateResponse.ok) {
      // Se der erro, vamos logar para debugar
      console.log(`--- ERRO [AUTOMACAO] ao atualizar o titulo no Bitrix. Status: ${updateResponse.status} ---`);
      const errorBody = await updateResponse.text();
      console.log("Corpo do Erro (Bitrix Update):", errorBody);
    } else {
      console.log(`--- SUCESSO! [AUTOMACAO] Titulo do Deal ${dealId} atualizado no Bitrix. ---`);
    }
  } catch (error) {
    console.log("--- ERRO GIGANTE [AUTOMACAO] no 'fetch' de updateBitrixTitle:", error);
  }
}

// =================================================================
// SEÇÃO 5: CONFIGURAÇÃO DO SERVIDOR WEB (EXPRESS)
// =================================================================

// Middlewares para o Express entender os dados que chegam
app.use(express.json()); // Para entender JSON
// Para entender o formato 'x-www-form-urlencoded' que o Bitrix usa para enviar os webhooks
app.use(express.urlencoded({ extended: true })); 


// =================================================================
// SEÇÃO 6: ROTAS DO SERVIDOR
// =================================================================

// ----------------------------------------------------
// ROTA "GET /" (Rota de Verificação)
// ----------------------------------------------------
// Usada para verificar se o servidor está online.
// 'GET' é o que o navegador faz ao acessar uma URL.
app.get('/', (req, res) => {
  // 'req' (Request): Contém os dados de quem pediu.
  // 'res' (Response): Contém as ferramentas para responder.
  res.send('Meu servidor Bitrix está vivo!'); // Envia o texto como resposta.
}); 


// ----------------------------------------------------
// ROTA "POST /" (A ROTA PRINCIPAL DO WEBHOOK!)
// ----------------------------------------------------
// 'POST' é usado para ENVIAR dados para o servidor. É o que o Bitrix faz.
// 'async' avisa que esta função pode precisar 'esperar' (await) por respostas (ex: fetch, db).
app.post('/', async (req, res) => { 
  
  // 1. RECEBIMENTO E RESPOSTA IMEDIATA
  // Os dados do Webhook de SAÍDA chegam aqui, no 'corpo' da requisição
  const data = req.body; 
  console.log('--- 1. NOVO WEBHOOK DO BITRIX! (Saida) ---');
  console.log('Dados recebidos:', data); 
  
  // 2. RESPOSTA 200/OK (ESSENCIAL!)
  // Respondemos OK ao Bitrix IMEDIATAMENTE.
  // Se demorarmos, o Bitrix acha que deu erro e tenta enviar de novo (duplicidade).
  res.status(200).send('OK'); 
  console.log('--- 2. Resposta 200/OK enviada ao Bitrix. ---');
  
  // 3. PROCESSAMENTO (FEITO DEPOIS DE RESPONDER)
  
  // Pegamos o evento e o ID logo de cara, pois precisamos deles para o "roteamento"
  const evento = data.event; 
  const dealId = data.data?.FIELDS?.ID; // Usando optional chaining (?.), é mais seguro!

  // Se não tiver evento OU ID, não podemos fazer nada.
  if (!evento || !dealId) { 
    console.log("--- 3. Evento ou ID nao encontrado nos dados. Ignorando. ---");
    return; // Para a execução
  }

  console.log(`--- 3. Evento identificado: ${evento}, ID do Deal: ${dealId} ---`);

  // --- INÍCIO DA LÓGICA DE ROTAS POR EVENTO ---
  try {

    // ----------------------------------------------------
    // ROTA A: O Deal foi DELETADO
    // ----------------------------------------------------
    if (evento === 'ONCRMDEALDELETE') {
      
      console.log(`--- 4. Iniciando DELECAO para o Deal ID: ${dealId} ---`);
      const deleteQuery = 'DELETE FROM deal_activity WHERE deal_id = $1';
      
      // Roda o comando no banco de dados!
      // Usamos parseInt para garantir que o ID é um número
      const result = await pool.query(deleteQuery, [parseInt(dealId)]);

      if (result.rowCount > 0) {
        console.log(`--- 5. SUCESSO! Deal ${dealId} deletado do banco! ---`);
      } else {
        console.log(`--- 5. AVISO! Deal ${dealId} para deletar nao foi encontrado no banco. ---`);
      }

    // ----------------------------------------------------
    // ROTA B: O Deal foi CRIADO ou ATUALIZADO
    // ----------------------------------------------------
    } else if (evento === 'ONCRMDEALADD' || evento === 'ONCRMDEALUPDATE') {
      
      // ETAPA B-1: Buscar os detalhes completos do Deal
      console.log(`--- 4. ID do Deal extraido: ${dealId}. Buscando detalhes... ---`);

      // Construímos a URL do Webhook de ENTRADA...
      const baseUrl = process.env.BITRIX_WEBHOOK_URL;
      const inputWebhookUrl = `${baseUrl}/crm.deal.get?id=${dealId}`;

      // Usamos o 'fetch' para buscar os dados
      const fetchResponse = await fetch(inputWebhookUrl); 

      // Verificamos se a busca deu certo
      if (!fetchResponse.ok) { 
        console.log(`Erro ao buscar detalhes (talvez o deal tenha sido deletado logo apos?). Bitrix respondeu com status: ${fetchResponse.status}`);
        return; // Se não achou o deal, não podemos fazer UPSERT.
      }

      // Transformamos a resposta em JSON
      const dealDetails = await fetchResponse.json(); 

      // Checagem de segurança extra
      if (!dealDetails.result) {
        console.log("--- ERRO: O Bitrix respondeu OK, mas 'dealDetails.result' esta vazio. Nao posso continuar. ---");
        return;
      }

      // Logamos os detalhes obtidos
      console.log('--- 5.  DETALHES DO DEAL OBTIDOS! ---');
      console.log(JSON.stringify(dealDetails, null, 2)); 
      
      // Pega o objeto "result" que o Bitrix mandou
      // IMPORTANTE: Nós vamos modificar este objeto localmente, se necessário.
      const deal = dealDetails.result; 

      // --- INÍCIO DA AUTOMAÇÃO "PRIORIDADE MAXIMA" ---
      
      const emojiPrioridade = '♨️ ';
      const campoPrioridadeID = 'UF_CRM_1761801450'; // O ID do campo "Prioridade"!
      
      // O resultado s/n vai ser um ID do campo, são interpretados como lista
      const valorPrioridadeSim = '185';
      const valorPrioridadeNao = '187';

      //Pegamos o valor ATUAL que veio do Bitrix
      const prioridadeAtual = deal[campoPrioridadeID];
      const hasEmoji = deal.TITLE.startsWith(emojiPrioridade);
      
      let tituloFoiAtualizado = false;

      // CASO 1: Prioridade é "Sim" (185) E NÃO TEM emoji -> ADICIONA 
      if (prioridadeAtual === valorPrioridadeSim && !hasEmoji) {
        const novoTitulo = emojiPrioridade + deal.TITLE;
        await updateBitrixTitle(dealId, novoTitulo); // Chama nossa nova ferramenta!
        deal.TITLE = novoTitulo; // ATUALIZA o "deal" local para salvar certo no banco!
        tituloFoiAtualizado = true;

      // CASO 2: Prioridade é "Não" (187) E TEM emoji -> REMOVE (Idempotência!)
      } else if (prioridadeAtual === valorPrioridadeNao && hasEmoji) {
        const novoTitulo = deal.TITLE.replace(emojiPrioridade, '');
        await updateBitrixTitle(dealId, novoTitulo); // Chama nossa nova ferramenta!
        deal.TITLE = novoTitulo; // ATUALIZA o "deal" local!
        tituloFoiAtualizado = true;
      
      // CASO 3: Título já está correto (ou a prioridade está vazia)
      } else {
        console.log('--- 6. [AUTOMACAO] Titulo ja esta correto ou prioridade nao definida/correta. Nenhuma atualizacao no Bitrix necessaria. ---');
      }
      
      // --- FIM DA AUTOMAÇÃO ---
      
      
      // --- ETAPA B-2: Salvar os dados no nosso Banco PostgreSQL (UPSERT) ---

      // Prepara a query "UPSERT" (Se o ID não existir, INSERE. Se já existir, ATUALIZA.)
      // Isso é ESSENCIAL para a pipeline, para não dar erro de "chave duplicada"!
      const upsertQuery = `
        INSERT INTO deal_activity (
          deal_id, title, stage_id, opportunity_value, assigned_by_id,
          created_by_id, source_id, company_id, contact_id, date_create,
          date_modify, closed
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
        ON CONFLICT (deal_id) DO UPDATE SET
          title = EXCLUDED.title,
          stage_id = EXCLUDED.stage_id,
          opportunity_value = EXCLUDED.opportunity_value,
          assigned_by_id = EXCLUDED.assigned_by_id,
          created_by_id = EXCLUDED.created_by_id,
          source_id = EXCLUDED.source_id,
          company_id = EXCLUDED.company_id,
          contact_id = EXCLUDED.contact_id,
          date_create = EXCLUDED.date_create,
          date_modify = EXCLUDED.date_modify,
          closed = EXCLUDED.closed;
      `;

      // Prepara o array de valores, na ordem certinha dos "$1, $2..."
      // (Usamos "|| null" para garantir que, se um campo vier vazio, ele salve NULL no banco)
      // O campo "deal.TITLE" já estará atualizado com o emoji, se necessário!
      const values = [
        parseInt(deal.ID) || null,                  // $1 - deal_id
        deal.TITLE || null,                         // $2 - title (JÁ ATUALIZADO PELA AUTOMAÇÃO!)
        deal.STAGE_ID || null,                      // $3 - stage_id
        parseFloat(deal.OPPORTUNITY) || null,       // $4 - opportunity_value (Bitrix manda como string)
        parseInt(deal.ASSIGNED_BY_ID) || null,      // $6 - assigned_by_id
        parseInt(deal.CREATED_BY_ID) || null,       // $7 - created_by_id
        deal.SOURCE_ID || null,                     // $8 - source_id
        parseInt(deal.COMPANY_ID) || null,          // $9 - company_id
        parseInt(deal.CONTACT_ID) || null,          // $10 - contact_id
        deal.DATE_CREATE || null,                   // $11 - date_create (PostgreSQL entende esse formato!)
        deal.DATE_MODIFY || null,                   // $12 - date_modify
        deal.CLOSED === 'Y'                        // $14 - closed (Converte "Y" para TRUE)
      ];
      

      // Roda o comando no banco de dados!
      await pool.query(upsertQuery, values);
      
      if (tituloFoiAtualizado) {
         console.log(`--- 7. SUCESSO! Titulo atualizado no Bitrix e Deal ${deal.ID} salvo/atualizado no banco! ---`);
      } else {
         console.log(`--- 7. SUCESSO! Deal ${deal.ID} salvo/atualizado no banco (titulo nao precisou mudar). ---`);
      }

    } else {
      // Evento desconhecido (ex: ONCRMDEALRESTORE, etc.)
      console.log(`--- 4. Evento '${evento}' recebido, mas nao ha acao configurada para ele. Ignorando. ---`);
    }

  } catch (error) {
    // Erro GIGANTE (ex: falha de conexão com o banco, erro de sintaxe SQL, etc.)
    console.log(`--- ERRO GIGANTE no processamento do evento '${evento}' para o ID ${dealId}: ---`, error);
  }
  
});

// =================================================================
// SEÇÃO 7: INICIALIZAÇÃO DO SERVIDOR
// =================================================================

// 9. Ligamos o servidor!
// O comando final. É o "play" do servidor.
// Ele manda o app(servidor) ir para a porta que definimos e começar a "LISTEN" (escutar) por conexões.
app.listen(port, () => {
  // Esta é a "função de aviso" (callback). Ela roda assim que o servidor estiver 100% online e pronto para receber visitas.
  console.log(`Servidor rodando na porta ${port}`);
});