import os
import logging
import atexit
from urllib.parse import urlparse

from flask import Flask, jsonify, request
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from werkzeug.middleware.proxy_fix import ProxyFix
from app.services.scheduler_service import check_maintenance

from app.config import config_map
from app.extensions import db, jwt, limiter, mail
from app.models.base import Base
from app.security.totp_secrets import configure_totp_encryption
from app.utils.responses import error

logger = logging.getLogger(__name__)


def create_app(config_name: str = None) -> Flask:
    """
    Application Factory.
    Cria e configura a instância da aplicação Flask.
    """
    app = Flask(__name__)

    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    config_class = config_map.get(config_name)
    if config_class is None:
        raise RuntimeError(f"Ambiente Flask desconhecido: {config_name}.")

    app.config.from_object(config_class)
    configure_totp_encryption(app)
    _validate_security_config(app, config_name)
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
        x_port=1,
    )
    _register_request_security(app)

    # Inicializar extensões
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)
    mail.init_app(app)
    _register_cli(app)

    # Registar Blueprints
    from app.routes.auth import auth_bp
    from app.routes.assets import assets_bp
    from app.routes.locations import locations_bp
    from app.routes.users import users_bp
    from app.routes.categories import categories_bp
    from app.routes.logs import logs_bp
    from app.routes.admin_transfer import admin_transfer_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(assets_bp)
    app.register_blueprint(locations_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(categories_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(admin_transfer_bp)

    # Rota de Health Check
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    # Scheduler
    _init_scheduler(app)

    return app


def _validate_security_config(app: Flask, config_name: str) -> None:
    if config_name != "production":
        return

    insecure_values = {"", "dev-insecure", "jwt-insecure", "change-me", "password"}
    for setting in ("SECRET_KEY", "JWT_SECRET_KEY"):
        value = str(app.config.get(setting) or "")
        if value in insecure_values or len(value) < 32:
            raise RuntimeError(f"{setting} deve ser um segredo forte em produção.")

    required_flags = (
        "JWT_COOKIE_SECURE",
        "JWT_COOKIE_CSRF_PROTECT",
        "REQUIRE_MUTATING_ORIGIN",
    )
    if any(not app.config.get(setting) for setting in required_flags):
        raise RuntimeError("Configuração insegura de cookies/CSRF em produção.")

    if app.config.get("RATELIMIT_STORAGE_URI") == "memory://":
        raise RuntimeError(
            "RATELIMIT_STORAGE_URI deve usar armazenamento partilhado em produção."
        )

    owner_user = os.environ.get("POSTGRES_USER")
    app_user = app.config.get("APP_DB_USER")
    if owner_user and owner_user == app_user:
        raise RuntimeError("POSTGRES_USER e APP_DB_USER devem ser diferentes.")

    app_db_password = str(app.config.get("APP_DB_PASSWORD") or "")
    if app_db_password in insecure_values or len(app_db_password) < 12:
        raise RuntimeError("APP_DB_PASSWORD deve ser forte em produção.")

    _validate_production_email_config(app)


def _validate_production_email_config(app: Flask) -> None:
    app_base_url = str(app.config.get("APP_BASE_URL") or "")
    if not app_base_url.startswith("https://"):
        raise RuntimeError("APP_BASE_URL deve usar HTTPS em produção.")

    mail_server = str(app.config.get("MAIL_SERVER") or "").strip()
    mail_port = app.config.get("MAIL_PORT")
    mail_sender = str(app.config.get("MAIL_DEFAULT_SENDER") or "").strip()

    if not mail_server or not mail_port or not mail_sender:
        raise RuntimeError("Configuração de email incompleta em produção.")

    if mail_server.lower() == "mailhog":
        raise RuntimeError("MAIL_SERVER não pode usar Mailhog em produção.")

    if mail_server.lower() == "smtp.resend.com":
        if app.config.get("MAIL_USERNAME") != "resend":
            raise RuntimeError("MAIL_USERNAME deve ser resend para SMTP Resend.")
        if not app.config.get("MAIL_PASSWORD"):
            raise RuntimeError("MAIL_PASSWORD é obrigatório para SMTP Resend.")
        if not app.config.get("MAIL_USE_TLS") or app.config.get("MAIL_USE_SSL"):
            raise RuntimeError(
                "SMTP Resend deve usar MAIL_USE_TLS=true e MAIL_USE_SSL=false."
            )


def _register_cli(app: Flask) -> None:
    from app.cli import bootstrap_admin

    app.cli.add_command(bootstrap_admin)


def _register_request_security(app: Flask) -> None:
    @app.before_request
    def validate_mutating_request_origin():
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
            return None
        if not request.path.startswith("/api/"):
            return None

        source = request.headers.get("Origin") or request.headers.get("Referer")
        if not source:
            if app.config.get("REQUIRE_MUTATING_ORIGIN", False):
                return error("Origem da requisição ausente.", status=403)
            return None

        if not _is_same_origin(source, _request_origin()):
            return error("Origem da requisição inválida.", status=403)

        return None


def _request_origin() -> str:
    return f"{request.scheme}://{request.host}"


def _is_same_origin(source: str, expected: str) -> bool:
    source_parts = urlparse(source)
    expected_parts = urlparse(expected)

    source_origin = (
        source_parts.scheme,
        source_parts.hostname,
        source_parts.port or _default_port(source_parts.scheme),
    )
    expected_origin = (
        expected_parts.scheme,
        expected_parts.hostname,
        expected_parts.port or _default_port(expected_parts.scheme),
    )
    return source_origin == expected_origin


def _default_port(scheme: str) -> int | None:
    if scheme == "http":
        return 80
    if scheme == "https":
        return 443
    return None


def _init_scheduler(app: Flask) -> None:
    if app.config.get("TESTING"):
        return

    scheduler = BackgroundScheduler(timezone="Europe/Lisbon")

    def run_check_maintenance():
        with app.app_context():
            try:
                updated = check_maintenance()
                logger.info(
                    f"[Scheduler] Job concluído - {updated} asset(s) atualizados."
                )
            except Exception as ex:
                logger.error(
                    f"[Scheduler] Erro no job de manutenção: {ex}", exc_info=True
                )

    scheduler.add_job(
        func=run_check_maintenance,
        trigger=CronTrigger(hour=8, minute=0),
        id="maintenance_check",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    scheduler.start()
    logger.info("[Scheduler] Scheduler de manutenção iniciado (cron: 08:00 diário).")

    atexit.register(lambda: _shutdown_scheduler(scheduler))


def _shutdown_scheduler(scheduler: BackgroundScheduler) -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Scheduler desligado.")
