const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { decrypt } = require('../services/utils');

// Liste les dossiers OneDrive
router.get('/folders', async (req, res) => {
    console.log('Route /folders appelée');
    try {
        const authHeader = req.headers.authorization;
        console.log('En-tête d\'autorisation reçu:', authHeader ? 'Présent' : 'Absent');
        
        const accessToken = decrypt(authHeader?.split(' ')[1]);
        if (!accessToken) {
            return res.status(401).json({ error: 'Token manquant' });
        }
        
        console.log('Tentative d\'appel à l\'API Microsoft Graph...');
        
        // Utilise l'endpoint OneDrive au lieu de SharePoint
        const response = await fetch(
            'https://graph.microsoft.com/v1.0/me/drive/root/children',
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        ).catch(error => {
            console.error('Erreur lors de l\'appel à Microsoft Graph:', error);
            throw new Error(`Erreur de connexion à Microsoft Graph: ${error.message}`);
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Réponse d\'erreur de Microsoft Graph:', errorText);
            
            let errorMessage;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error?.message || 'Erreur inconnue';
            } catch (e) {
                errorMessage = errorText || 'Erreur inconnue';
            }
            
            return res.status(response.status).json({ 
                error: errorMessage,
                status: response.status
            });
        }

        const data = await response.json();
        console.log('Données reçues de Microsoft Graph:', data.value?.length || 0, 'éléments');
        res.json(data);
    } catch (error) {
        console.error('Erreur complète:', error);
        res.status(500).json({ error: error.message });
    }
});

// Créer un dossier dans OneDrive
router.post('/folder', async (req, res) => {
    try {
        const { folderName, parentFolderId = 'root' } = req.body;
        const accessToken = decrypt(req.headers.authorization?.split(' ')[1]);

        if (!folderName || !accessToken) {
            return res.status(400).json({ 
                error: 'Paramètres manquants' 
            });
        }

        const response = await fetch(
            `https://graph.microsoft.com/v1.0/me/drive/items/${parentFolderId}/children`,
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
        console.error('Erreur OneDrive:', error);
        res.status(500).json({ 
            error: error.message 
        });
    }
});

module.exports = router; 