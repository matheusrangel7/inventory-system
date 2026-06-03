import os
from datetime import timedelta

from app.constants import ACCESS_TOKEN_MINUTES, REFRESH_TOKEN_HOURS


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)

    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "jwt-insecure")

    DB_USER = os.environ.get("DB_USER", "app_user")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "password")
    DB_HOST = os.environ.get("DB_HOST", "db")
    DB_PORT = os.environ.get("DB_PORT", "5432")
    DB_NAME = os.environ.get("DB_NAME", "inventory_db")

    DATABASE_URL = (
        f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )

    SQLALCHEMY_ENGINES = {
        "default": DATABASE_URL,
    }

    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_TOKEN_LOCATION = ["cookies"]
    JWT_COOKIE_SECURE = env_bool("JWT_COOKIE_SECURE", False)
    JWT_COOKIE_SAMESITE = os.environ.get("JWT_COOKIE_SAMESITE", "Lax")
    JWT_COOKIE_CSRF_PROTECT = env_bool("JWT_COOKIE_CSRF_PROTECT", False)
    JWT_CSRF_IN_COOKIES = True
    JWT_ACCESS_CSRF_COOKIE_NAME = "csrf_access_token"
    JWT_ACCESS_CSRF_COOKIE_PATH = "/"
    JWT_ACCESS_CSRF_HEADER_NAME = "X-CSRF-TOKEN"
    JWT_REFRESH_CSRF_COOKIE_NAME = "csrf_refresh_token"
    JWT_REFRESH_CSRF_COOKIE_PATH = "/"
    JWT_REFRESH_CSRF_HEADER_NAME = "X-CSRF-TOKEN"
    REQUIRE_MUTATING_ORIGIN = env_bool("REQUIRE_MUTATING_ORIGIN", False)

    JWT_ACCESS_COOKIE_PATH = "/api/"
    JWT_REFRESH_COOKIE_PATH = "/api/auth/refresh"

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=ACCESS_TOKEN_MINUTES)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(hours=REFRESH_TOKEN_HOURS)
    REFRESH_TOKEN_EXPIRES_HOURS = REFRESH_TOKEN_HOURS

    MAIL_SERVER = os.environ.get("MAIL_SERVER", "mailhog")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", "1025"))
    MAIL_USE_TLS = env_bool("MAIL_USE_TLS", False)
    MAIL_USE_SSL = env_bool("MAIL_USE_SSL", False)
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME") or None
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD") or None
    MAIL_DEFAULT_SENDER = os.environ.get(
        "MAIL_DEFAULT_SENDER",
        "no-reply@invubi.local",
    )

    APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://localhost")


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    JWT_COOKIE_SECURE = env_bool("JWT_COOKIE_SECURE", True)
    JWT_COOKIE_CSRF_PROTECT = env_bool("JWT_COOKIE_CSRF_PROTECT", True)
    REQUIRE_MUTATING_ORIGIN = env_bool("REQUIRE_MUTATING_ORIGIN", True)


config_map = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}
