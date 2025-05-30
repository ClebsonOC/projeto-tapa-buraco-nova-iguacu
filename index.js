const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// Autenticação Google
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

// IDs do arquivo .env (DEVEM SER APENAS OS IDs, NÃO URLs)
const FOLDER_ID = process.env.FOLDER_ID;
const SHEET_ID = process.env.SHEET_ID;  
const RUAS_MUNICIPIOS_SHEET_ID = process.env.RUAS_MUNICIPIOS_SHEET_ID;

// Configurações para busca de ruas
const NOME_ABA_DADOS_RUAS = 'LOGRADOUROS DE NOVA IGUAÇU'; // CONFIRME O NOME EXATO DA ABA
const COLUNA_MUNICIPIO_DADOS_RUAS = 'Municipio';    
const COLUNA_RUA_DADOS_RUAS = 'Rua';              
const MUNICIPIO_FILTRO_DADOS_RUAS = 'Nova Iguaçu';
const MAX_SUGESTOES_RUAS = 10;

// SIMULAÇÃO DE BANCO DE DADOS DE USUÁRIOS E ABAS
// EM PRODUÇÃO: NÃO USE SENHAS EM TEXTO PURO! USE HASHING (ex: bcrypt)
const usersDatabase = {
  "usuario1": { password: "senha1", sheetName: "DadosUsuario1" },
  "usuario2": { password: "senha2", sheetName: "DadosUsuario2" },
  "clebson": { password: "123", sheetName: "ClebsonDados" } 
  // Adicione mais usuários conforme necessário
};

// Função Utilitária para remover acentos
function removerAcentos(texto) {
  if (texto == null) return "";
  return texto.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Função para criar ou obter pasta no Google Drive
async function getOrCreateFolder(name, parentId) {
  if (!parentId) {
    console.error("Erro em getOrCreateFolder: parentId não pode ser nulo ou indefinido.");
    throw new Error("ID da pasta pai não fornecido para getOrCreateFolder.");
  }
  const sanitizedName = name.trim().replace(/[\\/?%*:|"<>]/g, '_'); 
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${sanitizedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.data.files.length > 0) {
    console.log(`Pasta encontrada: "${sanitizedName}" (ID: ${res.data.files[0].id})`);
    return res.data.files[0].id;
  }

  console.log(`Criando pasta: "${sanitizedName}" dentro de parent ID: ${parentId}`);
  const fileMetadata = {
    name: sanitizedName,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    fields: "id",
  });
  console.log(`Pasta criada: "${sanitizedName}" (ID: ${file.data.id})`);
  return file.data.id;
}

// Lógica de Cache para Ruas
let cacheRuasNovaIguacu = null;
let timestampCacheRuas = 0;
const CACHE_EXPIRATION_RUAS_MS = 3600 * 1000; 

async function getRuasNovaIguacuComCache() {
  const agora = Date.now();
  if (cacheRuasNovaIguacu && (agora - timestampCacheRuas < CACHE_EXPIRATION_RUAS_MS)) {
    console.log('Ruas de Nova Iguaçu carregadas do cache Node.js.');
    return cacheRuasNovaIguacu;
  }

  console.log('Cache de ruas Node.js vazio ou expirado. Lendo da planilha:', RUAS_MUNICIPIOS_SHEET_ID);
  if (!RUAS_MUNICIPIOS_SHEET_ID) {
    console.error('ERRO: RUAS_MUNICIPIOS_SHEET_ID não está definido no .env');
    return [];
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: RUAS_MUNICIPIOS_SHEET_ID,
      range: `'${NOME_ABA_DADOS_RUAS}'!A:Z`, 
    });

    const rows = res.data.values;
    if (!rows || rows.length < 2) {
      console.log(`Aba de dados de ruas '${NOME_ABA_DADOS_RUAS}' tem poucos dados ou não foi encontrada.`);
      cacheRuasNovaIguacu = []; 
      timestampCacheRuas = Date.now();
      return [];
    }

    const cabecalho = rows[0].map(String);
    const indiceColunaMunicipio = cabecalho.indexOf(COLUNA_MUNICIPIO_DADOS_RUAS);
    const indiceColunaRua = cabecalho.indexOf(COLUNA_RUA_DADOS_RUAS);

    if (indiceColunaMunicipio === -1 || indiceColunaRua === -1) {
      console.error(`ERRO: Colunas de Município ou Rua não encontradas na planilha de ruas. Cabeçalho: ${cabecalho.join(', ')}`);
      return [];
    }

    const todasRuasNI = [];
    for (let i = 1; i < rows.length; i++) {
      const municipioNaLinha = rows[i][indiceColunaMunicipio];
      const ruaNaLinha = rows[i][indiceColunaRua];
      if (municipioNaLinha && municipioNaLinha.toString().trim() === MUNICIPIO_FILTRO_DADOS_RUAS) {
        if (ruaNaLinha && ruaNaLinha.toString().trim() !== '') {
          todasRuasNI.push(ruaNaLinha.toString().trim());
        }
      }
    }
    
    cacheRuasNovaIguacu = [...new Set(todasRuasNI)];
    timestampCacheRuas = Date.now();
    console.log(cacheRuasNovaIguacu.length + ' ruas (únicas) de Nova Iguaçu salvas no cache Node.js.');
    return cacheRuasNovaIguacu;

  } catch (err) {
    console.error('Erro ao buscar ruas da planilha:', err.message);
     if (err.response && err.response.data && err.response.data.error) {
        console.error('Detalhes do erro da API Google:', JSON.stringify(err.response.data.error, null, 2));
    }
    return [];
  }
}

// Endpoint para buscar ruas (Autocomplete)
app.get("/api/buscar-ruas", async (req, res) => {
  try {
    const textoParcial = req.query.texto || "";
    if (textoParcial.trim().length < 2) {
      return res.json([]);
    }

    const todasRuasDeNovaIguacu = await getRuasNovaIguacuComCache();
    if (!todasRuasDeNovaIguacu || todasRuasDeNovaIguacu.length === 0) {
      return res.json([]);
    }

    const ruasEncontradas = [];
    const textoBuscaNormalizadoLower = removerAcentos(textoParcial).toLowerCase().trim();
    for (const ruaOriginal of todasRuasDeNovaIguacu) {
      const ruaNormalizadaLower = removerAcentos(ruaOriginal).toLowerCase();
      if (ruaNormalizadaLower.includes(textoBuscaNormalizadoLower)) {
        ruasEncontradas.push(ruaOriginal);
        if (ruasEncontradas.length >= MAX_SUGESTOES_RUAS) break;
      }
    }
    res.json(ruasEncontradas);
  } catch (error) {
    console.error("Erro em /api/buscar-ruas:", error);
    res.status(500).json({ error: "Erro ao buscar ruas." });
  }
});

// Endpoint de Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
  }

  const userKey = username.toLowerCase();
  const user = usersDatabase[userKey];

  if (user && user.password === password) { 
    console.log(`Usuário '${username}' logado com sucesso.`);
    res.json({ 
      message: "Login bem-sucedido!", 
      username: username 
    });
  } else {
    console.log(`Tentativa de login falhou para usuário: '${username}'`);
    res.status(401).json({ error: "Usuário ou senha inválidos." });
  }
});

// Endpoint principal para salvar dados e fotos
app.post("/api/salvar", upload.array("fotos"), async (req, res) => {
  try {
    if (!req.body.dados) {
        return res.status(400).json({ error: "Dados do formulário não recebidos." });
    }
    const { rua, buracos, condicaoTempo, username } = JSON.parse(req.body.dados); 
    
    if (!username) {
        console.log("Tentativa de salvar dados sem 'username' nos dados recebidos.");
        return res.status(403).json({ error: "Identificação do usuário ausente." });
    }

    const userKey = username.toLowerCase();
    if (!usersDatabase[userKey]) {
        console.log(`Tentativa de salvar dados por usuário inválido: '${username}'`);
        return res.status(403).json({ error: "Usuário inválido ou não autorizado." });
    }

    const userInfo = usersDatabase[userKey];
    const NOME_ABA_USUARIO_DESTINO = userInfo.sheetName;

    const dataHoje = new Date();
    const dataHoraRegistro = dataHoje.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    if (!rua || !buracos || buracos.length === 0) {
        return res.status(400).json({ error: "Dados inválidos: Rua e pelo menos um buraco são obrigatórios." });
    }

    const ruaParaSalvar = rua.toUpperCase().trim();
    const condicaoTempoParaSalvar = (condicaoTempo || "NÃO INFORMADO").toUpperCase();

    console.log(`Usuário '${username}' salvando dados para Rua: ${ruaParaSalvar}, Aba: ${NOME_ABA_USUARIO_DESTINO}`);

    const linksFotos = [];
    const nomesArquivosSalvosNaPasta = new Set();

    if (req.files && req.files.length > 0) {
      console.log(`Processando ${req.files.length} fotos para usuário '${username}'...`);
      if (!FOLDER_ID) {
          console.error('ERRO CRÍTICO: FOLDER_ID não está definido no .env. Impossível salvar fotos.');
          return res.status(500).json({ error: 'Configuração da pasta principal do Drive (FOLDER_ID) ausente no servidor.' });
      }
      
      const pastaRuaId = await getOrCreateFolder(ruaParaSalvar, FOLDER_ID); 
      if (!pastaRuaId) throw new Error('Falha ao criar/acessar pasta da rua no Drive para fotos.');
      
      const nomePastaData = dataHoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(/\//g, ".");
      const pastaDataId = await getOrCreateFolder(nomePastaData, pastaRuaId);
      if (!pastaDataId) throw new Error('Falha ao criar/acessar pasta da data no Drive para fotos.');

      for (const file of req.files) {
        let nomeArquivoOriginal = file.originalname.replace(/[^\w\s\.\-]/gi, '_');
        let nomeArquivoFinal = nomeArquivoOriginal;
        let contadorNomeArquivo = 1;
        while(nomesArquivosSalvosNaPasta.has(nomeArquivoFinal)) {
            const nomeBase = path.parse(nomeArquivoOriginal).name;
            const extensao = path.parse(nomeArquivoOriginal).ext;
            nomeArquivoFinal = `${nomeBase}_${contadorNomeArquivo}${extensao}`;
            contadorNomeArquivo++;
        }
        const fileMetadata = { name: nomeArquivoFinal, parents: [pastaDataId] };
        const media = { mimeType: file.mimetype, body: fs.createReadStream(file.path) };
        
        const uploadedFile = await drive.files.create({ resource: fileMetadata, media: media, fields: "id, webViewLink, name" });
        linksFotos.push(uploadedFile.data.webViewLink);
        nomesArquivosSalvosNaPasta.add(uploadedFile.data.name);
        fs.unlinkSync(file.path);
      }
      console.log(`${linksFotos.length} fotos salvas para usuário '${username}'.`);
    } else {
        console.log(`Nenhuma foto enviada para este registro do usuário '${username}'.`);
    }

    const cabecalhoPadrao = [['DATA', 'RUA', 'BURACO', 'LARGURA (m)', 'COMPRIMENTO (m)', 'ESPESSURA (cm)', 'CONDIÇÃO TEMPO', 'LINK']];
    const valuesParaPlanilha = buracos.map((b) => [
      dataHoraRegistro,                     
      ruaParaSalvar,                        
      b.identificador || `BURACO`,          
      String(b.largura).replace('.',','),   
      String(b.comprimento).replace('.',','),
      String(b.espessura).replace('.',','), 
      condicaoTempoParaSalvar,              
      linksFotos.join(", ")                  
    ]);

    if (!SHEET_ID) throw new Error('SHEET_ID (planilha de destino) não está definido no .env');

    const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' });
    const abaExiste = spreadsheetInfo.data.sheets.some(s => s.properties.title === NOME_ABA_USUARIO_DESTINO);

    if (!abaExiste) {
      console.log(`Aba '${NOME_ABA_USUARIO_DESTINO}' não encontrada para usuário '${username}'. Tentando criar...`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [{ addSheet: { properties: { title: NOME_ABA_USUARIO_DESTINO } } }]
        }
      });
      console.log(`Aba '${NOME_ABA_USUARIO_DESTINO}' criada com sucesso.`);
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: `'${NOME_ABA_USUARIO_DESTINO}'!A1`, valueInputOption: "USER_ENTERED",
        resource: { values: cabecalhoPadrao }
      });
      console.log(`Cabeçalho adicionado à nova aba '${NOME_ABA_USUARIO_DESTINO}'.`);
    } else {
      const rangeCabecalhoExistente = `'${NOME_ABA_USUARIO_DESTINO}'!A1:H1`;
      let precisaAdicionarCabecalho = true;
      try {
        const cabecalhoRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: rangeCabecalhoExistente });
        if (cabecalhoRes.data.values && cabecalhoRes.data.values.length > 0 && cabecalhoRes.data.values[0].length > 0) {
          if (JSON.stringify(cabecalhoRes.data.values[0]) === JSON.stringify(cabecalhoPadrao[0])) {
            precisaAdicionarCabecalho = false;
          } else {
             console.log("Cabeçalho existente na aba do usuário é diferente do padrão. Verifique a planilha. Não será adicionado novo cabeçalho.");
             precisaAdicionarCabecalho = false; 
          }
        }
      } catch (e) {
        console.log("Não foi possível ler o cabeçalho existente da aba do usuário, assumindo que precisa ser adicionado.", e.message);
      }
      
      if (precisaAdicionarCabecalho) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `'${NOME_ABA_USUARIO_DESTINO}'!A1`, valueInputOption: "USER_ENTERED",
          resource: { values: cabecalhoPadrao }
        });
        console.log(`Cabeçalho adicionado à aba existente '${NOME_ABA_USUARIO_DESTINO}'.`);
      }
    }
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `'${NOME_ABA_USUARIO_DESTINO}'!A1`, valueInputOption: "USER_ENTERED",
      resource: { values: valuesParaPlanilha },
    });

    const msgSucesso = `${valuesParaPlanilha.length} registro(s) salvo(s) para "${ruaParaSalvar}" na aba de ${username}. Fotos enviadas: ${linksFotos.length}.`;
    console.log(msgSucesso);
    res.json({ message: msgSucesso });

  } catch (error) {
    const userFromRequest = req.body.dados ? JSON.parse(req.body.dados).username : "desconhecido";
    console.error(`Erro detalhado no /api/salvar para usuário '${userFromRequest}':`, error.stack || error.message || error);
    res.status(500).json({ error: error.message || "Erro interno desconhecido no servidor ao salvar." });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  getRuasNovaIguacuComCache().then(ruas => {
    if (ruas.length > 0) {
      console.log(`Cache de ruas pré-carregado: ${ruas.length} ruas encontradas.`);
    } else {
      console.log("Não foi possível pré-carregar o cache de ruas na inicialização.");
    }
  }).catch(err => {
      console.error("Erro ao pré-carregar cache de ruas:", err);
  });
});