const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const config = require("./config");
// A linha duplicada 'const { removerAcentos }...' foi removida pois não era usada aqui.
// As linhas duplicadas 'const fs' e 'const path' foram removidas.

// --- SEÇÃO DE AUTENTICAÇÃO E INICIALIZAÇÃO ---
const auth = new google.auth.GoogleAuth({
    keyFile: "serviceAccountKey.json",
    scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });


// --- SEÇÃO DE SERVIÇOS DO GOOGLE DRIVE (Sem alterações) ---
async function getOrCreateFolder(name, parentId) {
    if (!parentId) throw new Error("ID da pasta pai não fornecido para getOrCreateFolder.");
    const sanitizedName = name.trim().replace(/[\\/?%*:|"<>]/g, "_");
    const res = await drive.files.list({
        q: `'${parentId}' in parents and name='${sanitizedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id, name)",
    });
    if (res.data.files.length > 0) return res.data.files[0].id;
    const fileMetadata = { name: sanitizedName, mimeType: "application/vnd.google-apps.folder", parents: [parentId] };
    const file = await drive.files.create({ resource: fileMetadata, fields: "id" });
    return file.data.id;
}
async function uploadFiles(files, rua, dataHoje) {
    if (!files || files.length === 0) return [];
    if (!config.FOLDER_ID) throw new Error("Configuração FOLDER_ID ausente no servidor.");
    const linksFotos = [];
    const nomesArquivosSalvosNaPasta = new Set();
    const pastaRuaId = await getOrCreateFolder(rua, config.FOLDER_ID);
    const nomePastaData = dataHoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(/\//g, ".");
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
        const media = { mimeType: file.mimetype, body: fs.createReadStream(file.path) };
        const uploadedFile = await drive.files.create({ resource: fileMetadata, media, fields: "id, webViewLink, name" });
        linksFotos.push(uploadedFile.data.webViewLink);
        nomesArquivosSalvosNaPasta.add(uploadedFile.data.name);
        fs.unlinkSync(file.path);
    }
    console.log(`${linksFotos.length} fotos salvas com sucesso.`);
    return linksFotos;
}


// --- SEÇÃO DE LEITURA DE DADOS (LOCAL) ---
let cacheRuas = null;
let cacheBairros = null;

async function getRuasNovaIguacuComCache() {
    if (cacheRuas) {
        return cacheRuas;
    }
    try {
        const filePath = path.join(__dirname, '..', 'data', 'Ruas.tsv');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');
        const header = lines[0].split('\t').map(h => h.trim());
        const idxRua = header.indexOf("Rua");
        const idxMunicipio = header.indexOf("Municipio");

        if (idxRua === -1 || idxMunicipio === -1) {
            console.error("Cabeçalho 'Rua' ou 'Municipio' não encontrado em Ruas.tsv");
            return [];
        }
        
        const todasRuasNI = lines.slice(1).map(line => {
            const columns = line.split('\t');
            if (columns[idxMunicipio] && columns[idxMunicipio].trim() === "Nova Iguaçu") {
                return columns[idxRua] ? columns[idxRua].trim() : null;
            }
            return null;
        }).filter(rua => rua);

        cacheRuas = [...new Set(todasRuasNI)];
        console.log(`${cacheRuas.length} ruas de NI carregadas do arquivo local Ruas.tsv.`);
        return cacheRuas;
    } catch (error) {
        console.error("Erro ao ler ou processar o arquivo Ruas.tsv:", error);
        cacheRuas = [];
        return [];
    }
}

async function getBairrosNovaIguacuComCache() {
    if (cacheBairros) {
        return cacheBairros;
    }
    try {
        const filePath = path.join(__dirname, '..', 'data', 'Bairros.tsv');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');
        const header = lines[0].split('\t').map(h => h.trim());
        const idxBairro = header.indexOf("Bairro");

        if (idxBairro === -1) {
            console.error("Cabeçalho 'Bairro' não encontrado em Bairros.tsv");
            return [];
        }

        const todosBairrosNI = lines.slice(1).map(line => {
            const columns = line.split('\t');
            return columns[idxBairro] ? columns[idxBairro].trim() : null;
        }).filter(bairro => bairro);

        cacheBairros = [...new Set(todosBairrosNI)].sort();
        console.log(`${cacheBairros.length} bairros de NI carregados do arquivo local Bairros.tsv.`);
        return cacheBairros;
    } catch (error) {
        console.error("Erro ao ler ou processar o arquivo Bairros.tsv:", error);
        cacheBairros = [];
        return [];
    }
}

// Exporta as funções públicas
module.exports = {
  uploadFiles,
  getRuasNovaIguacuComCache,
  getBairrosNovaIguacuComCache,
};