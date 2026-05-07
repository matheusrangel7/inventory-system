import os
from flask import Flask, jsonify
from app.config import config_map
from app.extensions import db, jwt, limiter
from app.models.base import Base


def create_app(config_name: str = None) -> Flask:
    """
    Application Factory.
    Cria e configura a instância da aplicação Flask.
    """
    app = Flask(__name__)

    # --- Carregar Configuração ---
    # Usa a variável de ambiente FLASK_ENV para escolher a config,
    # com fallback para 'development' se não estiver definida.
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    app.config.from_object(config_map.get(config_name, config_map["default"]))

    # --- Inicializar Extensões ---
    # init_app() associa cada extensão à app sem criar dependência circular.
    # Flask-SQLAlchemy-Lite recebe a Base declarativa no init_app.
    db.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)

    # --- Registar Blueprints ---
    from app.routes.auth import auth_bp
    from app.routes.assets import assets_bp
    from app.routes.locations import locations_bp
    from app.routes.users import users_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(assets_bp)
    app.register_blueprint(locations_bp)
    app.register_blueprint(users_bp)

    # --- Rota de Health Check ---
    # Permite verificar rapidamente se a API está viva.
    # Usada pelo Docker para saber se o contentor está saudável.
    @app.route("/api/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "environment": config_name}), 200

    return app