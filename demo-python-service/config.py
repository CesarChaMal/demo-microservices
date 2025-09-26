import os

class Config:
    JWT_SECRET = os.getenv('JWT_SECRET', 'demo-secret-change-in-production')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///app.db')
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
    EUREKA_SERVER = os.getenv('EUREKA_SERVER_URL', 'http://eureka-server:8761/eureka/')
    
class DevelopmentConfig(Config):
    DEBUG = True
    
class ProductionConfig(Config):
    DEBUG = False
    JWT_SECRET = os.getenv('JWT_SECRET')  # Required in production