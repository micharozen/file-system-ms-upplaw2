const express = require('express');
const router = express.Router();
const { getAuthConfig, encrypt, decrypt } = require('../services/utils');

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
    
    if (!code) {
        return res.status(400).json({ error: 'Code d\'autorisation manquant' });
    }
    
    try {
        const authConfig = getAuthConfig(redirectUri);
        const tokenEndpoint = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams({
            client_id: authConfig.clientId,
            client_secret: process.env.MS_CLIENT_SECRET || 'votre_client_secret',
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
        console.log('Tokens reçus:', tokens);
        
        // Chiffrement des tokens
        const accessToken = await encrypt(tokens.access_token);
        const refreshToken = await encrypt(tokens.refresh_token);
        console.log('Tokens chiffrés:', { accessToken, refreshToken });
        
        // Vérification du chiffrement/déchiffrement
        const decryptedAccess = await decrypt(accessToken);
        const decryptedRefresh = await decrypt(refreshToken);
        console.log('Tokens déchiffrés:', { decryptedAccess, decryptedRefresh });

        res.json({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: tokens.expires_in
        });
    } catch (error) {
        console.error('Erreur lors de l\'obtention des tokens:', error);
        res.status(500).json({ error: 'Erreur lors de l\'authentification' });
    }
});

// Endpoint pour rafraîchir le token
router.post('/get-access-token-with-refresh-token', async (req, res) => {
    const { refresh_token, redirectUri } = req.body;
    
    if (!refresh_token) {
        return res.status(400).json({ error: 'Refresh token manquant' });
    }
    
    try {
        const authConfig = getAuthConfig(redirectUri);
        const tokenEndpoint = `https://login.microsoftonline.com/${authConfig.tenantId}/oauth2/v2.0/token`;
        const params = new URLSearchParams({
            client_id: authConfig.clientId,
            client_secret: process.env.MS_CLIENT_SECRET || 'votre_client_secret',
            grant_type: 'refresh_token',
            refresh_token: await decrypt(refresh_token),
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
        res.json({
            access_token: await encrypt(tokens.access_token),
            refresh_token: await encrypt(tokens.refresh_token),
            expires_in: tokens.expires_in
        });
    } catch (error) {
        console.error('Erreur lors du rafraîchissement du token:', error);
        res.status(500).json({ error: 'Erreur lors du rafraîchissement' });
    }
});
module.exports = router; 