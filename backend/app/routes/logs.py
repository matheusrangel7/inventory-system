from flask import Blueprint, request

from app.security.permissions import Permission
from app.services import log_service
from app.services.scheduler_service import check_maintenance
from app.utils.decorators import permission_required
from app.utils.responses import error, success

logs_bp = Blueprint("logs", __name__, url_prefix="/api/logs")


@logs_bp.route("/", methods=["GET"])
@permission_required(Permission.LOGS_READ)
def list_logs():
    limit = request.args.get("limit", default=200, type=int)
    limit = max(1, min(limit or 200, 1000))
    return success(data=log_service.get_all_logs(limit=limit))


@logs_bp.route("/trigger-maintenance-check", methods=["POST"])
@permission_required(Permission.MAINTENANCE_RUN)
def trigger_maintenance_check():
    updated = check_maintenance()
    return success(
        message=f"Verificação concluída. {updated} asset(s) atualizados.",
        data={"updated_count": updated},
    )


@logs_bp.route("/<int:log_id>", methods=["GET"])
@permission_required(Permission.LOGS_READ)
def get_log(log_id: int):
    log = log_service.get_log_by_id(log_id)
    if not log:
        return error("Registo de auditoria não encontrado.", status=404)
    return success(data=log)
