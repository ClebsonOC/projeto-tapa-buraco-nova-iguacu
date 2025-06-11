// src/config.js
require("dotenv").config();

// Credenciais e IDs
const FOLDER_ID = process.env.FOLDER_ID;
const SHEET_ID = process.env.SHEET_ID;
const RUAS_MUNICIPIOS_SHEET_ID = process.env.RUAS_MUNICIPIOS_SHEET_ID;

// Configurações da Planilha de Ruas e Bairros
const NOME_ABA_DADOS_RUAS = "LOGRADOUROS DE NOVA IGUAÇU";
const COLUNA_MUNICIPIO_DADOS_RUAS = "Municipio";
const COLUNA_RUA_DADOS_RUAS = "Rua";
const MUNICIPIO_FILTRO_DADOS_RUAS = "Nova Iguaçu";
const MAX_SUGESTOES_RUAS = 10;

const NOME_ABA_DADOS_BAIRROS = "BAIRROS DE NOVA IGUAÇU";
const COLUNA_BAIRRO_DADOS = "Bairro";

// Configurações de Cache
const CACHE_EXPIRATION_RUAS_MS = 3600 * 1000; // 1 hora
const CACHE_EXPIRATION_BAIRROS_MS = 3600 * 1000 * 24; // 24 horas

// Simulação de Banco de Dados de Usuários
const USERS_DATABASE = {
  usuario1: { password: "senha1", sheetName: "DadosUsuario1" },
  usuario2: { password: "senha2", sheetName: "DadosUsuario2" },
  clebson: { password: "123", sheetName: "ClebsonDados" },
};

// Cabeçalho Padrão para as Planilhas
const CABECALHO_PADRAO = [
  [
    "DATA",
    "RUA",
    "BAIRRO",
    "BURACO",
    "LARGURA (m)",
    "COMPRIMENTO (m)",
    "ESPESSURA (cm)",
    "CONDIÇÃO TEMPO",
    "LINK",
  ],
];

module.exports = {
  FOLDER_ID,
  SHEET_ID,
  RUAS_MUNICIPIOS_SHEET_ID,
  NOME_ABA_DADOS_RUAS,
  COLUNA_MUNICIPIO_DADOS_RUAS,
  COLUNA_RUA_DADOS_RUAS,
  MUNICIPIO_FILTRO_DADOS_RUAS,
  MAX_SUGESTOES_RUAS,
  NOME_ABA_DADOS_BAIRROS,
  COLUNA_BAIRRO_DADOS,
  CACHE_EXPIRATION_RUAS_MS,
  CACHE_EXPIRATION_BAIRROS_MS,
  USERS_DATABASE,
  CABECALHO_PADRAO,
};
