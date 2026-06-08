from types import SimpleNamespace

import app as app_package
from flask import Flask

from app.domain.enums import RegistrationStatus, UserRole
from app.routes import admin_transfer, assets, categories, logs, locations, users
from app.security.permissions import Permission, has_permission, permissions_for_role
from app.services import location_service
from app.utils import decorators


def test_administrador_has_every_permission():
    assert permissions_for_role(UserRole.ADMINISTRATOR) == frozenset(Permission)


def test_gestor_has_only_operational_permissions():
    assert permissions_for_role(UserRole.MANAGER) == {
        Permission.ASSETS_READ,
        Permission.ASSETS_CREATE,
        Permission.ASSETS_UPDATE,
        Permission.ASSETS_REMOVE,
        Permission.LOCATIONS_READ,
        Permission.CATEGORIES_READ,
    }


def test_unknown_role_has_no_permissions():
    assert permissions_for_role("Auditor") == frozenset()
    assert not has_permission("Auditor", Permission.LOGS_READ)


def test_administrator_cannot_be_assigned_as_location_manager(monkeypatch):
    admin = SimpleNamespace(role=UserRole.ADMINISTRATOR)
    result = SimpleNamespace(scalar_one_or_none=lambda: admin)
    fake_db = SimpleNamespace(
        session=SimpleNamespace(execute=lambda statement: result)
    )
    monkeypatch.setattr(location_service, "db", fake_db)

    ok, message, manager_id = location_service._validate_manager(7)

    assert not ok
    assert message == "Utilizador inválido para gestor responsável."
    assert manager_id is None


def test_permission_required_allows_authorized_role(monkeypatch):
    monkeypatch.setattr(
        decorators,
        "_load_current_user",
        lambda: (SimpleNamespace(role=UserRole.MANAGER), None, None),
    )

    @decorators.permission_required(Permission.ASSETS_CREATE)
    def protected():
        return "ok"

    assert protected() == "ok"


def test_permission_required_blocks_missing_permission(monkeypatch):
    app = Flask(__name__)
    monkeypatch.setattr(
        decorators,
        "_load_current_user",
        lambda: (SimpleNamespace(role=UserRole.MANAGER), None, None),
    )

    @decorators.permission_required(Permission.USERS_READ)
    def protected():
        return "ok"

    with app.app_context():
        response, status = protected()

    assert status == 403
    assert response.get_json()["error"] == "Acesso não autorizado."


def test_mfa_step_token_cannot_be_used_as_access_token(monkeypatch):
    app = Flask(__name__)
    monkeypatch.setattr(decorators, "verify_jwt_in_request", lambda: None)
    monkeypatch.setattr(
        decorators,
        "get_jwt",
        lambda: {"token_use": "mfa_step", "mfa_enrollment": True},
    )

    with app.test_request_context("/api/assets/"):
        user, response, status = decorators._load_current_user()

    assert user is None
    assert status == 401
    assert response.get_json()["error"] == "Token inválido."


def test_database_role_wins_over_forged_jwt_role(monkeypatch):
    app = Flask(__name__)
    database_user = SimpleNamespace(
        user_id=7,
        role=UserRole.MANAGER,
        is_active=True,
        registration_status=RegistrationStatus.COMPLETED,
    )
    monkeypatch.setattr(decorators, "verify_jwt_in_request", lambda: None)
    monkeypatch.setattr(
        decorators,
        "get_jwt",
        lambda: {"token_use": "access", "role": "Administrador"},
    )
    monkeypatch.setattr(decorators, "get_jwt_identity", lambda: "7")
    monkeypatch.setattr(
        decorators,
        "db",
        SimpleNamespace(
            session=SimpleNamespace(get=lambda model, user_id: database_user)
        ),
    )

    @decorators.permission_required(Permission.LOGS_READ)
    def protected():
        return "ok"

    with app.test_request_context("/api/logs/"):
        response, status = protected()

    assert status == 403
    assert response.get_json()["error"] == "Acesso não autorizado."


def test_route_handlers_declare_expected_permissions():
    assert assets.search_assets.required_permission == Permission.ASSETS_READ
    assert assets.add_asset.required_permission == Permission.ASSETS_CREATE
    assert assets.update_asset.required_permission == Permission.ASSETS_UPDATE
    assert assets.delete_asset.required_permission == Permission.ASSETS_REMOVE

    assert locations.list_locations.required_permission == Permission.LOCATIONS_READ
    assert locations.create_location.required_permission == Permission.LOCATIONS_CREATE
    assert categories.create_category.required_permission == Permission.CATEGORIES_CREATE

    assert users.create_user.required_permission == Permission.USERS_INVITE
    assert users.delete_user.required_permission == Permission.USERS_DEACTIVATE
    assert logs.list_logs.required_permission == Permission.LOGS_READ
    assert (
        logs.trigger_maintenance_check.required_permission
        == Permission.MAINTENANCE_RUN
    )
    assert (
        admin_transfer.transfer_new.required_permission
        == Permission.ADMIN_TRANSFER_START
    )
    assert (
        admin_transfer.cancel_pending.required_permission
        == Permission.ADMIN_TRANSFER_CANCEL
    )


def test_every_business_route_requires_an_explicit_permission(monkeypatch):
    monkeypatch.setattr(app_package, "_init_scheduler", lambda app: None)
    application = app_package.create_app("development")

    unprotected_routes = []
    for rule in application.url_map.iter_rules():
        if not rule.rule.startswith("/api/"):
            continue
        if rule.rule == "/api/health" or rule.rule.startswith("/api/auth/"):
            continue

        view = application.view_functions[rule.endpoint]
        if not hasattr(view, "required_permission"):
            unprotected_routes.append(f"{sorted(rule.methods)} {rule.rule}")

    assert unprotected_routes == []
