from flask_sqlalchemy_lite import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail
from argon2 import PasswordHasher

# Instâncias das extensões
db = SQLAlchemy()
jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address)
mail = Mail()
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
)

DUMMY_ARGON2_HASH = ph.hash("dummy_value_for_timing_mitigation_cr7")
