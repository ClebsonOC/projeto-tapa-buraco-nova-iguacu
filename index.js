const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { google } = require("googleapis");
const fs = require("fs");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public")); // Serve o frontend
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

const drive = google.drive({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

const FOLDER_ID = process.env.FOLDER_ID;
const SHEET_ID = process.env.SHEET_ID;

// 📂 Criar ou obter pasta no Google Drive
async function getOrCreateFolder(name, parentId) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const fileMetadata = {
    name: name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  };

  const file = await drive.files.create({
    resource: fileMetadata,
    fields: "id",
  });

  return file.data.id;
}

// 🔥 Endpoint principal
app.post("/api/salvar", upload.array("fotos"), async (req, res) => {
  try {
    const { rua, buracos } = JSON.parse(req.body.dados);
    const dataHoje = new Date().toLocaleDateString("pt-BR").replace(/\//g, ".");

    const pastaRua = await getOrCreateFolder(rua.toUpperCase(), FOLDER_ID);
    const pastaData = await getOrCreateFolder(dataHoje, pastaRua);

    const linksFotos = [];
    for (const file of req.files) {
      const fileMetadata = {
        name: file.originalname,
        parents: [pastaData],
      };
      const media = {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path),
      };
      const uploadedFile = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id, webViewLink",
      });
      linksFotos.push(uploadedFile.data.webViewLink);
      fs.unlinkSync(file.path); // Remove arquivo local após upload
    }

    const values = buracos.map((b) => [
      new Date().toLocaleString("pt-BR"),
      rua.toUpperCase(),
      b.identificador,
      b.largura,
      b.comprimento,
      b.espessura,
      linksFotos.join(", "),
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Página1!A1",
      valueInputOption: "USER_ENTERED",
      resource: { values },
    });

    res.json({
      message: "Dados salvos com sucesso! Fotos: " + linksFotos.length,
    });
  } catch (error) {
    console.error("Erro:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
