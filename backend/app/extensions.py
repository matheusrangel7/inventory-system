from flask_sqlalchemy_lite import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Instâncias das extensões — ainda sem app associada
db = SQLAlchemy()
jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address)