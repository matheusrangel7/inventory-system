/*
    Funcionalidades comuns das dashboards.
*/
(function () {
    const ACTIVE_NAV_CLASS = "w-full flex items-center gap-3 px-4 py-3 mb-2 rounded bg-white text-blue-900";
    const INACTIVE_NAV_CLASS = "w-full flex items-center gap-3 px-4 py-3 mb-2 rounded text-white hover:bg-blue-800";

    function setTextContentByIds(ids, value) {
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    function setAvatarText(text) {
        const avatar = document.querySelector("[data-dashboard-avatar]");
        if (avatar) avatar.textContent = text;
    }

    async function initDashboard(options = {}) {
        const {
            expectedRole = null,
            avatarText = null,
            emailElementIds = ["userEmail", "adminEmail"],
        } = options;

        const user = await requireAuth();
        if (!user) return null;

        if (expectedRole && user.role !== expectedRole) {
            window.location.href = getDashboardPath(user.role);
            return null;
        }

        setTextContentByIds(emailElementIds, `${user.email} (${user.role})`);

        if (avatarText) {
            setAvatarText(avatarText);
        }

        document.getElementById("logoutBtn")?.addEventListener("click", () => {
            logout();
        });

        return user;
    }

    function showDashboardView(viewName, views, options = {}) {
        const {
            titleElementId = "pageTitle",
            onAfterChange = null,
            activeClass = ACTIVE_NAV_CLASS,
            inactiveClass = INACTIVE_NAV_CLASS,
        } = options;

        views.forEach((view) => {
            const viewId = typeof view === "string" ? view : view.id;
            const title = typeof view === "string" ? view.toUpperCase() : (view.title || view.id.toUpperCase());
            const div = document.getElementById(`view-${viewId}`);
            const btn = document.getElementById(`btn-${viewId}`);

            if (!div || !btn) return;

            if (viewId === viewName) {
                div.classList.remove("hidden");
                btn.className = activeClass;
                const titleEl = document.getElementById(titleElementId);
                if (titleEl) titleEl.innerText = title;
            } else {
                div.classList.add("hidden");
                btn.className = inactiveClass;
            }
        });

        if (typeof onAfterChange === "function") {
            onAfterChange(viewName);
        }
    }

    function safeDestroyChart(chart) {
        if (chart && typeof chart.destroy === "function") {
            chart.destroy();
        }
    }

    window.DashboardCommon = {
        initDashboard,
        showDashboardView,
        safeDestroyChart,
        ACTIVE_NAV_CLASS,
        INACTIVE_NAV_CLASS,
    };

    window.initDashboard = initDashboard;
})();
