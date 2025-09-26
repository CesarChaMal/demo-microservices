/**
 * Authentication Pattern Implementation
 * Provides JWT-based authentication and authorization.
 */

const jwt = require('jsonwebtoken');

class AuthenticationService {
    constructor(secretKey = process.env.JWT_SECRET || 'demo-secret-change-in-production') {
        this.secretKey = secretKey;
        this.algorithm = 'HS256';
    }

    generateToken(userId, roles = []) {
        const payload = {
            userId,
            roles,
            exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
            iat: Math.floor(Date.now() / 1000)
        };
        return jwt.sign(payload, this.secretKey, { algorithm: this.algorithm });
    }

    validateToken(token) {
        try {
            return jwt.verify(token, this.secretKey, { algorithms: [this.algorithm] });
        } catch (error) {
            return null;
        }
    }

    hasRole(tokenPayload, requiredRole) {
        const userRoles = tokenPayload.roles || [];
        return userRoles.includes(requiredRole);
    }
}

const authRequired = (roles = []) => {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.slice(7);
        const authService = new AuthenticationService();
        const payload = authService.validateToken(token);

        if (!payload) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        if (roles.length > 0) {
            for (const role of roles) {
                if (!authService.hasRole(payload, role)) {
                    return res.status(403).json({ error: 'Insufficient permissions' });
                }
            }
        }

        req.user = payload;
        next();
    };
};

module.exports = {
    AuthenticationService,
    authRequired
};