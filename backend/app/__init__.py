import os
import logging
import atexit

from flask import Flask, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from app.services.scheduler_service import check_maintenance

from app.config import config_map
from app.extensions import db, jwt, limiter, mail
from app.models.base import Base

logger = logging.getLogger(__name__)


def create_app(config_name: str = None) -> Flask:
    """
    Application Factory.
    Cria e configura a instância da aplicação Flask.
    """
    app = Flask(__name__)

    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    app.config.from_object(config_map.get(config_name, config_map["default"]))

    # Inicializar extensões
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)
    mail.init_app(app)

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
        return jsonify({"status": "ok", "environment": config_name}), 200

    # Scheduler
    _init_scheduler(app)

    return app


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
