from flask import Blueprint, request

from app.services import log_service
from app.services.scheduler_service import check_maintenance
from app.security.permissions import Permission
from app.utils.decorators import get_current_role, get_current_user_id, permission_required
from app.utils.responses import error, success

logs_bp = Blueprint("logs", __name__, url_prefix="/api/logs")


def _safe_limit(default: int = 200, maximum: int = 1000) -> int:
    limit = request.args.get("limit", default=default, type=int)
    return max(1, min(limit or default, maximum))


@logs_bp.route("/", methods=["GET"])
@permission_required(Permission.LOGS_READ)
def list_logs():
    """Lista registos de auditoria respeitando o nível do utilizador.

    Administrador mantém o comportamento global. Gestor recebe apenas registos
    de ativos localizados em salas atribuídas a ele.
    """
    role = get_current_role()
    user_id = get_current_user_id()
    limit = _safe_limit()

    if role == "Administrador":
        return success(data=log_service.get_all_logs(limit=limit))

    return success(data=log_service.get_manager_asset_logs(manager_id=user_id, limit=limit))


@logs_bp.route("/<int:log_id>", methods=["GET"])
@permission_required(Permission.LOGS_READ)
def get_log(log_id: int):
    """Obtém detalhe de um registo, com scope por role."""
    role = get_current_role()
    user_id = get_current_user_id()

    if role == "Administrador":
        log = log_service.get_log_by_id(log_id)
    else:
        log = log_service.get_manager_asset_log_by_id(log_id=log_id, manager_id=user_id)

    if not log:
        return error("Registo não encontrado ou sem permissão.", status=404)

    return success(data=log)


@logs_bp.route("/<int:log_id>/rollback", methods=["POST"])
@permission_required(Permission.LOGS_READ)
def rollback_log(log_id: int):
    """Executa rollback respeitando permissões por nível de utilizador.

    Gestor só pode reverter registos de assets das salas atribuídas a ele.
    Administrador mantém acesso global aos rollbacks suportados pelo serviço.
    """
    ok, message, data = log_service.rollback_log(
        log_id=log_id,
        user_id=get_current_user_id(),
        role=get_current_role(),
    )

    if not ok:
        status = 403 if log_service.is_permission_error(message) else 400
        return error(message, status=status)

    return success(message=message, data=data)


@logs_bp.route("/trigger-maintenance-check", methods=["POST"])
@permission_required(Permission.MAINTENANCE_RUN)
def trigger_maintenance_check():
    updated = check_maintenance()
    return success(
        message=f"Verificação concluída. {updated} asset(s) atualizados.",
        data={"updated_count": updated},
    )