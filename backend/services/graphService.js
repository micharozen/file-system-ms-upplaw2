const fetch = require('node-fetch');

class GraphService {
    constructor(accessToken) {
        this.accessToken = accessToken;
    }

    async getUserInfo() {
        return this.callGraphAPI('/me');
    }

    async getSharePointFiles(siteId, folderId) {
        return this.callGraphAPI(`/sites/${siteId}/drive/items/${folderId}/children`);
    }

    async callGraphAPI(endpoint) {
        const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Graph API error: ${response.statusText}`);
        }

        return response.json();
    }
}

module.exports = GraphService; 