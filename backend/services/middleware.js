const jwt = require("jsonwebtoken");

class HTTPError extends Error {
  constructor(message, httpStatusCode) {
    super(message);
    this.httpStatusCode = httpStatusCode;
  }
}

class Middleware {
  constructor() {
    this.secretKey = process.env.JWT_SECRET;
    this.mainKey = process.env.MAIN_KEY;
  }

  async generateToken(res, req) {
    const { mainKey, clientEmail, clientName } = req.body;
    try {
      // check the mainKey is valid
      if (mainKey !== this.mainKey) {
        return res.status(401).json({ error: "Invalid main key" });
      }
      const token = jwt.sign(
        { mainKey, clientEmail, clientName },
        this.secretKey
      );
      return res.status(200).json({ token });
    } catch (error) {
      return res.status(400).json({ error: "Failed to generate API key" });
    }
  }

  verifyToken(req, res, next) {
    try {
      const bearerHeader = req.headers["authorization"];
      if (typeof bearerHeader === "undefined") {
        return res.status(401).json({ error: "No token provided" });
      }
      const bearer = bearerHeader.split(" ");
      const bearerToken = bearer[1];
      const decoded = jwt.verify(bearerToken, this.secretKey);
      req.client = decoded;
      return next();
    } catch (error) {
      console.log("error", error);
      return res.status(401).json({ error: "Invalid token" });
    }
  }
}

module.exports = Middleware; 