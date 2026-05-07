from functools import wraps
from flask import jsonify
# from flask_jwt_extended import get_jwt, verify_jwt_in_request


def admin_required(fn):
    """
    Decorador que restringe o acesso a utilizadores com role 'Administrador'.
    Uso: @admin_required acima de uma rota.
    Implementação completa no Sprint 1.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # TODO
        return fn(*args, **kwargs)
    return wrapper


def manager_required(fn):
    """
    Decorador que restringe o acesso a utilizadores com role 'Gestor'.
    Implementação completa no Sprint 1.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # TODO
        return fn(*args, **kwargs)
    return wrapper