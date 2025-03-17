/**
 * Fonctions utilitaires pour l'application
 */

/**
 * Obtient la configuration d'authentification Microsoft
 * @param {string} redirectUri - URI de redirection
 * @returns {Object} - Configuration d'authentification
 */
function getAuthConfig(redirectUri) {
  return {
    clientId: process.env.MS_CLIENT_ID,
    tenantId: 'consumers',
    redirectUri: redirectUri,
    scopes: [
      'Files.ReadWrite.All',
      'Sites.ReadWrite.All',
      'User.Read',
      'offline_access'
    ]
  };
}

/**
 * Déchiffre un token
 * @param {string} token - Token à déchiffrer
 * @returns {string} - Token déchiffré
 */
function decryptTokens(token) {
  // Dans cette version simplifiée, nous retournons simplement le token
  // car nous n'utilisons plus de chiffrement
  return token;
}

module.exports = {
  getAuthConfig,
  decryptTokens
}; 