// =================================================================
// ARQUIVO: server.js (O "Maestro")
// MINHA RESPONSABILIDADE: Iniciar o servidor e carregar os módulos.
// =================================================================

import 'dotenv/config';
import express from 'express';

// Importo minhas rotas (que cuidam da lógica do webhook)
import routes from './routes.js';
// Importo minha conexão com o banco (que já se auto-testa)
import './db.js'; 
// Importo minha ferramenta de carregar os dicionários do Bitrix
import { loadBitrixDictionaries } from './bitrix.js';

// Inicializo o Express
const app = express();
const port = process.env.PORT || 3000;

// =================================================================
// SEÇÃO: CONFIGURAÇÃO DO SERVIDOR WEB (EXPRESS)
// =================================================================

// Middlewares (porteiros) para o Express entender os dados que chegam
app.use(express.json()); // Para entender JSON
app.use(express.urlencoded({ extended: true })); // Para entender o formato 'x-www-form-urlencoded' do Bitrix

// =================================================================
// SEÇÃO: ROTAS
// =================================================================

// Digo ao Express para usar o meu arquivo 'routes.js' para gerenciar
// todas as requisições que chegarem no "/"
app.use('/', routes);

// =================================================================
// SEÇÃO: INICIALIZAÇÃO DO SERVIDOR
// =================================================================

// Crio uma função 'startServer' para garantir que os dicionários
// sejam carregados ANTES do servidor começar a "ouvir"
async function startServer() {
  // 1. Carrega os dicionários (tipoRetorno, tipoDemanda, etc.) do Bitrix
  await loadBitrixDictionaries();
  
  // 2. Só DEPOIS que os dicionários estiverem prontos, eu ligo o servidor.
  app.listen(port, () => {
    // Esta é a "função de aviso" (callback). Ela roda assim que o servidor
    // estiver 100% online e pronto para receber visitas.
    console.log(`Servidor rodando na porta ${port}, pronto para receber webhooks!`);
  });
}

// Chamo a função para iniciar o servidor.
startServer();