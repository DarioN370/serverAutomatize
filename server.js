// IMPORTANDO O DOTENV
import 'dotenv/config';
import express from 'express';

// <-- ALTERAÇÃO AQUI! -->
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

  //Se o banco der erro (senha errada, certificado errado, etc.), ele pula pro catch { ... } e imprime o ❌ ERRO!

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

// 6.  A ROTA DO SEU WEBHOOK! 
// (async é importante para o fetch!)
app.post('/', async (req, res) => { 
//  O que faz: Essa linha é bem parecida com a rota app.get, mas ela tem duas diferenças cruciais.
//  app.post: É o comando que diz "servidor, fique ouvindo por requisições do tipo POST...".
//  Uma requisição "POST" é usada para ENVIAR DADOS para um servidor. O Bitrix não quer "pegar" uma página, ele quer "entregar" um pacote de dados (o webhook) para você.
//  '/': É a URL para onde o Bitrix vai enviar os dados (a raiz do site).
//  async (req, res): Aqui está a mágica!
//  async (Assíncrono): Essa palavrinha é um aviso para o JavaScript. Ela diz: "Atenção! Dentro desta função, nós vamos fazer coisas que demoram e precisam de 'paciência' (como o fetch, que vai buscar dados na internet). O código aqui dentro pode precisar 'esperar' (await) por essas coisas."
  
  // Os dados do Webhook de SAÍDA chegam aqui
  const data = req.body; // aqui eu to usando o porteiro express.urlencoded e armazenando o objeto limpinho com o evento e os campos e armazenando dentro da variavel data
  
  console.log('--- 1. NOVO WEBHOOK DO BITRIX! (Saída) ---'); // msg normal mostrando que chegou dado 
  console.log('Dados recebidos:', data); //mostrando e avisando que os dados chegaram
  
  // 7. AVISO IMPORTANTE (CORREÇÃO DA DUPLICIDADE)
  res.status(200).send('OK'); // Respondemos OK ao Bitrix IMEDIATAMENTE.
  console.log('--- 2. Resposta 200/OK enviada ao Bitrix. ---');
  
  // 8. PROCESSAMENTO (FEITO DEPOIS DE RESPONDER)
  const evento = data.event; // sabe a linha que cria a const data e guarda os dados do campo, essa linha manda pegar o pacote data, e acessa(.) a propriedade event(update, add, delete), então ela guarda o valor que estava lá (por exemplo, a string "ONCRMDEALUPDATE") dentro de uma nova variável chamada evento.

  if (evento) { //Condição de segurança, ela pergunta: A variável evento que a gente acabou de criar existe? Ela não é undefined ou null?... ele faz isso pq queremos fazer o fetch (buscar detalhes) apenas se o Bitrix me mandar evento valido, caso contrario, se ele mandar o webhook sem a propriedade event, o codigo acaba
    console.log('--- 3. Evento identificado:', evento, '---');
    
    // --- INÍCIO DE PEGAR E MOSTRAR OS DADOS DO CARD CORRESPONDENTE AO ID!)  ---
    
    try { //Aqui é onde meu código tenta fazer linha por linha, se algo falhar, ele me notifica com erro
      // 1. Pegamos o ID do Deal que foi modificado
      const dealId = data.data.FIELDS.ID; // aqui eu to acessando o ID do negocio, acesso o data(req.body). depois acesso a primeira chave data nele, depois a chave FIELDS, depois acesso a chave ID, aí pega o valor que achou lá (ex: a string "97") e guarda na variável dealId pra usar logo em seguida.

      if (!dealId) { // Aqui ocorre uma checagem, o ! significa não, ou seja, se NÃO existir um dealId, se ele for undefined, null ou vazio
        console.log("Erro: Não consegui encontrar o ID em 'data.data.FIELDS.ID'.");
        return; // Para a execução se não tiver ID
      }

      console.log(`--- 4. ID do Deal extraído: ${dealId}. Buscando detalhes... ---`);

      // 2. Construímos a URL do Webhook de ENTRADA, POREM, usando o .env para proteger nossa chave API
      const baseUrl = process.env.BITRIX_WEBHOOK_URL;
      const inputWebhookUrl = `${baseUrl}/crm.deal.get?id=${dealId}`;

      // 3. Usamos o 'fetch' (embutido no Node) para buscar os dados
      const fetchResponse = await fetch(inputWebhookUrl); //O fetch vai lá no servidor do Bitrix (lá na automatize.bitrix24.com.br...) e "pergunta": "Ei, me dá os dados desse Deal, por favor?".
      //Alem disso, O await pausa a execução do seu código exatamente nesta linha. O seu servidor fica ali, de braços cruzos, esperando o Bitrix responder. Isso pode levar 1 segundo, 2 segundos...
      // aí ele guarda a resposta na variavel fetchResponse
      //O fetchResponse ainda não são os dados que a gente quer. Ele é a "caixa" que o correio entregou. É um objeto com informações sobre a entrega (Deu certo? Foi 200 OK? Foi erro 404? A caixa veio amassada?).

      // 4. Verificamos se a busca deu certo
      if (!fetchResponse.ok) { // Aqui é o seguinte, ele vai ver se não foi ok, se não estiver ok, ele vai dar o erro e fechar a exec do código
        console.log(`Erro ao buscar detalhes. Bitrix respondeu com status: ${fetchResponse.status}`);
        return;
      }

      // 5. Transformamos a resposta em JSON
      const dealDetails = await fetchResponse.json(); // usamos o fetchResponse.json para abrir a caixa com os dados, e ler o que esta dentro dela, usamos o await porque pode demorar, depois guardamos a resposta dentro de dealDetails

      // 6. EXIBIMOS NO CONSOLE (O SEU OBJETIVO!)
      console.log('--- 5.  DETALHES DO DEAL OBTIDOS! ---');
      console.log(JSON.stringify(dealDetails, null, 2)); //Se a gente só fizesse console.log(dealDetails), ele apareceria no log todo "espremido" numa linha só. O JSON.stringify com os parâmetros null, 2 é um truque de formatação! Ele transforma o objeto de volta em texto JSON, mas de um jeito "bonitinho", com quebras de linha e 2 espaços de indentação.
      
      // (Aqui é onde vamos colocar nosso INSERT INTO... amanhã!)
      // (Ex: await pool.query('INSERT INTO deals ...', [dealId, ...]))


    } catch (error) {
      console.log("Erro GIGANTE ao tentar fazer o 'fetch' para o Bitrix:", error);
    } // se qualquer coisa falhar la dentro do try, ele pula direto pra ca e mostra o erro, porem o servidor não quebra
    
    // ---  FIM DA SUA NOVA DEMANDA  ---

  } else {
    console.log("Nenhum 'event' encontrado nos dados recebidos.");
  } //Esse else é o par la do meu primeiro IF,  ele diz que se la na linha do IF não tiver nenhum evento, ele avisa para nós que o webhook veio vazio, e não faz mais nada
});

// 9. Ligamos o servidor!
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
}); //Esse é o comando final. É o "play" do servidor, a gente manda o app(servidor) ir para a garagem (a port que a gente definiu) e começar a LISTEN (escutar) por conexões(visitas na rota GET, ou webhooks na rota POST). 
// () => { ... }: Essa é a "função de callback" (a "função de aviso"). O Express promete executar ela assim que o servidor estiver 100% online e funcionando pronto para receber visitas