module.exports = {
    jwt: {
        secret: process.env.JWT_SECRET || 'demo-secret-change-in-production',
        expiresIn: '1h'
    },
    eureka: {
        host: process.env.EUREKA_HOST || 'eureka-server',
        port: process.env.EUREKA_PORT || 8761
    },
    database: {
        url: process.env.DATABASE_URL || 'sqlite://app.db'
    },
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    },
    server: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development'
    }
};