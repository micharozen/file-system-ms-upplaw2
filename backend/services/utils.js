const crypto = require('crypto');

// Récupération des variables d'environnement
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'votre-cle-de-chiffrement-32-caracteres'; // 32 bytes
const ENCRYPTION_IV = process.env.ENCRYPTION_IV || 'votre-iv-16-char'; // 16 bytes

// Configuration OAuth 2.0 de base
const baseAuthConfig = {
  clientId: process.env.MS_CLIENT_ID || 'b2b9881b-5418-4e4b-92a2-610d6f165471',
  tenantId: 'consumers',  // Pour accepter tous les comptes (professionnels et personnels)
  defaultRedirectUri: process.env.DEFAULT_REDIRECT_URI || 'http://localhost:8080', // URI de redirection par défaut
  scopes: [
    'User.Read',
    'Files.Read.All',    // Pour OneDrive
    'Files.ReadWrite.All',// Pour OneDrive
    'Sites.Read.All',    // Pour SharePoint (ignoré pour les comptes personnels)
    'offline_access'
  ]
};

/**
 * Déchiffre un token chiffré
 * @param {string} encryptedToken - Token chiffré
 * @returns {string} - Token déchiffré
 */
async function decryptTokens(encryptedToken) {
  try {
    // Convertir le token chiffré de base64 en buffer
    const encryptedText = Buffer.from(encryptedToken, 'base64');
    
    // Extraire l'IV (les 16 premiers octets)
    const iv = encryptedText.slice(0, 16);
    
    // Extraire le texte chiffré (le reste)
    const encryptedData = encryptedText.slice(16);
    
    // Créer le déchiffreur
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY),
      iv
    );
    
    // Déchiffrer
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // Convertir en chaîne de caractères
    return decrypted.toString();
  } catch (error) {
    console.error('Erreur lors du déchiffrement du token:', error);
    throw new Error('Impossible de déchiffrer le token');
  }
}

/**
 * Crée un client Microsoft Graph avec le token d'accès
 * @param {string} accessToken - Token d'accès Microsoft
 * @returns {Object} - Client Microsoft Graph
 */
function createGraphClient(accessToken) {
  return {
    baseUrl: 'https://graph.microsoft.com/v1.0',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };
}

/**
 * Obtient la configuration d'authentification avec l'URI de redirection spécifique
 * @param {string} redirectUri - URI de redirection spécifique au client (optionnel)
 * @returns {Object} - Configuration d'authentification
 */
function getAuthConfig(redirectUri) {
  return {
    ...baseAuthConfig,
    redirectUri: redirectUri || baseAuthConfig.defaultRedirectUri
  };
}

/**
 * Rafraîchit un token d'accès
 * @param {string} refreshToken - Token de rafraîchissement
 * @param {string} redirectUri - URI de redirection spécifique au client (optionnel)
 * @returns {Promise<string>} - Nouveau token d'accès
 */
async function refreshAccessToken(refreshToken, redirectUri) {
  const authConfig = getAuthConfig(redirectUri);
  
  const tokenEndpoint = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: authConfig.clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: authConfig.scopes.join(' '),
    redirect_uri: authConfig.redirectUri
  });

  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erreur lors du rafraîchissement du token: ${errorData.error_description || 'Erreur inconnue'}`);
    }

    const tokens = await response.json();
    return tokens.access_token;
  } catch (error) {
    console.error('Erreur lors du rafraîchissement du token:', error);
    throw error;
  }
}

module.exports = {
  decryptTokens,
  createGraphClient,
  getAuthConfig,
  refreshAccessToken
}; 