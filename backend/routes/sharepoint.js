const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// Fonction utilitaire pour obtenir le tenant ID du token
function getTenantFromToken(accessToken) {
    const tokenParts = accessToken.split('.');
    const tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    return tokenPayload.tid;
}

// Liste tous les sites SharePoint
router.get('/sites', async (req, res) => {
    console.log('Route /sites appelée');
    try {
        const accessToken = req.headers.authorization?.split(' ')[1];
        if (!accessToken) {
            return res.status(401).json({ error: 'Token manquant' });
        }

        const tenantId = getTenantFromToken(accessToken);
        console.log('Tenant ID:', tenantId);

        const response = await fetch(
            `https://graph.microsoft.com/v1.0/sites/root`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message);
        }

        const data = await response.json();
        res.json({ value: [data] });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({ error: error.message });
    }
});

// Liste les dossiers d'un site
router.get('/folders/:siteId', async (req, res) => {
    try {
        const { siteId } = req.params;
        const accessToken = req.headers.authorization?.split(' ')[1];
        
        if (!accessToken) {
            return res.status(401).json({ error: 'Token manquant' });
        }

        const response = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erreur lors de la récupération des dossiers:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/folder', async (req, res) => {
    try {
        const { folderName, siteId, parentFolderId } = req.body;
        const accessToken = req.headers.authorization?.split(' ')[1];

        if (!folderName || !siteId || !parentFolderId || !accessToken) {
            return res.status(400).json({ 
                error: 'Paramètres manquants' 
            });
        }

        const response = await fetch(
            `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${parentFolderId}/children`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: folderName,
                    folder: {},
                    "@microsoft.graph.conflictBehavior": "rename"
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error.message);
        }

        const result = await response.json();
        res.json(result);
    } catch (error) {
        console.error('Erreur SharePoint:', error);
        res.status(500).json({ 
            error: error.message 
        });
    }
});

module.exports = router; 