// =================================================================
// ARQUIVO: routes.js
// MINHA RESPONSABILIDADE: Definir todas as rotas da API (GET, POST).
// É aqui que a lógica do webhook mora.
// =================================================================

import express from 'express';
// Importo o "pool" (gerenciador do banco) que eu criei no db.js
import pool from './db.js'; 
// Importo minhas ferramentas do Bitrix (os dicionários e a função de update)
import { listFieldMaps, updateBitrixTitle } from './bitrix.js'; 

// Crio um "Roteador" do Express.
const router = express.Router();

// ----------------------------------------------------
// ROTA "GET /" (Rota de Verificação/Saúde)
// ----------------------------------------------------
router.get('/', (req, res) => {
  res.send('Meu servidor Bitrix está vivo!'); 
}); 

// ----------------------------------------------------
// ROTA "POST /" (A ROTA PRINCIPAL DO WEBHOOK!)
// ----------------------------------------------------
router.post('/', async (req, res) => { 
  
  // 1. RECEBIMENTO E RESPOSTA IMEDIATA
  const data = req.body; 
  console.log('--- 1. NOVO WEBHOOK DO BITRIX! (Saida) ---');
  console.log('Dados recebidos:', data); 
  
  // 2. RESPOSTA 200/OK (ESSENCIAL!)
  res.status(200).send('OK'); 
  console.log('--- 2. Resposta 200/OK enviada ao Bitrix. ---');
  
  // 3. PROCESSAMENTO (FEITO DEPOIS DE RESPONDER)
  const evento = data.event; 
  const dealId = data.data?.FIELDS?.ID; 

  if (!evento || !dealId) { 
    console.log("--- 3. Evento ou ID nao encontrado nos dados. Ignorando. ---");
    return;
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
      console.log(`--- 4. ID do Deal extraido: ${dealId}. Buscando detalhes... ---`);

      const baseUrl = process.env.BITRIX_WEBHOOK_URL;
      const inputWebhookUrl = `${baseUrl}/crm.deal.get?id=${dealId}`;

      const fetchResponse = await fetch(inputWebhookUrl); 

      if (!fetchResponse.ok) { 
        console.log(`Erro ao buscar detalhes. Bitrix respondeu com status: ${fetchResponse.status}`);
        return; 
      }

      const dealDetails = await fetchResponse.json(); 

      if (!dealDetails.result) {
        console.log("--- ERRO: O Bitrix respondeu OK, mas 'dealDetails.result' esta vazio. Nao posso continuar. ---");
        return;
      }

      console.log('--- 5.  DETALHES DO DEAL OBTIDOS! ---');
      console.log(JSON.stringify(dealDetails, null, 2)); 
      
      const deal = dealDetails.result; 

      // --- INÍCIO DA AUTOMAÇÃO "PRIORIDADE MAXIMA" ---
      
      const emojiPrioridade = '♨️ '; 
      const campoPrioridadeID = 'UF_CRM_1761801450'; 
      const valorPrioridadeSim = '185';
      const valorPrioridadeNao = '187';

      const prioridadeAtual = deal[campoPrioridadeID];
      const hasEmoji = deal.TITLE.startsWith(emojiPrioridade);
      
      let tituloFoiAtualizado = false;

      // CASO 1: Prioridade é "Sim" (185) E NÃO TEM emoji -> ADICIONA 
      if (prioridadeAtual === valorPrioridadeSim && !hasEmoji) {
        const novoTitulo = emojiPrioridade + deal.TITLE;
        await updateBitrixTitle(dealId, novoTitulo); // Chamo minha função "assistente"
        deal.TITLE = novoTitulo; 
        tituloFoiAtualizado = true;

      // CASO 2: Prioridade é "Não" (187) E TEM emoji -> REMOVE
      } else if (prioridadeAtual === valorPrioridadeNao && hasEmoji) {
        const novoTitulo = deal.TITLE.replace(emojiPrioridade, '');
        await updateBitrixTitle(dealId, novoTitulo); // Chamo minha função "assistente"
        deal.TITLE = novoTitulo;
        tituloFoiAtualizado = true;
      
      // CASO 3: Título já está correto
      } else {
        console.log('--- 6. [AUTOMACAO] Titulo ja esta correto ou prioridade nao definida. Nenhuma atualizacao no Bitrix necessaria. ---');
      }
      
      // --- FIM DA AUTOMAÇÃO ---
      
      
      // --- ETAPA B-2: Salvar os dados no meu Banco PostgreSQL (UPSERT) ---

      const upsertQuery = `
        INSERT INTO deal_activity (
          deal_id, title, stage_id, opportunity_value, assigned_by_id,
          created_by_id, source_id, company_id, contact_id, date_create,
          date_modify, closed,
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
        parseInt(deal.ID) || null,
        deal.TITLE || null,
        deal.STAGE_ID || null,
        parseFloat(deal.OPPORTUNITY) || null,
        parseInt(deal.ASSIGNED_BY_ID) || null,
        parseInt(deal.CREATED_BY_ID) || null,
        deal.SOURCE_ID || null,
        parseInt(deal.COMPANY_ID) || null,
        parseInt(deal.CONTACT_ID) || null,
        deal.DATE_CREATE || null,
        deal.DATE_MODIFY || null,
        deal.CLOSED === 'Y',

        // --- Bloco Novo UF (9) ---
        deal['UF_CRM_1761801450'] === '185', // $13 - prioridade (Traduzido)
        deal['UF_CRM_1761286788'] || null, // $14 - prazo_entrega
        listFieldMaps.tipoRetorno?.[deal['UF_CRM_1761285087347']] || null, // $15 - tipo_retorno (Traduzido)
        listFieldMaps.tipoDemanda?.[deal['UF_CRM_1761285615045']] || null, // $16 - tipo_demanda (Traduzido)
        deal['UF_CRM_1761700821514'] || null, // $17 - cod_executor
        listFieldMaps.executor?.[deal['UF_CRM_1761287067']] || null, // $18 - executor (Traduzido)
        deal['UF_CRM_1761801018723'] || null, // $19 - motivo_revisao
        deal['UF_CRM_1761288771741'] || null, // $20 - descricao_conclusao
        deal['UF_CRM_1761702301803'] || null  // $21 - motivo_declinio
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

// Eu exporto o 'router' para que o meu server.js possa usá-lo.
export default router;