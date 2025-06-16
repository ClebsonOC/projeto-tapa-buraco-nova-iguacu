const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const config = require("./config");
const utils = require("./utils");
const google = require("./google-services");
// MODIFICADO: Importar 'admin' para usar FieldValue para unir arrays de fotos
const { firestore, admin } = require("./firebase-init");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// --- ROTAS DE AUTENTICAÇÃO E BUSCA ---
router.post("/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Usuário e senha são obrigatórios." });
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

// --- ROTA DE CRIAÇÃO (CREATE) ---
router.post("/salvar", upload.array("fotos"), async (req, res) => {
    try {
        if (!req.body.dados) return res.status(400).json({ error: "Dados do formulário não recebidos." });
        const { rua, bairro, buracos, condicaoTempo, username } = JSON.parse(req.body.dados);
        const userInfo = config.USERS_DATABASE[username.toLowerCase()];
        if (!userInfo) return res.status(403).json({ error: "Usuário inválido ou não autorizado." });
        if (!rua || !bairro || !buracos || buracos.length === 0) return res.status(400).json({ error: "Dados obrigatórios ausentes." });

        const dataHoje = new Date();
        const linksDasFotosNoDrive = await google.uploadFiles(req.files, rua, dataHoje);
        const submissionId = uuidv4();
        const batch = firestore.batch();
        for (const b of buracos) {
            const dadosParaFirestore = {
                submissionId: submissionId,
                identificadorBuraco: b.identificador,
                rua: rua.toUpperCase().trim(),
                bairro: bairro.toUpperCase().trim(),
                dimensoes: { largura: String(b.largura).replace(".", ","), comprimento: String(b.comprimento).replace(".", ","), espessura: String(b.espessura).replace(".", ",") },
                condicaoTempo: (condicaoTempo || "NÃO INFORMADO").toUpperCase(),
                fotosDriveLinks: linksDasFotosNoDrive,
                registradoPor: username,
                registradoEm: dataHoje,
            };
            const novoBuracoRef = firestore.collection("buracos").doc();
            batch.set(novoBuracoRef, dadosParaFirestore);
        }
        await batch.commit();
        res.json({ message: `${buracos.length} registro(s) salvo(s) com sucesso no Firebase.` });
    } catch (error) {
        res.status(500).json({ error: error.message || "Erro interno ao salvar." });
    }
});

// --- ROTAS DE LEITURA, ATUALIZAÇÃO E DELEÇÃO ---

// LER (Read): Busca buracos com filtros
router.get("/buracos", async (req, res) => {
    try {
        const { usuario, rua } = req.query;
        let query = firestore.collection('buracos');

        if (usuario) query = query.where('registradoPor', '==', usuario);
        if (rua) query = query.where('rua', '>=', rua.toUpperCase()).where('rua', '<=', rua.toUpperCase() + '\uf8ff');

        const snapshot = await query.orderBy('registradoEm', 'desc').get();
        
        if (snapshot.empty) return res.status(200).json([]);

        const buracosList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(buracosList);
    } catch (error) {
        if (error.code === 9) {
             return res.status(400).json({ 
                error: "A consulta requer um índice no Firestore. Verifique o console do Node.js para o link de criação.",
                details: error.details 
            });
        }
        res.status(500).json({ error: "Não foi possível buscar os registros." });
    }
});

// ATUALIZAR DIMENSÕES (Update): Altera as dimensões de um ÚNICO buraco.
router.patch("/buracos/dimensoes/:docId", async (req, res) => {
    try {
        const { docId } = req.params;
        const { dimensoes } = req.body;
        if (!docId || !dimensoes) return res.status(400).json({ error: "ID do documento e dimensões são obrigatórios." });

        const buracoRef = firestore.collection('buracos').doc(docId);
        const doc = await buracoRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: "Registro não encontrado." });
        }

        const dataRegistro = doc.data().registradoEm.toDate();
        const hoje = new Date();
        dataRegistro.setHours(0, 0, 0, 0);
        hoje.setHours(0, 0, 0, 0);

        if (dataRegistro.getTime() < hoje.getTime()) {
            return res.status(403).json({ error: "Ação não permitida. Registros só podem ser alterados no mesmo dia da criação." });
        }

        await buracoRef.update({ dimensoes });
        res.status(200).json({ message: `Dimensões do registro ${docId} atualizadas.` });
    } catch (error) {
        res.status(500).json({ error: "Não foi possível atualizar as dimensões." });
    }
});

// DELETAR SUBMISSÃO (Delete): Remove TODOS os buracos de uma mesma submissão.
router.delete("/buracos/submission/:submissionId", async (req, res) => {
    try {
        const { submissionId } = req.params;
        if (!submissionId) return res.status(400).json({ error: "ID da submissão é obrigatório." });

        const snapshot = await firestore.collection('buracos').where('submissionId', '==', submissionId).limit(1).get();
        if (snapshot.empty) {
            return res.status(404).json({ error: "Visita não encontrada." });
        }

        const primeiroDoc = snapshot.docs[0];
        const dataRegistro = primeiroDoc.data().registradoEm.toDate();
        const hoje = new Date();
        dataRegistro.setHours(0, 0, 0, 0);
        hoje.setHours(0, 0, 0, 0);

        if (dataRegistro.getTime() < hoje.getTime()) {
            return res.status(403).json({ error: "Ação não permitida. A visita só pode ser deletada no mesmo dia da criação." });
        }

        const todosDocsDaVisita = await firestore.collection('buracos').where('submissionId', '==', submissionId).get();
        const batch = firestore.batch();
        todosDocsDaVisita.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        res.status(200).json({ message: `Visita ${submissionId} e todos os seus registros foram deletados.` });
    } catch (error) {
        res.status(500).json({ error: "Não foi possível deletar a visita." });
    }
});

// NOVO: Adicionar fotos a uma visita existente
router.patch("/buracos/fotos/:submissionId", upload.array("fotos"), async (req, res) => {
    try {
        const { submissionId } = req.params;
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: "Nenhuma foto foi enviada." });
        }

        const visitaSnapshot = await firestore.collection('buracos').where('submissionId', '==', submissionId).get();
        if (visitaSnapshot.empty) {
            return res.status(404).json({ error: "Visita não encontrada." });
        }

        const primeiroDocData = visitaSnapshot.docs[0].data();
        const dataRegistro = primeiroDocData.registradoEm.toDate();
        const hoje = new Date();
        dataRegistro.setHours(0, 0, 0, 0);
        hoje.setHours(0, 0, 0, 0);

        if (dataRegistro.getTime() < hoje.getTime()) {
            return res.status(403).json({ error: "Não é possível adicionar fotos a visitas de dias anteriores." });
        }

        const linksNovasFotos = await google.uploadFiles(req.files, primeiroDocData.rua, primeiroDocData.registradoEm.toDate());
        if (linksNovasFotos.length === 0) {
            return res.status(500).json({ error: "Falha ao fazer upload das fotos para o Drive." });
        }

        const batch = firestore.batch();
        visitaSnapshot.docs.forEach(doc => {
            const docRef = firestore.collection('buracos').doc(doc.id);
            batch.update(docRef, {
                fotosDriveLinks: admin.firestore.FieldValue.arrayUnion(...linksNovasFotos)
            });
        });

        await batch.commit();
        res.status(200).json({ message: "Fotos adicionadas com sucesso!" });

    } catch (error) {
        console.error("Erro ao adicionar novas fotos:", error);
        res.status(500).json({ error: "Erro interno ao adicionar novas fotos." });
    }
});

// --- ROTAS DE EFETIVO ---
router.post("/efetivo", async (req, res) => {
    try {
        const { registradoPor, itensPresentes, observacao } = req.body;
        if (!registradoPor || !itensPresentes) {
            return res.status(400).json({ error: "Usuário e lista de presentes são obrigatórios." });
        }
        const inicioDoDia = new Date();
        inicioDoDia.setHours(0, 0, 0, 0);
        const fimDoDia = new Date();
        fimDoDia.setHours(23, 59, 59, 999);
        const snapshot = await firestore.collection('efetivo')
            .where('registradoPor', '==', registradoPor)
            .where('registradoEm', '>=', inicioDoDia)
            .where('registradoEm', '<=', fimDoDia)
            .get();
        if (!snapshot.empty) {
            return res.status(409).json({ error: "Já existe um registro de efetivo para este usuário hoje." });
        }
        const novoEfetivo = {
            registradoPor,
            registradoEm: new Date(),
            itensPresentes,
            observacao: observacao || ""
        };
        await firestore.collection('efetivo').add(novoEfetivo);
        res.status(201).json({ message: "Efetivo salvo com sucesso!" });
    } catch (error) {
        console.error("ERRO DETALHADO NO POST /api/efetivo:", error);
        res.status(500).json({ error: "Erro interno no servidor ao salvar o efetivo.", details: error.message });
    }
});
router.get("/efetivo", async (req, res) => {
    try {
        const { usuario } = req.query;
        if (!usuario) return res.status(400).json({ error: "Nome de usuário é obrigatório." });
        const snapshot = await firestore.collection('efetivo')
            .where('registradoPor', '==', usuario)
            .orderBy('registradoEm', 'desc')
            .get();
        const historico = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(historico);
    } catch (error) {
        console.error("ERRO DETALHADO NO GET /api/efetivo:", error);
        res.status(500).json({ error: "Erro ao buscar histórico de efetivo.", details: error.message });
    }
});
router.patch("/efetivo/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { itensPresentes, observacao } = req.body;
        const docRef = firestore.collection('efetivo').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: "Registro não encontrado." });
        const dataRegistro = doc.data().registradoEm.toDate();
        const hoje = new Date();
        dataRegistro.setHours(0, 0, 0, 0);
        hoje.setHours(0, 0, 0, 0);
        if (dataRegistro.getTime() < hoje.getTime()) {
            return res.status(403).json({ error: "Não é possível alterar registros de dias anteriores." });
        }
        await docRef.update({ itensPresentes, observacao });
        res.status(200).json({ message: "Efetivo atualizado com sucesso!" });
    } catch (error) {
        console.error(`ERRO DETALHADO NO PATCH /api/efetivo/${req.params.id}:`, error);
        res.status(500).json({ error: "Erro ao atualizar o efetivo.", details: error.message });
    }
});

module.exports = router;