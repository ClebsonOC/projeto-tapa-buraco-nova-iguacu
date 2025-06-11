// src/routes.js

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid"); // Para gerar IDs únicos de submissão

const config = require("./config");
const utils = require("./utils");
const google = require("./google-services");
const { firestore } = require("./firebase-init"); // Importa o Firestore inicializado

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// As rotas de login e busca de dados permanecem as mesmas
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
  }
  const userKey = username.toLowerCase();
  const user = config.USERS_DATABASE[userKey];
  if (user && user.password === password) {
    res.json({ message: "Login bem-sucedido!", username: username });
  } else {
    res.status(401).json({ error: "Usuário ou senha inválidos." });
  }
});

router.get("/buscar-ruas", async (req, res) => {
  try {
    const textoParcial = req.query.texto || "";
    if (textoParcial.trim().length < 2) return res.json([]);
    const todasRuas = await google.getRuasNovaIguacuComCache();
    const ruasEncontradas = [];
    const textoBusca = utils.removerAcentos(textoParcial).toLowerCase().trim();
    for (const rua of todasRuas) {
      if (utils.removerAcentos(rua).toLowerCase().includes(textoBusca)) {
        ruasEncontradas.push(rua);
        if (ruasEncontradas.length >= config.MAX_SUGESTOES_RUAS) break;
      }
    }
    res.json(ruasEncontradas);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar ruas." });
  }
});

router.get("/buscar-bairros", async (req, res) => {
  try {
    res.json(await google.getBairrosNovaIguacuComCache());
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar bairros." });
  }
});

// Endpoint /salvar atualizado para a nova lógica com Firestore
router.post("/salvar", upload.array("fotos"), async (req, res) => {
  try {
    // Validação de dados e usuário
    if (!req.body.dados)
      return res
        .status(400)
        .json({ error: "Dados do formulário não recebidos." });
    const { rua, bairro, buracos, condicaoTempo, username } = JSON.parse(
      req.body.dados
    );
    const userInfo = config.USERS_DATABASE[username.toLowerCase()];
    if (!userInfo)
      return res
        .status(403)
        .json({ error: "Usuário inválido ou não autorizado." });
    if (!rua || !bairro || !buracos || buracos.length === 0)
      return res.status(400).json({ error: "Dados obrigatórios ausentes." });

    // 1. Envio das fotos para o Google Drive (lógica antiga mantida)
    const dataHoje = new Date();
    const linksDasFotosNoDrive = await google.uploadFiles(
      req.files,
      rua,
      dataHoje
    );
    console.log(`Fotos salvas no Google Drive: ${linksDasFotosNoDrive.length}`);

    // 2. Preparação e salvamento dos dados no Firestore
    const submissionId = uuidv4(); // Gera um ID único para este grupo de buracos
    const batch = firestore.batch(); // Otimização: prepara um lote de escritas

    for (const b of buracos) {
      const dadosParaFirestore = {
        submissionId: submissionId,
        identificadorBuraco: b.identificador,
        rua: rua.toUpperCase().trim(),
        bairro: bairro.toUpperCase().trim(),
        dimensoes: {
          largura: String(b.largura).replace(".", ","),
          comprimento: String(b.comprimento).replace(".", ","),
          espessura: String(b.espessura).replace(".", ","),
        },
        condicaoTempo: (condicaoTempo || "NÃO INFORMADO").toUpperCase(),
        fotosDriveLinks: linksDasFotosNoDrive,
        registradoPor: username,
        registradoEm: dataHoje,
        status: "REPORTADO",
      };

      const novoBuracoRef = firestore.collection("buracos").doc();
      batch.set(novoBuracoRef, dadosParaFirestore);
    }

    // 3. Executa o lote, salvando todos os documentos de uma vez no Firestore
    await batch.commit();

    const msgSucesso = `${buracos.length} registro(s) salvo(s) com sucesso no Firebase para o usuário ${username}.`;
    console.log(msgSucesso);
    res.json({ message: msgSucesso });
  } catch (error) {
    console.error(`Erro detalhado no /api/salvar:`, error);
    res
      .status(500)
      .json({
        error:
          error.message || "Erro interno desconhecido no servidor ao salvar.",
      });
  }
});

module.exports = router;
