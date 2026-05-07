import os


class Config:
    """Configuração base — partilhada por todos os ambientes."""

    # Flask
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-insecure")

    # Base de Dados
    # Monta a URI a partir das variáveis individuais do .env
    DB_USER = os.environ.get("DB_USER", "app_user")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "password")
    DB_HOST = os.environ.get("DB_HOST", "db")
    DB_PORT = os.environ.get("DB_PORT", "3306")
    DB_NAME = os.environ.get("DB_NAME", "inventory_db")

    SQLALCHEMY_ENGINES = {
    "default": f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    }

    # JWT
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-secret-insecure")
    JWT_ACCESS_TOKEN_EXPIRES = False  # sem expiração por agora (definido no Q&A)


class DevelopmentConfig(Config):
    """Configuração para desenvolvimento local."""
    DEBUG = True


class ProductionConfig(Config):
    """Configuração para produção."""
    DEBUG = False


# Dicionário que mapeia o nome do ambiente à classe correspondente
config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}