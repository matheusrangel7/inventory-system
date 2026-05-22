/**
 * Inicialização comum aos dashboards (admin e gestor).
 * Requer: api.js e auth.js carregados antes.
 */
function initDashboard(options = {}) {
    const { expectedRole = null } = options;

    requireAuth().then((user) => {
        if (!user) return;

        if (expectedRole && user.role !== expectedRole) {
            window.location.href = getDashboardPath(user.role);
            return;
        }

        const emailEl = document.getElementById("userEmail");
        if (emailEl) {
            emailEl.textContent = `${user.email} (${user.role})`;
        }
    });

    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        logout();
    });
}