const fetch = require('node-fetch');

/**
 * Classe pour gérer les interactions avec l'API OneDrive
 */
class OneDriveService {
  constructor(authManager) {
    this.authManager = authManager;
  }

  /**
   * Construit le nom du secret à partir des headers Salesforce
   * @param {Object} req - Requête HTTP
   * @returns {string} - Nom du secret
   * @private
   */
  _getSecretName(req) {
    const sfEnvironment = req.headers['x-salesforce-environment'] || 'unknown';
    const sfOrgId = req.headers['x-salesforce-organization-id'] || 'unknown';
    
    // Nettoyer l'environnement et l'ID de l'organisation pour créer un ID de secret valide
    const cleanEnvironment = sfEnvironment.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    const cleanOrgId = sfOrgId.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    
    return `ms_tokens_${cleanEnvironment}_${cleanOrgId}`;
  }

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
   * Obtient l'extension de fichier à partir du MIME type
   * @param {string} mimeType - Type MIME
   * @returns {string} - Extension de fichier (avec le point)
   */
  getExtensionFromMimeType(mimeType) {
    const mimeToExt = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'text/plain': '.txt',
      'text/csv': '.csv'
    };
    return mimeToExt[mimeType] || '.pdf';  // Par défaut .pdf si le MIME type n'est pas reconnu
  }

  /**
   * Détermine le type MIME d'un fichier basé sur son extension
   * @param {string} fileName - Nom du fichier
   * @returns {string} - Type MIME
   */
  getMimeType(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'txt': 'text/plain',
      'csv': 'text/csv'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Liste les dossiers OneDrive
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   */
  async listFolders(req, res) {
    console.log('Route /folders appelée');
    try {
      let accessToken;
      try {
        accessToken = await this.authManager.accessSecret(this._getSecretName(req), 'accessToken');
      } catch (error) {
        console.error('Error getting access token:', error);
        return res.status(401).send('Failed to get access token');
      }
      
      console.log('Tentative d\'appel à l\'API Microsoft Graph...');
      
      // Utilise l'endpoint OneDrive
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
  }

  /**
   * Crée un dossier dans OneDrive
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   */
  async createFolder(req, res) {
    try {
      const { folderName, parentFolderId = 'root' } = req.query;

      if (!folderName) {
        return res.status(400).send("Missing required fields");
      }

      let accessToken;
      try {
        accessToken = await this.authManager.accessSecret(this._getSecretName(req), 'accessToken');
      } catch (error) {
        console.error('Error getting access token:', error);
        return res.status(401).send('Failed to get access token');
      }

      const graph = this.createGraphClient(accessToken);

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
    const { parentFolderId } = req.query;

    if (!folders || !Array.isArray(folders) || folders.length === 0) {
      return res.status(400).send("Missing required fields or invalid folders array");
    }

    let accessToken;
    try {
      accessToken = await this.authManager.accessSecret(this._getSecretName(req), 'accessToken');
    } catch (error) {
      console.error('Error getting access token:', error);
      return res.status(401).send('Failed to get access token');
    }

    const graph = this.createGraphClient(accessToken);

    try {
      const createdFolders = [];

      for (let i = 0; i < folders.length; i++) {
        const { folderName } = folders[i];

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

  /**
   * Télécharge un fichier vers OneDrive
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   */
  async uploadFile(req, res) {
    const { fileName, parentId } = req.query;
    const sfEnvironment = req.headers['x-salesforce-environment'] || 'unknown';
    const sfOrgId = req.headers["x-salesforce-organization-id"] || 'unknown';
    const mimeType = req.query.mimeType;
    
    // Nettoyer le nom du fichier (remplacer les / par des -)
    let sanitizedFileName = fileName.replace(/\//g, '-');

    // Vérifier si le nom du fichier contient déjà une extension
    const hasExtension = /\.[^.]+$/.test(sanitizedFileName);
    
    if (!hasExtension) {
      // Si pas d'extension, on l'ajoute en fonction du MIME type
      const extension = this.getExtensionFromMimeType(mimeType || 'application/pdf');
      sanitizedFileName += extension;
      console.log('Added extension to filename:', sanitizedFileName);
    }
    
    // Extraction du contenu base64 du body
    let base64Content = req.body.content;

    // Supprimer la virgule au début si elle existe
    if (base64Content.startsWith(',')) {
      base64Content = base64Content.substring(1);
    }

    // Regroupement de tous les logs initiaux
    console.log({
      requestInfo: {
        query: { 
          originalFileName: fileName,
          sanitizedFileName,
          parentId,
          mimeType: mimeType 
        },
        salesforce: { environment: sfEnvironment, orgId: sfOrgId },
        hasFile: !!base64Content
      }
    });

    if (!fileName || !base64Content) {
      return res.status(400).send("Missing required fields");
    }

    let accessToken;
    try {
      accessToken = await this.authManager.accessSecret(this._getSecretName(req), 'accessToken');
    } catch (error) {
      console.error('Error getting access token:', error);
      return res.status(401).send('Failed to get access token');
    }

    const graph = this.createGraphClient(accessToken);

    let fileBuffer;
    let detectedMimeType;
    try {
      // Vérifier si le contenu base64 commence par 'data:'
      if (base64Content.startsWith('data:')) {
        // Extraire le type MIME et le contenu base64
        const matches = base64Content.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          detectedMimeType = matches[1];
          fileBuffer = Buffer.from(matches[2], 'base64');
        } else {
          throw new Error('Invalid data URL format');
        }
      } else {
        // Utiliser directement le contenu base64
        fileBuffer = Buffer.from(base64Content, 'base64');
      }
      
      console.log('File size:', fileBuffer.length, 'bytes');
      console.log('MIME types:', {
        fromRequest: mimeType,
        fromDataUrl: detectedMimeType,
        fromExtension: this.getMimeType(sanitizedFileName)
      });
    } catch (error) {
      console.error("Error converting base64 to buffer:", error);
      return res.status(400).send("Invalid base64 data");
    }

    try {
      // Déterminer le chemin parent
      const parentPath = parentId === 'root' ? '/drive/root' : `/drive/items/${parentId}`;
      
      // Créer un upload session pour les fichiers volumineux
      const sessionUrl = `${graph.baseUrl}/me${parentPath}:/${sanitizedFileName}:/createUploadSession`;
      
      // Déterminer le MIME type final
      let finalMimeType;
      if (mimeType && mimeType !== 'application/octet-stream') {
        finalMimeType = mimeType;
        console.log('Using MIME type from request:', finalMimeType);
      } else if (detectedMimeType) {
        finalMimeType = detectedMimeType;
        console.log('Using MIME type from data URL:', finalMimeType);
      } else {
        const extensionMimeType = this.getMimeType(sanitizedFileName);
        finalMimeType = extensionMimeType !== 'application/octet-stream' ? extensionMimeType : 'application/pdf';
        console.log('Using MIME type from extension or default:', finalMimeType);
      }

      // Créer les métadonnées du fichier avec le MIME type
      const metadata = {
        item: {
          "@microsoft.graph.conflictBehavior": "rename",
          name: sanitizedFileName,
          file: {
            mimeType: finalMimeType
          }
        }
      };

      // Créer la session d'upload avec les métadonnées
      const createSessionResponse = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          ...graph.headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });

      if (!createSessionResponse.ok) {
        const errorData = await createSessionResponse.json();
        throw new Error(`Failed to create upload session: ${JSON.stringify(errorData)}`);
      }

      const sessionData = await createSessionResponse.json();
      const uploadUrl = sessionData.uploadUrl;

      // Taille maximale de chaque chunk (4MB)
      const maxChunkSize = 4 * 1024 * 1024;
      const fileSize = fileBuffer.length;
      let uploadedBytes = 0;

      while (uploadedBytes < fileSize) {
        const chunk = fileBuffer.subarray(uploadedBytes, Math.min(uploadedBytes + maxChunkSize, fileSize));
        const contentRange = `bytes ${uploadedBytes}-${uploadedBytes + chunk.length - 1}/${fileSize}`;

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': chunk.length.toString(),
            'Content-Range': contentRange,
            'Content-Type': finalMimeType
          },
          body: chunk
        });

        if (!uploadResponse.ok && uploadResponse.status !== 202) {
          const errorText = await uploadResponse.text();
          throw new Error(`Failed to upload file: ${errorText}`);
        }

        uploadedBytes += chunk.length;

        // Si c'est le dernier chunk, on récupère la réponse finale
        if (uploadedBytes === fileSize) {
          const fileData = await uploadResponse.json();
          return res.status(200).json({
            message: "File uploaded successfully",
            fileId: fileData.id,
            fileName: fileData.name,
            webUrl: fileData.webUrl
          });
        }
      }
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
    const { folderId, nameFolder } = req.query;
    const parentFolderId = folderId || "root";
    const secretName = this._getSecretName(req);

    let accessToken;
    try {
      // Vérifier si le token est expiré en utilisant la méthode existante
      const isExpired = await this.authManager.isTokenExpired(secretName);
      
      if (isExpired) {
        console.log('Access token expired, refreshing...');
        // Utiliser le refresh token pour obtenir un nouveau token
        const newTokenData = await this.authManager.refreshToken(secretName);
        accessToken = newTokenData.accessToken;
      } else {
        console.log('Access token still valid');
        accessToken = await this.authManager.accessSecret(secretName, 'accessToken');
      }
    } catch (error) {
      console.error('Error getting or refreshing access token:', error);
      return res.status(401).send('Failed to get valid access token');
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
    const { folderId, nameFolders } = req.query;
    const parentFolderId = folderId || "root";

    let accessToken;
    try {
      accessToken = await this.authManager.accessSecret(this._getSecretName(req), 'accessToken');
    } catch (error) {
      console.error('Error getting access token:', error);
      return res.status(401).send('Failed to get access token');
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
}

module.exports = OneDriveService; 