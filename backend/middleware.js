const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Classe pour gérer l'authentification par API key
 */
class Middleware {
  constructor() {
    this.secretKey = process.env.JWT_SECRET || 'default-secret-key';
  }

  /**
   * Génère un token API
   * @param {Object} res - Réponse HTTP
   * @param {Object} req - Requête HTTP
   */
  async generateToken(res, req) {
    try {
      // Générer une clé API aléatoire
      const apiKey = crypto.randomBytes(32).toString('hex');
      
      // Créer un token JWT avec cette clé
      const token = jwt.sign({ apiKey }, this.secretKey, { expiresIn: '30d' });
      
      res.json({ 
        success: true, 
        apiKey: token,
        expiresIn: '30 days'
      });
    } catch (error) {
      console.error('Erreur lors de la génération du token:', error);
      res.status(500).json({ error: 'Erreur lors de la génération du token' });
    }
  }

  /**
   * Vérifie la validité du token API
   * @param {Object} req - Requête HTTP
   * @param {Object} res - Réponse HTTP
   * @param {Function} next - Fonction next
   */
  verifyToken(req, res, next) {
    // Récupérer le token du header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token d\'authentification manquant ou invalide' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      // Vérifier le token
      const decoded = jwt.verify(token, this.secretKey);
      req.user = decoded;
      next();
    } catch (error) {
      console.error('Erreur de vérification du token:', error);
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  }
}

module.exports = Middleware; 