// =================================================================
// ARQUIVO: bitrix.js
// MINHA RESPONSABILIDADE: Todas as interações com a API do Bitrix.
// (Carregar dicionários, atualizar deals, etc.)
// =================================================================

import 'dotenv/config';

// --- (Início) Dicionários de Tradução ---

// Crio uma variável global para guardar meus "dicionários" de tradução.
// Vou preencher isso quando o servidor ligar.
export let listFieldMaps = {
  tipoRetorno: {},
  tipoDemanda: {},
  executor: {}
};

// Esta função é chamada na inicialização do servidor (no server.js).
// Ela "aprende" as opções dos campos de lista do Bitrix.
export async function loadBitrixDictionaries() {
  try {
    // --- (INÍCIO) CARREGAR DICIONÁRIOS DE CAMPOS UF ---
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
      if (allFields[fieldID] && allFields[fieldID].items) {
        const mapName = fieldsToMap[fieldID]; // ex: 'tipoRetorno'
        
        // Uso .reduce() para transformar o array (ex: [{ID: "192", VALUE: "Texto"}])
        // em um objeto/mapa (ex: {"192": "Texto"}).
        const newMap = allFields[fieldID].items.reduce((acc, item) => {
          acc[item.ID] = item.VALUE;
          return acc;
        }, {});
        
        // 5. Salvo o mapa pronto na minha variável global (exportada)
        listFieldMaps[mapName] = newMap;
        console.log(`--- Dicionario para '${mapName}' carregado com ${Object.keys(newMap).length} itens. ---`);
      
      } else {
        console.log(`--- AVISO: Nao foi possivel encontrar "items" para o campo ${fieldID} ---`);
      }
    }
    console.log('--- Dicionarios de campos (UF) carregados com sucesso! ---');
    // --- (FIM) BLOCO DE CARREGAR DICIONÁRIOS ---

  } catch (err) {
    // Se qualquer coisa aqui der erro, o servidor avisa.
    console.log('--- ERRO AO CARREGAR DICIONARIOS DO BITRIX: ---', err);
    // Mesmo se falhar, o servidor continua rodando, só não vai traduzir.
  }
}

// --- (Fim) Dicionários de Tradução ---


// --- (Início) Ferramentas de Automação ---

// Função "helper" (assistente) que atualiza o título de um Deal no Bitrix24.
// Eu chamo ela de dentro das minhas rotas (routes.js).
// Ela usa o método 'crm.deal.update.json' da API.
export async function updateBitrixTitle(dealId, novoTitulo) {
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

// --- (Fim) Ferramentas de Automação ---