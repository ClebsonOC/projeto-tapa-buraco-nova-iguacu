// index.js

const express = require("express");
const cors = require("cors");
const apiRoutes = require("./src/routes"); // Importa o roteador central da pasta SRC
const { getRuasNovaIguacuComCache, getBairrosNovaIguacuComCache } = require("./src/google-services");

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

// Rota principal da API
// AQUI ESTÁ A MUDANÇA: Agora o app USA as rotas definidas em /src/routes.js
app.use("/api", apiRoutes);

// Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);

  // Pré-aquecimento dos caches (continua igual)
  getRuasNovaIguacuComCache();
  getBairrosNovaIguacuComCache();
});