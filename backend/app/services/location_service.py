from sqlalchemy import select
from app.models.location import Location
from app.extensions import db


def get_available_locations() -> list[Location]:
    return (
        db.session.execute(
            select(Location)
            .where(
                Location.location_manager_id == None,
                Location.is_active == True,
            )
            .order_by(Location.location_name.asc())
        )
        .scalars()
        .all()
    )
