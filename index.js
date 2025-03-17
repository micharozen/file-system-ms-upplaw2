require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

// Importation des services et utilitaires
const OneDriveService = require("./backend/services");
const { router: authRouter, authManager } = require("./backend/auth");
const { decryptTokens } = require("./backend/utils");
const Middleware = require("./backend/middleware");

// Création des instances de services
const oneDriveService = new OneDriveService(authManager);
const middleware = new Middleware();

// Configuration CORS
const corsOptions = {
  origin: "*",
  optionsSuccessStatus: 200,
};

// Middleware pour les fichiers volumineux
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(cors(corsOptions));

// Configuration Google Cloud
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'gdrive-430511';

// Routes publiques
// Création d'une clé API
app.post("/create-api-key", async (req, res) => {
  await middleware.generateToken(res, req);
});

// Routes d'authentification (publiques)
app.use('/auth', authRouter);

// Middleware d'authentification pour les routes protégées
app.use((req, res, next) => middleware.verifyToken(req, res, next));

// Routes OneDrive directes (protégées)
app.post("/onedrive-api/upload", async (req, res) => {
  await oneDriveService.uploadFile(req, res);
});

app.get("/onedrive-api/list", async (req, res) => {
  await oneDriveService.listFiles(req, res);
});

app.get("/onedrive-api/listv2", async (req, res) => {
  await oneDriveService.listFilesv2(req, res);
});

app.post("/onedrive-api/folder", async (req, res) => {
  await oneDriveService.createFolder(req, res);
});

app.post("/onedrive-api/folders", async (req, res) => {
  await oneDriveService.createFolders(req, res);
});

// Routes OneDrive avec préfixe (protégées)
app.get("/onedrive/folders", (req, res) => oneDriveService.listFolders(req, res));
app.post("/onedrive/folder", (req, res) => oneDriveService.createFolder(req, res));
app.post("/onedrive/upload", (req, res) => oneDriveService.uploadFile(req, res));
app.get("/onedrive/files", (req, res) => oneDriveService.listFiles(req, res));
app.get("/onedrive/filesv2", (req, res) => oneDriveService.listFilesv2(req, res));
app.post("/onedrive/create-folder", (req, res) => oneDriveService.createFolder(req, res));
app.post("/onedrive/create-folders", (req, res) => oneDriveService.createFolders(req, res));

// Utilitaires pour les tokens (protégés)
app.post("/decrypt-token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token manquant" });
    }
    
    const decryptedToken = await decryptTokens(token);
    res.status(200).json({ decryptedToken });
  } catch (error) {
    console.error("Erreur lors du déchiffrement:", error);
    res.status(500).json({ error: error.message });
  }
});

// Route par défaut
app.get('/', (req, res) => {
  res.json({ message: 'API OneDrive opérationnelle' });
});

// Gestion des erreurs 404
app.use((req, res) => {
  console.log('Route non trouvée:', req.url);
  res.status(404).json({ error: 'Route non trouvée' });
});

// Pour le développement local uniquement
// Ne pas démarrer le serveur si nous sommes dans un environnement Cloud Functions
if (process.env.NODE_ENV === 'development') {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Routes disponibles:');
    console.log('- /create-api-key (publique)');
    console.log('- /auth/* (publique)');
    console.log('- /onedrive/* (protégée)');
    console.log('- /onedrive-api/upload (protégée)');
    console.log('- /onedrive-api/list (protégée)');
    console.log('- /onedrive-api/listv2 (protégée)');
    console.log('- /onedrive-api/folder (protégée)');
    console.log('- /onedrive-api/folders (protégée)');
    console.log('- /decrypt-token (protégée)');
  });
}

// Exportation pour Google Cloud Functions
exports.msGraphApi = app; 