// src/utils.js

/**
 * Remove acentuação de uma string.
 * @param {string} texto O texto para normalizar.
 * @returns {string} O texto sem acentos.
 */
function removerAcentos(texto) {
  if (texto == null) return "";
  return texto
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

module.exports = {
  removerAcentos,
};
