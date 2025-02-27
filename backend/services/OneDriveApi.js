const fetch = require('node-fetch');
const { decrypt } = require("./utils");

class OneDriveApi {
  constructor() {}

  /**
   * Crée un client Microsoft Graph avec le token d'accès
   * @param {string} accessToken - Token d'accès Microsoft
   * @returns {Object} - Client Microsoft Graph
   */
  createGraphClient(accessToken) {
    return {
      baseUrl: 'https://graph.microsoft.com/v1.0',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };
  }

  /**
   * Télécharge un fichier vers OneDrive
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   */
  async uploadFile(req, res) {
    const { fileName, parentId, mimeType, accessTokenEncrypted, redirectUri } = req.query;
    const sfEnvironment = req.headers['x-salesforce-environment'] || 'unknown';
    const sfOrgId = req.headers["x-salesforce-organization-id"] || 'unknown';
    const file64 = req.body;

    // Regroupement de tous les logs initiaux
    console.log({
      requestInfo: {
        query: { fileName, parentId, mimeType, redirectUri },
        salesforce: { environment: sfEnvironment, orgId: sfOrgId },
        hasFile: !!file64,
        hasAccessToken: !!accessTokenEncrypted
      }
    });

    if (!fileName || !mimeType || !accessTokenEncrypted || !file64) {
      return res.status(400).send("Missing required fields");
    }

    let accessToken;

    try {
      accessToken = await decrypt(accessTokenEncrypted);
    } catch (error) {
      return res.status(400).send(error.message);
    }

    const graph = this.createGraphClient(accessToken);

    let fileBuffer;
    try {
      let base64Content = JSON.stringify(file64).split(',')[1];
      fileBuffer = Buffer.from(base64Content, "base64");
    } catch (error) {
      console.log("Error converting base64 to buffer:", error);
      return res.status(400).send("Invalid base64 data");
    }

    try {
      // Déterminer le chemin parent
      const parentPath = parentId === 'root' ? '/drive/root' : `/drive/items/${parentId}`;
      
      // Créer un upload session pour les fichiers volumineux
      const sessionUrl = `${graph.baseUrl}/me${parentPath}:/${fileName}:/createUploadSession`;
      
      const sessionResponse = await fetch(sessionUrl, {
        method: 'POST',
        headers: graph.headers,
        body: JSON.stringify({
          item: {
            "@microsoft.graph.conflictBehavior": "rename"
          }
        })
      });

      if (!sessionResponse.ok) {
        const errorData = await sessionResponse.json();
        throw new Error(`Failed to create upload session: ${JSON.stringify(errorData)}`);
      }

      const sessionData = await sessionResponse.json();
      const uploadUrl = sessionData.uploadUrl;

      // Télécharger le fichier
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': fileBuffer.length.toString(),
          'Content-Type': mimeType
        },
        body: fileBuffer
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Failed to upload file: ${errorText}`);
      }

      const fileData = await uploadResponse.json();
      return res.status(200).send(`File uploaded with ID: ${fileData.id}`);
    } catch (error) {
      console.error("Error uploading file:", error);
      return res.status(500).send(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Liste les fichiers dans un dossier OneDrive
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   */
  async listFiles(req, res) {
    const { accessTokenEncrypted, folderId, nameFolder, redirectUri } = req.query;
    const parentFolderId = folderId || "root";

    if (!accessTokenEncrypted) {
      return res.status(400).send("Missing required fields");
    }

    console.log(accessTokenEncrypted);
    let accessToken;
    try {
      accessToken = await decrypt(accessTokenEncrypted);
      console.log(accessToken);
    } catch (error) {
      return res.status(400).send(error.message);
    }

    const graph = this.createGraphClient(accessToken);

    try {
      // Construire l'URL de l'API
      let apiUrl;
      if (parentFolderId === "root") {
        apiUrl = `${graph.baseUrl}/me/drive/root/children`;
      } else {
        apiUrl = `${graph.baseUrl}/me/drive/items/${parentFolderId}/children`;
      }

      // Ajouter le filtre de nom si nécessaire
      if (nameFolder) {
        // Utiliser le filtre startsWith de Microsoft Graph
        apiUrl += `?$filter=startsWith(name,'${encodeURIComponent(nameFolder)}')`;
      }

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: graph.headers
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to list files: ${errorData}`);
      }

      let data = await response.json();
      let files = data.value;

      // Transformer les données pour correspondre au format attendu
      const formattedFiles = files.map(file => ({
        id: file.id,
        name: file.name,
        mimeType: file.file ? file.file.mimeType : 'folder',
        webViewLink: file.webUrl,
        iconLink: file.file ? 'file-icon' : 'folder-icon',
        modifiedTime: file.lastModifiedDateTime
      }));

      return res.status(200).json(formattedFiles);
    } catch (error) {
      console.error("Error listing files:", error);
      return res.status(500).send(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Liste les fichiers dans un dossier OneDrive (version 2)
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   */
  async listFilesv2(req, res) {
    const { accessTokenEncrypted, folderId, nameFolders, redirectUri } = req.query;
    const parentFolderId = folderId || "root";

    if (!accessTokenEncrypted) {
      return res.status(400).send("Missing required fields");
    }

    let accessToken;
    try {
      accessToken = await decrypt(accessTokenEncrypted);
    } catch (error) {
      return res.status(400).send(error.message);
    }

    const graph = this.createGraphClient(accessToken);

    try {
      // Construire l'URL de l'API
      let apiUrl;
      if (parentFolderId === "root") {
        apiUrl = `${graph.baseUrl}/me/drive/root/children`;
      } else {
        apiUrl = `${graph.baseUrl}/me/drive/items/${parentFolderId}/children`;
      }

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: graph.headers
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to list files: ${errorData}`);
      }

      let data = await response.json();
      let files = data.value;

      // Filtrer par noms si nécessaire
      if (nameFolders) {
        const folderNames = nameFolders.split(',').map(name => name.trim());
        if (folderNames.length > 0) {
          files = files.filter(file => 
            folderNames.some(name => file.name.includes(name))
          );
        }
      }

      // Transformer les données pour correspondre au format attendu
      const formattedFiles = files.map(file => ({
        id: file.id,
        name: file.name,
        mimeType: file.file ? file.file.mimeType : 'folder',
        webViewLink: file.webUrl,
        iconLink: file.file ? 'file-icon' : 'folder-icon',
        modifiedTime: file.lastModifiedDateTime
      }));

      return res.status(200).json(formattedFiles);
    } catch (error) {
      console.error("Error listing files:", error);
      return res.status(500).send(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Crée un dossier dans OneDrive
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   */
  async createFolder(req, res) {
    const { parentFolderId, folderName, accessTokenEncrypted, redirectUri } = req.query;

    if (!folderName || !accessTokenEncrypted) {
      return res.status(400).send("Missing required fields");
    }

    let accessToken;
    try {
      accessToken = await decrypt(accessTokenEncrypted);
    } catch (error) {
      return res.status(400).send(error.message);
    }

    const graph = this.createGraphClient(accessToken);

    try {
      // Déterminer l'URL de l'API en fonction du dossier parent
      let apiUrl;
      if (!parentFolderId || parentFolderId === 'root') {
        apiUrl = `${graph.baseUrl}/me/drive/root/children`;
      } else {
        apiUrl = `${graph.baseUrl}/me/drive/items/${parentFolderId}/children`;
      }

      // Créer le dossier
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: graph.headers,
        body: JSON.stringify({
          name: folderName,
          folder: {},
          "@microsoft.graph.conflictBehavior": "rename"
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to create folder: ${errorData}`);
      }

      const folder = await response.json();

      return res.status(200).json({
        message: "Folder created successfully",
        folderId: folder.id,
        folderName: folder.name
      });
    } catch (error) {
      console.error("Error creating folder:", error);
      return res.status(500).send(`Failed to create folder: ${error.message}`);
    }
  }

  /**
   * Crée plusieurs dossiers dans OneDrive
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   */
  async createFolders(req, res) {
    const { folders } = req.body;
    const { accessTokenEncrypted, parentFolderId, redirectUri } = req.query;

    if (
      !folders ||
      !Array.isArray(folders) ||
      folders.length === 0 ||
      !accessTokenEncrypted
    ) {
      return res
        .status(400)
        .send("Missing required fields or invalid folders array");
    }

    let accessToken;
    try {
      accessToken = await decrypt(accessTokenEncrypted);
    } catch (error) {
      return res.status(400).send(error.message);
    }

    const graph = this.createGraphClient(accessToken);

    try {
      const createdFolders = [];

      for (let i = 0; i < folders.length; i++) {
        const { folderName } = folders[i];
        // OneDrive ne supporte pas directement la couleur des dossiers comme Google Drive

        // Déterminer l'URL de l'API en fonction du dossier parent
        let apiUrl;
        if (i === 0) {
          if (!parentFolderId || parentFolderId === 'root') {
            apiUrl = `${graph.baseUrl}/me/drive/root/children`;
          } else {
            apiUrl = `${graph.baseUrl}/me/drive/items/${parentFolderId}/children`;
          }
        } else {
          // Utiliser le premier dossier créé comme parent pour les dossiers suivants
          apiUrl = `${graph.baseUrl}/me/drive/items/${createdFolders[0].folderId}/children`;
        }

        // Créer le dossier
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: graph.headers,
          body: JSON.stringify({
            name: folderName,
            folder: {},
            "@microsoft.graph.conflictBehavior": "rename"
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to create folder: ${errorData}`);
        }

        const folder = await response.json();

        createdFolders.push({
          folderId: folder.id,
          folderName: folder.name,
          driveId: folder.parentReference?.driveId,
          webViewLink: folder.webUrl
        });
      }

      return res.status(200).json({
        message: "Folders created successfully",
        folders: createdFolders
      });
    } catch (error) {
      console.error("Error creating folders:", error);
      return res.status(500).send(`Failed to create folders: ${error.message}`);
    }
  }
}

module.exports = OneDriveApi; 