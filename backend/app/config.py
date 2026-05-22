import os
from datetime import timedelta
from app.constants import ACCESS_TOKEN_MINUTES, REFRESH_TOKEN_DAYS


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-insecure")

    DB_USER = os.environ.get("DB_USER", "app_user")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "password")
    DB_HOST = os.environ.get("DB_HOST", "db")
    DB_PORT = os.environ.get("DB_PORT", "5432")
    DB_NAME = os.environ.get("DB_NAME", "inventory_db")

    SQLALCHEMY_ENGINES = {
        "default": (
            f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}"
            f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        )
    }

    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = True
    JWT_COOKIE_SAMESITE = "Strict"
    JWT_COOKIE_CSRF_PROTECT = False

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=ACCESS_TOKEN_MINUTES)
    REFRESH_TOKEN_EXPIRES_DAYS = REFRESH_TOKEN_DAYS

    MAIL_SERVER = os.environ.get("MAIL_SERVER", "mailhog")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 1025))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "false").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.environ.get(
        "MAIL_DEFAULT_SENDER", "sistema@universidade.pt"
    )

    APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://localhost")


class DevelopmentConfig(Config):
    DEBUG = True
    JWT_COOKIE_SECURE = False


class ProductionConfig(Config):
    DEBUG = False
    JWT_COOKIE_CSRF_PROTECT = True



config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
