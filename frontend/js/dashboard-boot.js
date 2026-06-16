(function () {
    function bootDashboard() {
        const role = document.body.dataset.dashboardRole;

        if (role === "admin") {
            window.initAdminDashboard?.();
            return;
        }

        if (role === "gestor") {
            window.initGestorDashboard?.();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootDashboard, { once: true });
    } else {
        bootDashboard();
    }
})();
