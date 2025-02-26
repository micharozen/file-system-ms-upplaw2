const express = require('express');
const router = express.Router();
const OneDriveApi = require('../services/OneDriveApi');

const oneDriveApi = new OneDriveApi();

// Route pour télécharger un fichier vers OneDrive
router.post('/upload', async (req, res) => {
  await oneDriveApi.uploadFile(req, res);
});

// Route pour lister les fichiers dans un dossier OneDrive
router.get('/list-files', async (req, res) => {
  await oneDriveApi.listFiles(req, res);
});

// Route pour lister les fichiers avec filtrage multiple par nom
router.get('/list-files/v2', async (req, res) => {
  await oneDriveApi.listFilesv2(req, res);
});

// Route pour créer un dossier dans OneDrive
router.post('/create-folder', async (req, res) => {
  await oneDriveApi.createFolder(req, res);
});

// Route pour créer plusieurs dossiers dans OneDrive
router.post('/create-folders', async (req, res) => {
  await oneDriveApi.createFolders(req, res);
});

module.exports = router;  