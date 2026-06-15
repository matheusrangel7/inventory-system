from enum import StrEnum

from app.domain.enums import UserRole


class Permission(StrEnum):
    ASSETS_READ = "assets.read"
    ASSETS_CREATE = "assets.create"
    ASSETS_UPDATE = "assets.update"
    ASSETS_REMOVE = "assets.remove"

    LOCATIONS_READ = "locations.read"
    LOCATIONS_CREATE = "locations.create"
    LOCATIONS_UPDATE = "locations.update"
    LOCATIONS_REMOVE = "locations.remove"

    CATEGORIES_READ = "categories.read"
    CATEGORIES_CREATE = "categories.create"
    CATEGORIES_UPDATE = "categories.update"
    CATEGORIES_REMOVE = "categories.remove"

    USERS_READ = "users.read"
    USERS_INVITE = "users.invite"
    USERS_UPDATE = "users.update"
    USERS_DEACTIVATE = "users.deactivate"
    USERS_RESEND_REGISTRATION = "users.resend_registration"
    USERS_RECOVER_ACCESS = "users.recover_access"

    LOGS_READ = "logs.read"
    MAINTENANCE_RUN = "maintenance.run"

    ADMIN_TRANSFER_READ = "admin_transfer.read"
    ADMIN_TRANSFER_START = "admin_transfer.start"
    ADMIN_TRANSFER_CANCEL = "admin_transfer.cancel"
    ADMIN_TRANSFER_RESEND = "admin_transfer.resend"


GESTOR_PERMISSIONS = frozenset(
    {
        Permission.ASSETS_READ,
        Permission.ASSETS_CREATE,
        Permission.ASSETS_UPDATE,
        Permission.ASSETS_REMOVE,
        Permission.LOCATIONS_READ,
        Permission.CATEGORIES_READ,
    }
)

ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.ADMINISTRATOR: frozenset(Permission),
    UserRole.MANAGER: GESTOR_PERMISSIONS,
}


def permissions_for_role(role: str | UserRole | None) -> frozenset[Permission]:
    try:
        normalized_role = UserRole(role) if role is not None else None
    except (TypeError, ValueError):
        return frozenset()
    return ROLE_PERMISSIONS.get(normalized_role, frozenset())


def has_permission(
    role: str | UserRole | None,
    permission: Permission,
) -> bool:
    return permission in permissions_for_role(role)
