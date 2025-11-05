# 🚀 Projeto de Integração: Bitrix24 -> Node.js -> BI

Este projeto é um servidor *middleware* construído em Node.js e Express, projetado para atuar como uma ponte de dados em tempo real entre o **Bitrix24** e futuras ferramentas de **Business Intelligence (BI)**.

---

## 🎯 Objetivo Principal

O objetivo final deste projeto é **armazenar os dados** detalhados que são obtidos dos deals do Bitrix24.

Atualmente, os dados são capturados e exibidos no console (logs). O próximo passo é estruturar e salvar esses dados em um banco de dados. A partir desse armazenamento, os dados serão consumidos por uma ferramenta de **BI (como o Power BI, BI Builder, entre outras...)** para a criação de **dashboards** e relatórios analíticos de performance.

---

## 🤖 Como Funciona o Fluxo

O *pipeline* de dados opera em algumas etapas principais:

1.  **Notificação (Webhook de Saída):** O Bitrix24 é configurado para disparar um Webhook de Saída (ex: `ONCRMDEALUPDATE`) para a rota `/` do servidor sempre que um deal é modificado.
2.  **Confirmação Imediata:** O servidor recebe a notificação, extrai os dados básicos (como o `ID` do deal) e responde **imediatamente** com um `Status 200 (OK)` para o Bitrix. Isso evita timeouts e o reenvio duplicado de webhooks.
3.  **Busca Detalhada (Webhook de Entrada):** Com o `ID` em mãos, o servidor (de forma assíncrona) faz uma chamada `fetch` para o Webhook de Entrada do Bitrix (usando o método `crm.deal.get`).
4.  **Processamento (O Futuro):** A resposta (um JSON com todos os detalhes do deal) é então processada. O objetivo é que essa etapa, futuramente, salve os dados em um banco de dados para análise.

---

## 🛠️ Tecnologias Utilizadas

* **Core:** Node.js
* **Servidor:** Express.js
* **Segurança:** `dotenv` para gerenciamento de variáveis de ambiente (protegendo a URL do webhook).
* **Banco de Dados:** Feito com PostgreSQL hospedado na SquareCloud 
* **Fonte de Dados:** Bitrix24 (REST API & Webhooks)
* **Hospedagem:** Square Cloud
* **Ambiente Dev:** NVM (Node Version Manager)
* **IDE:** VS Code (Visual Studio Code)

### 🔐 Segurança

A URL do Webhook de Entrada (que contém a chave secreta) não está exposta no código. Ela é carregada com segurança através de um arquivo `.env` (ignorado pelo `.gitignore`) em desenvolvimento e configurada como **Variável de Ambiente** na Square Cloud em produção.