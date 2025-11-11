// =================================================================
// SEÇÃO 1: IMPORTAÇÕES E CONFIGURAÇÃO INICIAL
// =================================================================

// Importo o dotenv para carregar minhas variáveis de ambiente do arquivo .env
import 'dotenv/config';
import express from 'express';

// 1. Importo o "tradutor" (driver) do PostgreSQL
import pg from 'pg';
// 2. Importo o "Buffer" para decodificar o Base64
// As chaves do banco da Square Cloud vêm como texto Base64 no .env.
// O Buffer é a ferramenta que transforma esse texto de volta no arquivo/certificado original.
import { Buffer } from 'node:buffer'; 

// Inicializo o Express. Ele que gerencia o servidor e as rotas.
const app = express();

// Defino a porta. O servidor vai tentar pegar a porta do ambiente (ex: da Square Cloud)
// ou vai usar a 3000 se eu estiver rodando localmente.
const port = process.env.PORT || 3000;

// =================================================================
// SEÇÃO 2: CONFIGURAÇÃO DO BANCO DE DADOS (POSTGRESQL)
// =================================================================

// --- (Início) Bloco de Conexão com o Banco de Dados ---

// Pego o "Pool" da biblioteca pg. O Pool é um gerenciador de conexões,
// ele é muito mais eficiente do que criar uma conexão nova a cada query.
const { Pool } = pg; 

// "Decodifico" as chaves Base64 da Square Cloud.
// 1. Leio a variável de ambiente (ex: PG_CA_CERT_BASE64).
// 2. Buffer.from(..., 'base64') entende essa string como Base64.
// 3. .toString('utf-8') converte o resultado de volta para o texto do certificado.
const caCert = Buffer.from(process.env.PG_CA_CERT_BASE64, 'base64').toString('utf-8');
const clientKey = Buffer.from(process.env.PG_CLIENT_KEY_BASE64, 'base64').toString('utf-8');
const clientCert = Buffer.from(process.env.PG_CLIENT_CERT_BASE64, 'base64').toString('utf-8');

// Crio o meu gerenciador de conexões (Pool)
const pool = new Pool({
  // O driver 'pg' lê a DATABASE_URL para pegar User, Senha, Host, Porta e Nome do Banco.
  connectionString: process.env.DATABASE_URL, 
  
  // Passo os certificados decodificados para a conexão SSL.
  ssl: { 
    // Trava de segurança: Recusa a conexão se o certificado do servidor não for 100% válido.
    rejectUnauthorized: true, 
    // Certificado da 'Autoridade' (CA): Garante que estou falando com o servidor certo.
    ca: caCert,       
    // Chave privada ("Meu segredo"): Prova a minha identidade para o servidor.
    key: clientKey,   
    // Certificado público ("Meu RG"): Prova a minha identidade para o servidor.
    cert: clientCert  
  }
});

// Crio uma variável global para guardar meus "dicionários" de tradução.
// Vou preencher isso quando o servidor ligar, para "traduzir" os IDs das listas do Bitrix.
let listFieldMaps = {
  tipoRetorno: {},
  tipoDemanda: {},
  executor: {}
};

// --- (Fim) Bloco de Conexão com o Banco de Dados ---


// =================================================================
// SEÇÃO 3: INICIALIZAÇÃO DO SERVIDOR (TESTE DE BANCO E DICIONÁRIOS)
// =================================================================
// (Este bloco de código auto-executável roda assim que o servidor liga)
(async () => {
  try {
    // 1. TESTE DE CONEXÃO (PING)
    // Tento "pingar" o banco para ver se a conexão (senha, SSL, etc.) está certa.
    await pool.query('SELECT 1');
    console.log('--- CONEXAO COM O BANCO POSTGRESQL BEM-SUCEDIDA! ---');

    // --- (INÍCIO) CARREGAR DICIONÁRIOS DE CAMPOS UF ---
    // Agora que sei que o banco funciona, vou preparar meus "dicionários".
    // Isso vai traduzir IDs (ex: "192") para Textos (ex: "Demanda de Cliente").
    console.log('--- Iniciando carregamento dos dicionarios de campos (UF)... ---');
    
    // 1. Monto a URL para o metodo 'crm.deal.fields'
    const fieldsUrl = `${process.env.BITRIX_WEBHOOK_URL}/crm.deal.fields.json`;
    
    // 2. Busco os dados de TODOS os campos do meu Bitrix
    const response = await fetch(fieldsUrl);
    if (!response.ok) throw new Error(`Erro ao buscar campos: ${response.status}`);
    
    const fieldsData = await response.json();
    const allFields = fieldsData.result; // Objeto com todos os campos

    // 3. Defino os campos de "Lista" que eu quero traduzir
    const fieldsToMap = {
      'UF_CRM_1761285087347': 'tipoRetorno', // TIPO DE RETORNO
      'UF_CRM_1761285615045': 'tipoDemanda', // TIPO DE DEMANDA
      'UF_CRM_1761287067': 'executor'        // EXECUTOR
    };

    // 4. Faço um loop para criar os mapas (dicionários)
    for (const fieldID in fieldsToMap) {
      // Verifico se o campo existe e se ele tem "items" (ou seja, se é uma lista)
      if (allFields[fieldID] && allFields[fieldID].items) {
        const mapName = fieldsToMap[fieldID]; // ex: 'tipoRetorno'
        
        // Uso .reduce() para transformar o array (ex: [{ID: "192", VALUE: "Texto"}])
        // em um objeto/mapa (ex: {"192": "Texto"}). Fica muito mais rápido de consultar.
        const newMap = allFields[fieldID].items.reduce((acc, item) => {
          acc[item.ID] = item.VALUE; // { "ID_DA_OPCAO": "TEXTO_DA_OPCAO" }
          return acc;
        }, {});
        
        // 5. Salvo o mapa pronto na minha variável global
        listFieldMaps[mapName] = newMap;
        console.log(`--- Dicionario para '${mapName}' carregado com ${Object.keys(newMap).length} itens. ---`);
      
      } else {
        // Aviso caso o campo não seja encontrado ou não seja uma lista
        console.log(`--- AVISO: Nao foi possivel encontrar "items" para o campo ${fieldID} ---`);
      }
    }
    console.log('--- Dicionarios de campos (UF) carregados com sucesso! ---');
    // --- (FIM) BLOCO DE CARREGAR DICIONÁRIOS ---

  } catch (err) {
    // Se qualquer coisa na inicialização der erro (banco ou dicionários), o servidor avisa.
    console.log('--- ERRO NA INICIALIZACAO DO SERVIDOR: ---', err);
  }
})();


// =================================================================
// SEÇÃO 4: FERRAMENTAS DE AUTOMAÇÃO (BITRIX API)
// =================================================================

/**
 * Função "helper" (assistente) que atualiza o título de um Deal no Bitrix24.
 * Eu chamo ela de dentro da minha rota principal (app.post).
 * Ela usa o método 'crm.deal.update.json' da API.
 * @param {string} dealId - O ID do Deal a ser atualizado.
 * @param {string} novoTitulo - O novo título para o Deal.
 */
async function updateBitrixTitle(dealId, novoTitulo) {
  console.log(`--- [AUTOMACAO] Atualizando Bitrix... Novo Titulo: ${novoTitulo} ---`);
  
  const baseUrl = process.env.BITRIX_WEBHOOK_URL;
  const updateUrl = `${baseUrl}/crm.deal.update.json`;

  // O Bitrix espera um 'id' e um objeto 'fields'
  const body = {
    id: dealId,
    fields: {
      TITLE: novoTitulo
    }
  };

  try {
    // Faço o POST para a API do Bitrix
    const updateResponse = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }); 
    
    if (!updateResponse.ok) {
      // Se der erro, eu logo para conseguir debugar
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

// Middlewares (porteiros) para o Express entender os dados que chegam
app.use(express.json()); // Para entender JSON

// Middleware ESSENCIAL para o Bitrix. O Bitrix envia os webhooks no formato 'x-www-form-urlencoded'.
// Esta linha "traduz" esse formato para um objeto JSON limpo (req.body).
app.use(express.urlencoded({ extended: true })); 


// =================================================================
// SEÇÃO 6: ROTAS DO SERVIDOR
// =================================================================

// ----------------------------------------------------
// ROTA "GET /" (Rota de Verificação/Saúde)
// ----------------------------------------------------
// Eu uso essa rota para verificar se o servidor está online.
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
  // Respondo OK ao Bitrix IMEDIATAMENTE.
  // Se eu demorar, o Bitrix acha que deu erro e tenta enviar de novo (duplicidade).
  res.status(200).send('OK'); 
  console.log('--- 2. Resposta 200/OK enviada ao Bitrix. ---');
  
  // 3. PROCESSAMENTO (FEITO DEPOIS DE RESPONDER)
  
  // Pego o evento e o ID logo de cara, pois preciso deles para o "roteamento"
  const evento = data.event; 
  const dealId = data.data?.FIELDS?.ID; // Uso optional chaining (?.), é mais seguro!

  // Se não tiver evento OU ID, não posso fazer nada.
  if (!evento || !dealId) { 
    console.log("--- 3. Evento ou ID nao encontrado nos dados. Ignorando. ---");
    return; // Paro a execução
  }

  console.log(`--- 3. Evento identificado: ${evento}, ID do Deal: ${dealId} ---`);

  // --- INÍCIO DA LÓGICA DE ROTAS POR EVENTO ---
  // Coloco tudo em um try/catch. Se qualquer coisa quebrar (delete, update, fetch),
  // eu pego o erro aqui e o servidor não morre.
  try {

    // ----------------------------------------------------
    // ROTA A: O Deal foi DELETADO
    // ----------------------------------------------------
    if (evento === 'ONCRMDEALDELETE') {
      
      console.log(`--- 4. Iniciando DELECAO para o Deal ID: ${dealId} ---`);
      const deleteQuery = 'DELETE FROM deal_activity WHERE deal_id = $1';
      
      // Rodo o comando no banco de dados!
      // Uso parseInt para garantir que o ID é um número
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
      
      // --- ETAPA B-1: Buscar os detalhes completos do Deal ---
      // O webhook inicial não manda todos os campos (especialmente os UFs),
      // então eu preciso fazer um 'fetch' de volta para a API.
      console.log(`--- 4. ID do Deal extraido: ${dealId}. Buscando detalhes... ---`);

      // Construo a URL do Webhook de ENTRADA...
      const baseUrl = process.env.BITRIX_WEBHOOK_URL;
      const inputWebhookUrl = `${baseUrl}/crm.deal.get?id=${dealId}`;

      // Uso o 'fetch' para buscar os dados
      const fetchResponse = await fetch(inputWebhookUrl); 

      // Verifico se a busca deu certo
      if (!fetchResponse.ok) { 
        console.log(`Erro ao buscar detalhes. Bitrix respondeu com status: ${fetchResponse.status}`);
        return; 
      }

      // Transformo a resposta em JSON
      const dealDetails = await fetchResponse.json(); 

      // Checagem de segurança. Se o 'fetch' deu certo mas não veio 'result', pulo fora.
      if (!dealDetails.result) {
        console.log("--- ERRO: O Bitrix respondeu OK, mas 'dealDetails.result' esta vazio. Nao posso continuar. ---");
        return;
      }

      // Logo os detalhes obtidos
      console.log('--- 5.  DETALHES DO DEAL OBTIDOS! ---');
      console.log(JSON.stringify(dealDetails, null, 2)); 
      
      // Pego o objeto "result" que o Bitrix mandou
      // IMPORTANTE: Eu vou modificar este objeto 'deal' localmente, se a automação rodar.
      const deal = dealDetails.result; 

      // --- INÍCIO DA AUTOMAÇÃO "PRIORIDADE MAXIMA" ---
      
      const emojiPrioridade = '♨️ ';
      const campoPrioridadeID = 'UF_CRM_1761801450'; // O ID do campo "Prioridade"
      
      // Defino os IDs da lista que o Bitrix usa para "Sim" e "Não"
      const valorPrioridadeSim = '185';
      const valorPrioridadeNao = '187';

      //Pego o valor ATUAL que veio do Bitrix
      const prioridadeAtual = deal[campoPrioridadeID];
      const hasEmoji = deal.TITLE.startsWith(emojiPrioridade);
      
      let tituloFoiAtualizado = false;

      // CASO 1: Prioridade é "Sim" (185) E NÃO TEM emoji -> ADICIONA 
      if (prioridadeAtual === valorPrioridadeSim && !hasEmoji) {
        const novoTitulo = emojiPrioridade + deal.TITLE;
        await updateBitrixTitle(dealId, novoTitulo); // Chamo minha função "assistente"
        deal.TITLE = novoTitulo; // ATUALIZO o "deal" local para salvar certo no banco!
        tituloFoiAtualizado = true;

      // CASO 2: Prioridade é "Não" (187) E TEM emoji -> REMOVE (Idempotência!)
      } else if (prioridadeAtual === valorPrioridadeNao && hasEmoji) {
        const novoTitulo = deal.TITLE.replace(emojiPrioridade, '');
        await updateBitrixTitle(dealId, novoTitulo); // Chamo minha função "assistente"
        deal.TITLE = novoTitulo; // ATUALIZO o "deal" local!
        tituloFoiAtualizado = true;
      
      // CASO 3: Título já está correto (ou a prioridade está vazia)
      } else {
        console.log('--- 6. [AUTOMACAO] Titulo ja esta correto ou prioridade nao definida. Nenhuma atualizacao no Bitrix necessaria. ---');
      }
      
      // --- FIM DA AUTOMAÇÃO ---
      
      
      // --- ETAPA B-2: Salvar os dados no meu Banco PostgreSQL (UPSERT) ---

      // Preparo a query "UPSERT" (Se o ID não existir, INSERE. Se já existir, ATUALIZA.)
      // Isso é ESSENCIAL para a pipeline, para não dar erro de "chave duplicada".
      const upsertQuery = `
        INSERT INTO deal_activity (
          deal_id, title, stage_id, opportunity_value, assigned_by_id,
          created_by_id, source_id, company_id, contact_id, date_create,
          date_modify, closed,
          -- (Novos campos UF!)
          prioridade, prazo_entrega, tipo_retorno, tipo_demanda, cod_executor,
          executor, motivo_revisao, descricao_conclusao, motivo_declinio
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18, $19, $20, $21
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
          closed = EXCLUDED.closed,
          -- (Novos campos UF!)
          prioridade = EXCLUDED.prioridade,
          prazo_entrega = EXCLUDED.prazo_entrega,
          tipo_retorno = EXCLUDED.tipo_retorno,
          tipo_demanda = EXCLUDED.tipo_demanda,
          cod_executor = EXCLUDED.cod_executor,
          executor = EXCLUDED.executor,
          motivo_revisao = EXCLUDED.motivo_revisao,
          descricao_conclusao = EXCLUDED.descricao_conclusao,
          motivo_declinio = EXCLUDED.motivo_declinio;
      `;

      // Preparo o array de valores.
      // A ORDEM AQUI TEM QUE SER IDÊNTICA AOS "$1, $2..." DA QUERY!
      const values = [
        // --- Bloco Padrão (12) ---
        parseInt(deal.ID) || null,                  // $1 - deal_id
        deal.TITLE || null,                         // $2 - title (JÁ ATUALIZADO PELA AUTOMAÇÃO!)
        deal.STAGE_ID || null,                      // $3 - stage_id
        parseFloat(deal.OPPORTUNITY) || null,       // $4 - opportunity_value
        parseInt(deal.ASSIGNED_BY_ID) || null,      // $5 - assigned_by_id
        parseInt(deal.CREATED_BY_ID) || null,       // $6 - created_by_id
        deal.SOURCE_ID || null,                     // $7 - source_id
        parseInt(deal.COMPANY_ID) || null,          // $8 - company_id
        parseInt(deal.CONTACT_ID) || null,          // $9 - contact_id
        deal.DATE_CREATE || null,                   // $10 - date_create
        deal.DATE_MODIFY || null,                   // $11 - date_modify
        deal.CLOSED === 'Y',                        // $12 - closed (Converte "Y" para TRUE)

        // --- Bloco Novo UF (9) ---
        
        // $13 - prioridade (Traduzido de ID para BOOLEAN)
        deal['UF_CRM_1761801450'] === '185',
        
        // $14 - prazo_entrega (Data/Serie)
        deal['UF_CRM_1761286788'] || null,
        
        // $15 - tipo_retorno (Traduzido de ID para TEXTO usando o dicionario!)
        listFieldMaps.tipoRetorno?.[deal['UF_CRM_1761285087347']] || null,
        
        // $16 - tipo_demanda (Traduzido de ID para TEXTO usando o dicionario!)
        listFieldMaps.tipoDemanda?.[deal['UF_CRM_1761285615045']] || null,
        
        // $17 - cod_executor (String)
        deal['UF_CRM_1761700821514'] || null,
        
        // $18 - executor (Traduzido de ID para TEXTO usando o dicionario!)
        listFieldMaps.executor?.[deal['UF_CRM_1761287067']] || null,
        
        // $19 - motivo_revisao (String/Text)
        deal['UF_CRM_1761801018723'] || null,
        
        // $20 - descricao_conclusao (String/Text)
        deal['UF_CRM_1761288771741'] || null,
        
        // $21 - motivo_declinio (String/Text)
        deal['UF_CRM_1761702301803'] || null
      ];
      
      // Rodo o comando final no banco de dados!
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
    // Pega qualquer erro GIGANTE (ex: falha de conexão com o banco, erro de sintaxe SQL, etc.)
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
  // Esta é a "função de aviso" (callback). Ela roda assim que o servidor
  // estiver 100% online e pronto para receber visitas.
  console.log(`Servidor rodando na porta ${port}`);
});