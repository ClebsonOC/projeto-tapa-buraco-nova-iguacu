// src/firebase-init.js

const admin = require("firebase-admin");

// Carrega o arquivo de credenciais que você colocou na raiz do projeto
const serviceAccount = require("../serviceAccountKey.json");

// Inicializa o SDK do Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Exporta o serviço do Firestore para ser usado em outros arquivos
const firestore = admin.firestore();

module.exports = {
  firestore,
  admin,
};
