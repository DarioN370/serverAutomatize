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

  if (!evento) { 
    console.log("--- 3. Nenhum 'event' encontrado nos dados. Ignorando. ---");
    return; // Paro a execução
  }

  // --- INÍCIO DO "ROTEADOR MESTRE" (DEAL ou COMPANY?) ---
  // Coloco tudo em um try/catch. Se qualquer coisa quebrar (delete, update, fetch),
  // eu pego o erro aqui e o servidor não morre.
  try {

    // ============================================
    // ROTA 1: É UM EVENTO DE DEAL (DEAL)
    // ============================================
    if (evento.startsWith('ONCRMDEAL')) {
      
      const dealId = data.data?.FIELDS?.ID; 
      if (!dealId) {
        console.log("--- 3. Evento de DEAL, mas nao foi possivel encontrar o ID. Ignorando. ---");
        return;
      }
      console.log(`--- 3. Evento de DEAL identificado: ${evento}, ID do Deal: ${dealId} ---`);

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
        const companyId = deal.COMPANY_ID; // Pego o ID da empresa para as automações

        // --- INÍCIO DA AUTOMAÇÃO "TAGS DE EMPRESA" (JIT) ---
        // Esta automação SÓ RODA NA CRIAÇÃO de um deal
        if (evento === 'ONCRMDEALADD' && companyId) {
          console.log(`--- [AUTOMACAO TAG] Novo deal para Company ID: ${companyId}. Buscando tag... ---`);
          
          let tag = ''; // Variavel para guardar a tag

          // 1. TENTO ACHAR A EMPRESA NO MEU BANCO
          const tagQuery = 'SELECT tag_prefix FROM companies WHERE bitrix_company_id = $1';
          const tagResult = await pool.query(tagQuery, [parseInt(companyId)]);
          
          // 2. SE EU NÃO ACHEI (rows.length === 0)...
          if (tagResult.rows.length === 0) {
            console.log(`--- [AUTOMACAO TAG] Empresa ${companyId} nao encontrada no banco. Buscando no Bitrix... ---`);
            
            // 2a. BUSCO OS DADOS DA EMPRESA NO BITRIX
            const companyUrl = `${process.env.BITRIX_WEBHOOK_URL}/crm.company.get?id=${companyId}`;
            const companyResponse = await fetch(companyUrl);
            
            if (companyResponse.ok) {
              const companyDetails = await companyResponse.json();
              const company = companyDetails.result;
              
              // 2b. PEGO A TAG (O ID DO CAMPO TAG DA EMPRESA!)
              const companyTag = company['UF_CRM_1763424498916']; 
              
              if (companyTag) {
                // 2c. SALVO A NOVA EMPRESA NO MEU BANCO (para o futuro!)
                const insertCompanyQuery = 'INSERT INTO companies (bitrix_company_id, company_name, tag_prefix) VALUES ($1, $2, $3)';
                await pool.query(insertCompanyQuery, [parseInt(company.ID), company.TITLE, companyTag]);
                tag = companyTag; // Achei a tag!
                console.log(`--- [AUTOMACAO TAG] Empresa ${company.ID} (${companyTag}) salva no banco! ---`);
              } else {
                console.log(`--- [AUTOMACAO TAG] Empresa ${company.ID} encontrada, mas o campo "Tag" esta vazio. ---`);
              }
            }
          } else {
            // 2d. SE EU ACHEI NO BANCO, SÓ USO A TAG
            tag = tagResult.rows[0].tag_prefix;
            console.log(`--- [AUTOMACAO TAG] Tag "${tag}" encontrada no banco. ---`);
          }

          // 3. SE EU TENHO UMA TAG (seja nova ou antiga)...
          if (tag) {
            // 4. CONTO OS DEALS DESSA EMPRESA (para o contador)
            const countQuery = 'SELECT COUNT(*) FROM deal_activity WHERE company_id = $1';
            const countResult = await pool.query(countQuery, [parseInt(companyId)]);
            
            const novoContador = parseInt(countResult.rows[0].count) + 1;
            
            // 5. CRIO O NOVO TÍTULO (ex: "APP 1", "APP 2")
            const novoTitulo = `${tag} ${novoContador}`;
            
            // 6. ATUALIZO O BITRIX! (Usando nossa ferramenta!)
            await updateBitrixTitle(dealId, novoTitulo);
            
            // 7. ATUALIZO O OBJETO LOCAL (CRÍTICO!)
            deal.TITLE = novoTitulo; 
            console.log(`--- [AUTOMACAO TAG] Titulo do Deal ${dealId} atualizado para: ${novoTitulo} ---`);

          } else {
             console.log(`--- [AUTOMACAO TAG] Nenhuma tag encontrada para o Company ID: ${companyId}. Titulo nao sera alterado. ---`);
          }
        }
        // --- FIM DA AUTOMAÇÃO "TAGS DE EMPRESA" ---


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
          await updateBitrixTitle(dealId, novoTitulo); 
          deal.TITLE = novoTitulo; 
          tituloFoiAtualizado = true;

        // CASO 2: Prioridade é "Não" (187) E TEM emoji -> REMOVE
        } else if (prioridadeAtual === valorPrioridadeNao && hasEmoji) {
          const novoTitulo = deal.TITLE.replace(emojiPrioridade, '');
          await updateBitrixTitle(dealId, novoTitulo);
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
          deal['UF_CRM_1761287067'] || null, // $18 - executor (Corrigido: salvando o ID cru)
          deal['UF_CRM_1761801018723'] || null, // $19 - motivo_revisao
          deal['UF_CRM_1761288771741'] || null, // $20 - descricao_conclusao
          deal['UF_CRM_1761702301803'] || null  // $21 - motivo_declinio
        ];
        
        await pool.query(upsertQuery, values);
        
        if (tituloFoiAtualizado) {
           console.log(`--- 7. SUCESSO! Titulo atualizado no Bitrix e Deal ${deal.ID} salvo/atualizado no banco! ---`);
        } else {
           console.log(`--- 7. SUCESSO! Deal ${deal.ID} salvo/atualizado no banco (titulo nao precisou mudar). ---`);
        }
      } 
      // Fim da Rota B
      
    // ============================================
    // ROTA 2: É UM EVENTO DE DELETE DE EMPRESA (COMPANY) - (A NOVA LÓGICA!)
    // ============================================
    } else if (evento === 'ONCRMCOMPANYDELETE') {
      
      // O ID da empresa vem em um lugar diferente (geralmente data.ID ou data.data.ID)
      const companyId = data.data?.FIELDS?.ID;

      if (!companyId) {
         console.log("--- 3. Evento ONCRMCOMPANYDELETE, mas nao foi possivel encontrar o ID da Empresa. Ignorando. ---");
         return;
      }
      
      console.log(`--- 3. Evento de EMPRESA identificado: ${evento}, ID da Empresa: ${companyId} ---`);
      console.log(`--- 4. Iniciando DELECAO para a Empresa ID: ${companyId} da tabela 'companies' ---`);
      
      // Roda o DELETE na sua tabela 'companies'
      const deleteQuery = 'DELETE FROM companies WHERE bitrix_company_id = $1';
      const result = await pool.query(deleteQuery, [parseInt(companyId)]);

      if (result.rowCount > 0) {
        console.log(`--- 5. SUCESSO! Empresa ${companyId} deletada da tabela 'companies'! ---`);
      } else {
        console.log(`--- 5. AVISO! Empresa ${companyId} para deletar nao foi encontrada no banco 'companies'. ---`);
      }
    
    // ============================================
    // ROTA 3: OUTROS EVENTOS (IGNORADOS)
    // ============================================
    } else {
      console.log(`--- 3. Evento '${evento}' recebido, mas nao ha acao configurada para ele. Ignorando. ---`);
    }
    // --- FIM DO "ROTEADOR MESTRE" ---

  } catch (error) {
    // Pega qualquer erro GIGANTE (ex: falha de conexão com o banco, erro de sintaxe SQL, etc.)
    console.log(`--- ERRO GIGANTE no processamento do evento '${evento}': ---`, error);
  }
  
});
// --- FIM DA ROTA "POST /" ---


// Eu exporto o 'router' para que o meu server.js possa usá-lo.
export default router;