const express = require('express');
const router = express.Router();
const { getAuthConfig } = require('./utils');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

/**
 * Classe pour gérer l'authentification et les tokens
 */
class AuthManager {
  constructor() {
    this.secretManager = new SecretManagerServiceClient();
  }

  /**
   * Vérifie si un token est expiré
   * @param {string} secretName - Nom du secret
   * @returns {boolean} - True si expiré, false sinon
   */
  async isTokenExpired(secretName) {
    try {
      const [version] = await this.secretManager.accessSecretVersion({
        name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}/versions/latest`,
      });

      // Extraire les données du secret
      const secretData = JSON.parse(version.payload.data.toString('utf8'));
      console.log('secretData', secretData);
      const expiryDate = secretData.expiryDate;
      
      if (!expiryDate) return true; // Si pas de date d'expiration, considérer comme expiré
      
      const now = Date.now();
      // Ajouter 10 secondes de marge
      return now >= (expiryDate - 10000); // 10000ms = 10sec
    } catch (error) {
      console.error(`Error checking token expiration for ${secretName}:`, error);
      return true; // En cas d'erreur, considérer comme expiré
    }
  }

  /**
   * Accède à un secret
   * @param {string} reqSecretName - Nom du secret
   * @param {string} tokenType - Type de token (accessToken ou refreshToken)
   * @returns {string} - Valeur du token
   */
  async accessSecret(reqSecretName, tokenType = 'accessToken') {
    if (!reqSecretName) {
      throw new Error("Secret name is required");
    }

    // Access the secret
    const [version] = await this.secretManager.accessSecretVersion({
      name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${reqSecretName}/versions/latest`,
    });

    // Extract the payload as a string and parse it
    const secretData = JSON.parse(version.payload.data.toString('utf8'));
    console.log('secretData', secretData);
    return secretData[tokenType]; // Retourne le token demandé
  }

  /**
   * Met à jour un token
   * @param {Object} req - Requête avec les données du token
   * @returns {Object} - Résultat de la mise à jour
   */
  async updateToken(req) {
    const {sfEnvironment, sfOrgId, accessToken, refreshToken, expiresIn } = req.body;
    
    // Nettoyer l'environnement et l'ID de l'organisation pour créer un ID de secret valide
    const cleanEnvironment = sfEnvironment.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    const cleanOrgId = sfOrgId.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    const secretName = `ms_tokens_${cleanEnvironment}_${cleanOrgId}`;
    
    try {
      const parent = `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}`;
      
      // Initialiser les variables d'expiration
      let expiryTimestamp = null;
      let expiryDateReadable = null;

      // Calculer la date d'expiration seulement si expiresIn existe
      if (expiresIn) {
        expiryTimestamp = Date.now() + (expiresIn * 1000);
        expiryDateReadable = new Date(expiryTimestamp).toISOString();
      }

      // Créer l'objet à stocker avec les deux tokens
      const secretData = {
        accessToken: accessToken,
        refreshToken: refreshToken || null,
        expiryDate: expiryTimestamp,
        expiryDateReadable: expiryDateReadable
      };

      // Vérifier si le secret existe déjà
      try {
        await this.secretManager.getSecret({ name: parent });
      } catch (error) {
        // Le secret n'existe pas, le créer automatiquement
        if (error.code === 5) { // 5 = NOT_FOUND
          await this.secretManager.createSecret({
            parent: `projects/${process.env.GCP_PROJECT_ID}`,
            secretId: secretName,
            secret: {
              replication: {
                automatic: {}
              },
              labels: {
                environment: cleanEnvironment,
                type: 'ms_tokens'
              }
            }
          });
        } else {
          throw error;  // Propager l'erreur
        }
      }
      
      // Ajouter la nouvelle version du secret
      const [version] = await this.secretManager.addSecretVersion({
        parent: parent,
        payload: {
          data: Buffer.from(JSON.stringify(secretData), 'utf8'),
        },
      });
      
      return { 
        success: true,
        message: "Tokens updated successfully",
        version: version.name,
        expiryDate: expiryTimestamp
      };

    } catch (error) {
      console.error(`Error updating tokens ${secretName}:`, error);
      throw error;  // Propager l'erreur
    }
  }

  /**
   * Rafraîchit le token d'accès en utilisant le refresh token
   * @param {string} secretName - Nom du secret
   * @returns {Promise<Object>} - Nouveau token d'accès et sa date d'expiration
   */
  async refreshToken(secretName) {
    try {
      // Récupérer le refresh token
      const [version] = await this.secretManager.accessSecretVersion({
        name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}/versions/latest`,
      });
      const secretData = JSON.parse(version.payload.data.toString('utf8'));
      const refreshToken = secretData.refreshToken;

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      // Obtenir la configuration d'authentification
      const authConfig = getAuthConfig(process.env.REDIRECT_URI);
      const tokenEndpoint = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/token`;

      // Préparer la requête de rafraîchissement
      const params = new URLSearchParams({
        client_id: authConfig.clientId,
        client_secret: process.env.MS_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: authConfig.scopes.join(' ')
      });

      // Faire la requête pour obtenir un nouveau token
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Token refresh failed: ${JSON.stringify(errorData)}`);
      }

      const tokens = await response.json();
      console.log('tokens', tokens);
      // Calculer la nouvelle date d'expiration
      const expiryTimestamp = Date.now() + (tokens.expires_in * 1000);

      await this.updateToken({
        body: {
          secretName: secretName,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in
        }
      });

      return {
        accessToken: tokens.access_token,
        expiryDate: expiryTimestamp
      };
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }
}

// Créer une instance de AuthManager
const authManager = new AuthManager();

// Endpoint pour obtenir l'URL d'authentification
router.post('/auth-url', (req, res) => {
  const { redirectUri } = req.body;
  console.log(redirectUri);
  const authConfig = getAuthConfig(redirectUri);
  
  const authUrl = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${authConfig.clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(authConfig.redirectUri)}` +
    `&scope=${encodeURIComponent(authConfig.scopes.join(' '))}` +
    `&prompt=consent`;
  
  res.json({ url: authUrl });
});

// Endpoint pour échanger le code contre des tokens
router.post('/get-access-token', async (req, res) => {
  const { code, redirectUri } = req.body;
  const sfEnvironment = req.headers['x-salesforce-environment'] || 'unknown';
  const sfOrgId = req.headers['x-salesforce-organization-id'] || 'unknown';
  
  if (!code) {
    return res.status(400).json({ error: 'Code d\'autorisation manquant' });
  }
  
  try {
    const authConfig = getAuthConfig(redirectUri);
    const tokenEndpoint = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: authConfig.clientId,
      client_secret: process.env.MS_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: authConfig.redirectUri,
      scope: authConfig.scopes.join(' ')
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Erreur de token:', errorData);
      return res.status(response.status).json({ 
        error: 'Erreur lors de l\'authentification',
        details: errorData
      });
    }

    const tokens = await response.json();
    console.log('tokens', tokens);
    // Stocker les tokens dans Secret Manager
    const updateResult = await authManager.updateToken({
      body: {
        sfEnvironment,
        sfOrgId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in
      }
    });

    res.json({
      success: true,
      message: "Tokens stored successfully",
      expiryDate: updateResult.expiryDate
    });
  } catch (error) {
    console.error('Erreur lors de l\'obtention des tokens:', error);
    res.status(500).json({ error: 'Erreur lors de l\'authentification' });
  }
});

// Endpoint pour rafraîchir le token
router.post('/get-access-token-with-refresh-token', async (req, res) => {
  const { redirectUri } = req.body;
  const sfEnvironment = req.headers['x-salesforce-environment'] || 'unknown';
  const sfOrgId = req.headers['x-salesforce-organization-id'] || 'unknown';
  const secretName = `ms-tokens-${sfEnvironment}-${sfOrgId}`;
  
  try {
    // Vérifier si le token est expiré
    const isExpired = await authManager.isTokenExpired(secretName);
    if (!isExpired) {
      const accessToken = await authManager.accessSecret(secretName, 'accessToken');
      return res.json({
        success: true,
        access_token: accessToken
      });
    }

    // Si expiré, utiliser le refresh token
    const refreshToken = await authManager.accessSecret(secretName, 'refreshToken');
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token non trouvé' });
    }

    const authConfig = getAuthConfig(redirectUri);
    const tokenEndpoint = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: authConfig.clientId,
      client_secret: process.env.MS_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: authConfig.redirectUri,
      scope: authConfig.scopes.join(' ')
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Erreur de rafraîchissement:', errorData);
      return res.status(response.status).json({ 
        error: 'Erreur lors du rafraîchissement',
        details: errorData
      });
    }

    const tokens = await response.json();
    
    // Mettre à jour les tokens dans Secret Manager
    const updateResult = await authManager.updateToken({
      body: {
        sfEnvironment,
        sfOrgId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in
      }
    });

    res.json({
      success: true,
      message: "Tokens refreshed and stored successfully",
      expiryDate: updateResult.expiryDate
    });
  } catch (error) {
    console.error('Erreur lors du rafraîchissement du token:', error);
    res.status(500).json({ error: 'Erreur lors du rafraîchissement' });
  }
});

module.exports = { router, authManager }; 