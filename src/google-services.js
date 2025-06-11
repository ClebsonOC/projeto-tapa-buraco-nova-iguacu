// src/google-services.js
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { removerAcentos } = require("./utils");

// --- SEÇÃO DE AUTENTICAÇÃO E INICIALIZAÇÃO ---
let authConfig;
const scopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];

if (
  process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
) {
  authConfig = { keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes };
  console.log(
    "Autenticação Google configurada via GOOGLE_APPLICATION_CREDENTIALS."
  );
} else if (fs.existsSync("credentials.json")) {
  authConfig = { keyFile: "credentials.json", scopes };
  console.log(
    "Autenticação Google configurada via arquivo credentials.json local."
  );
} else {
  console.error(
    "ERRO CRÍTICO: Arquivo de credenciais do Google não encontrado."
  );
  authConfig = { scopes };
}

const auth = new google.auth.GoogleAuth(authConfig);
const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

// --- SEÇÃO DE SERVIÇOS DO GOOGLE DRIVE ---

// Função interna para criar pastas
async function getOrCreateFolder(name, parentId) {
  if (!parentId)
    throw new Error("ID da pasta pai não fornecido para getOrCreateFolder.");
  const sanitizedName = name.trim().replace(/[\\/?%*:|"<>]/g, "_");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${sanitizedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });
  if (res.data.files.length > 0) return res.data.files[0].id;
  const fileMetadata = {
    name: sanitizedName,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  };
  const file = await drive.files.create({
    resource: fileMetadata,
    fields: "id",
  });
  return file.data.id;
}

// Função pública para upload
async function uploadFiles(files, rua, dataHoje) {
  if (!files || files.length === 0) return [];
  if (!config.FOLDER_ID)
    throw new Error("Configuração FOLDER_ID ausente no servidor.");

  const linksFotos = [];
  const nomesArquivosSalvosNaPasta = new Set();
  const pastaRuaId = await getOrCreateFolder(rua, config.FOLDER_ID);
  const nomePastaData = dataHoje
    .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .replace(/\//g, ".");
  const pastaDataId = await getOrCreateFolder(nomePastaData, pastaRuaId);

  for (const file of files) {
    let nomeArquivoFinal = file.originalname.replace(/[^\w\s\.\-]/gi, "_");
    let contador = 1;
    while (nomesArquivosSalvosNaPasta.has(nomeArquivoFinal)) {
      const nomeBase = path.parse(file.originalname).name;
      const extensao = path.parse(file.originalname).ext;
      nomeArquivoFinal = `${nomeBase}_${contador++}${extensao}`;
    }
    const fileMetadata = { name: nomeArquivoFinal, parents: [pastaDataId] };
    const media = {
      mimeType: file.mimetype,
      body: fs.createReadStream(file.path),
    };
    const uploadedFile = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: "id, webViewLink, name",
    });
    linksFotos.push(uploadedFile.data.webViewLink);
    nomesArquivosSalvosNaPasta.add(uploadedFile.data.name);
    fs.unlinkSync(file.path);
  }
  console.log(`${linksFotos.length} fotos salvas com sucesso.`);
  return linksFotos;
}

// --- SEÇÃO DE SERVIÇOS DO GOOGLE SHEETS ---
let cacheRuas = null,
  timestampCacheRuas = 0;
let cacheBairros = null,
  timestampCacheBairros = 0;

async function getRuasNovaIguacuComCache() {
  const agora = Date.now();
  if (cacheRuas && agora - timestampCacheRuas < config.CACHE_EXPIRATION_RUAS_MS)
    return cacheRuas;
  // ... restante da lógica de busca e cache de ruas ...
  if (!config.RUAS_MUNICIPIOS_SHEET_ID) {
    console.error("ERRO: RUAS_MUNICIPIOS_SHEET_ID não definido.");
    return [];
  }
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.RUAS_MUNICIPIOS_SHEET_ID,
    range: `'${config.NOME_ABA_DADOS_RUAS}'!A:Z`,
  });
  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];
  const cabecalho = rows[0].map(String);
  const idxMunicipio = cabecalho.indexOf(config.COLUNA_MUNICIPIO_DADOS_RUAS);
  const idxRua = cabecalho.indexOf(config.COLUNA_RUA_DADOS_RUAS);
  if (idxMunicipio === -1 || idxRua === -1) return [];

  const ruas = rows
    .slice(1)
    .filter(
      (row) =>
        row[idxMunicipio] &&
        row[idxMunicipio].toString().trim() ===
          config.MUNICIPIO_FILTRO_DADOS_RUAS
    )
    .map((row) => (row[idxRua] ? row[idxRua].toString().trim() : null))
    .filter((rua) => rua);

  cacheRuas = [...new Set(ruas)];
  timestampCacheRuas = Date.now();
  console.log(`${cacheRuas.length} ruas de NI salvas no cache.`);
  return cacheRuas;
}

async function getBairrosNovaIguacuComCache() {
  const agora = Date.now();
  if (
    cacheBairros &&
    agora - timestampCacheBairros < config.CACHE_EXPIRATION_BAIRROS_MS
  )
    return cacheBairros;
  // ... restante da lógica de busca e cache de bairros ...
  if (!config.RUAS_MUNICIPIOS_SHEET_ID) {
    console.error("ERRO: RUAS_MUNICIPIOS_SHEET_ID não definido.");
    return [];
  }
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.RUAS_MUNICIPIOS_SHEET_ID,
    range: `'${config.NOME_ABA_DADOS_BAIRROS}'!A:Z`,
  });
  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];
  const cabecalho = rows[0].map(String);
  const idxBairro = cabecalho.indexOf(config.COLUNA_BAIRRO_DADOS);
  if (idxBairro === -1) return [];

  const bairros = rows
    .slice(1)
    .map((row) => (row[idxBairro] ? row[idxBairro].toString().trim() : null))
    .filter((bairro) => bairro);

  cacheBairros = [...new Set(bairros)].sort();
  timestampCacheBairros = Date.now();
  console.log(`${cacheBairros.length} bairros de NI salvos no cache.`);
  return cacheBairros;
}

// Exporta as funções públicas
module.exports = {
  uploadFiles,
  getRuasNovaIguacuComCache,
  getBairrosNovaIguacuComCache,
};
