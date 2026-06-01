import logging
from datetime import date

from dateutil.relativedelta import relativedelta
from sqlalchemy import select

from app.extensions import db
from app.models.inventory import Asset
from app.models.location import Location
from app.models.user import User
from app.services.email_service import send_maintenance_alert_email
from app.utils.audit import log_action
from app.constants import ORIGIN_SCHEDULER_MANUTENCAO

logger = logging.getLogger(__name__)

def check_maintenance() -> int:
    today = date.today()
    logger.info(f"[Scheduler] A verificar manutenções para {today}...")

    assets = db.session.execute(
        select(Asset).where(
            Asset.is_active == True,
            Asset.asset_state == "Bom Estado",
            Asset.maintenance_period_months.is_not(None),
            Asset.last_maintenance.is_not(None),
        )
    ).scalars().all()

    due_assets: list[Asset] = []
    for asset in assets:
        due_date = asset.last_maintenance + relativedelta(months=asset.maintenance_period_months)
        if today >= due_date:
            due_assets.append(asset)

    if not due_assets:
        logger.info("[Scheduler] Nenhum asset necessita de manutenção.")
        return 0
    
    logger.info(f"[Scheduler] {len(due_assets)} asset(s) a verificar.")

    updated_count = 0
    for asset in due_assets:
        recipient = _get_recipient_email(asset.location_id)
        if not recipient:
            logger.warning(
                f"[Scheduler] Asset {asset.asset_id}: sem destinatário de email."
            )
            continue

        due_date = asset.last_maintenance + relativedelta(
            months=asset.maintenance_period_months
        )
        email_sent = send_maintenance_alert_email(
            to_email=recipient,
            asset_id=asset.asset_id,
            serial_number=asset.serial_number,
            due_date_str=due_date.strftime("%d/%m/%Y"),
        )
        if not email_sent:
            logger.error(
                f"[Scheduler] Falha ao enviar email para asset {asset.asset_id}."
            )
            continue

        old_state = asset.asset_state
        asset.asset_state = "Necessita Manutenção"

        log_action(
            action="UPDATE",
            table_name="assets",
            record_id=asset.asset_id,
            user_id=None,
            origin=ORIGIN_SCHEDULER_MANUTENCAO,
            old_value={"asset_state": old_state},
            new_value={"asset_state": "Necessita Manutenção"},
        )
        db.session.commit()
        updated_count += 1
        logger.info(
            f"[Scheduler] Email enviado para {recipient} e asset {asset.asset_id} atualizado."
        )

    return updated_count


def _get_recipient_email(location_id: int) -> str | None:
    location = db.session.get(Location, location_id)
    if location and location.location_manager_id:

        manager = db.session.get(User, location.location_manager_id)
        if manager and manager.is_active:
            return manager.email
        
    admin = db.session.execute(
        select(User).where(
            User.role == "Administrador",
            User.is_active == True,
        ).limit(1)
    ).scalar_one_or_none()

    return admin.email if admin else None
