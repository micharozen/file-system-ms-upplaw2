require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();

// Importation des services
const OneDriveApi = require("./backend/services/OneDriveApi");
const oneDriveApi = new OneDriveApi();

const { decryptTokens } = require("./backend/services/utils");
const Middleware = require("./backend/services/middleware");
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

// Importation des routes
const authRoutes = require('./backend/routes/auth');
const onedriveRoutes = require('./backend/routes/onedrive');
const sharepointRoutes = require('./backend/routes/sharepoint');

// Routes publiques
// Création d'une clé API
app.post("/create-api-key", async (req, res) => {
  await middleware.generateToken(res, req);
});

// Routes d'authentification (publiques)
app.use('/auth', authRoutes);

// Middleware d'authentification pour les routes protégées
app.use((req, res, next) => middleware.verifyToken(req, res, next));

// Routes OneDrive et SharePoint (protégées)
app.use('/onedrive', onedriveRoutes);
app.use('/sharepoint', sharepointRoutes);

// Routes API OneDrive directes (protégées)
app.post("/onedrive-api/upload", async (req, res) => {
  await oneDriveApi.uploadFile(req, res);
});

app.get("/onedrive-api/list", async (req, res) => {
  await oneDriveApi.listFiles(req, res);
});

app.get("/onedrive-api/listv2", async (req, res) => {
  await oneDriveApi.listFilesv2(req, res);
});

app.post("/onedrive-api/folder", async (req, res) => {
  await oneDriveApi.createFolder(req, res);
});

app.post("/onedrive-api/folders", async (req, res) => {
  await oneDriveApi.createFolders(req, res);
});

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

// Gestion des erreurs 404
app.use((req, res) => {
  console.log('Route non trouvée:', req.url);
  res.status(404).json({ error: 'Route non trouvée' });
});

// Pour le développement local
if (process.env.NODE_ENV === 'development') {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Routes disponibles:');
    console.log('- /create-api-key (publique)');
    console.log('- /auth/* (publique)');
    console.log('- /onedrive/* (protégée)');
    console.log('- /sharepoint/* (protégée)');
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