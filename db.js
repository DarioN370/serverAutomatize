// =================================================================
// ARQUIVO: db.js
// MINHA RESPONSABILIDADE: Conectar com o banco de dados PostgreSQL.
// =================================================================

import 'dotenv/config';
import pg from 'pg';
import { Buffer } from 'node:buffer';

// --- (Início) Bloco de Conexão com o Banco de Dados ---

// Pego o "Pool" da biblioteca pg. O Pool é um gerenciador de conexões.
const { Pool } = pg; 

// "Decodifico" as chaves Base64 da Square Cloud.
const caCert = Buffer.from(process.env.PG_CA_CERT_BASE64, 'base64').toString('utf-8');
const clientKey = Buffer.from(process.env.PG_CLIENT_KEY_BASE64, 'base64').toString('utf-8');
const clientCert = Buffer.from(process.env.PG_CLIENT_CERT_BASE64, 'base64').toString('utf-8');

// Crio o meu gerenciador de conexões (Pool)
const pool = new Pool({
  // O driver 'pg' lê a DATABASE_URL para pegar User, Senha, Host, Porta e Nome do Banco.
  connectionString: process.env.DATABASE_URL, 
  
  // Passo os certificados decodificados para a conexão SSL.
  ssl: { 
    rejectUnauthorized: true, 
    ca: caCert,       
    key: clientKey,   
    cert: clientCert  
  }
});

// --- (Fim) Bloco de Conexão com o Banco de Dados ---

// --- (Início) Teste de Conexão ---
// (Este bloco de código auto-executável roda assim que este arquivo é importado)
(async () => {
  try {
    // 1. TESTE DE CONEXÃO (PING)
    // Tento "pingar" o banco para ver se a conexão (senha, SSL, etc.) está certa.
    await pool.query('SELECT 1');
    console.log('--- CONEXAO COM O BANCO POSTGRESQL BEM-SUCEDIDA! ---');
  } catch (err) {
    // Se o ping falhar, o servidor avisa no log.
    console.log('--- ERRO AO CONECTAR COM O BANCO: ---', err);
  }
})();
// --- (Fim) Teste de Conexão ---

// Eu exporto o 'pool' para que minhas rotas (routes.js) possam usá-lo para fazer queries.
export default pool;