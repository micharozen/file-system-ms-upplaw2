const crypto = require('crypto');

// Récupération des variables d'environnement
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes
const ENCRYPTION_IV = process.env.ENCRYPTION_IV; // 16 bytes
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
 * @returns {Promise<string>} - Token déchiffré
 */
async function decrypt(data) {
  try {
    const key = ENCRYPTION_KEY;
    const iv = ENCRYPTION_IV;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex")
    );
    const encryptedData = data.slice(0, -32);
    const authTag = data.slice(-32);
    decipher.setAuthTag(Buffer.from(authTag, "hex"));
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error('Erreur lors du déchiffrement:', error);
    throw error;
  }
}

/**
 * Chiffre une chaîne de caractères
 * @param {string} data - Données à chiffrer
 * @returns {Promise<string>} - Données chiffrées
 */
async function encrypt(data) {
  try {
    const key = ENCRYPTION_KEY;
    const iv = ENCRYPTION_IV;
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex")
    );
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return encrypted + authTag;
  } catch (error) {
    console.error('Erreur lors du chiffrement:', error);
    throw error;
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
  decrypt,
  createGraphClient,
  getAuthConfig,
  refreshAccessToken,
  encrypt
}; 