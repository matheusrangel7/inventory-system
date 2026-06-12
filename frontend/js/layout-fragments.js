/*
    Fragmentos reutilizáveis do layout das dashboards.
    Mantém a estrutura comum fora das páginas para reduzir duplicação.
*/
(function () {
    const fragmentCache = new Map();

    const FALLBACK_FRAGMENTS = {
        "/fragments/dashboard-sidebar.html": `
<aside class="w-64 bg-blue-900 h-full p-4 flex flex-col flex-shrink-0" data-dashboard-sidebar-root>
    <div class="flex items-center gap-3 mb-8 p-2">
        <img src="/assets/ubi-logo-white.png" class="w-20 h-20" alt="Logotipo UBI">
        <h1 class="text-4xl text-white font-semibold">InvUBI</h1>
    </div>
    <nav class="flex-1" data-dashboard-nav aria-label="Navegação principal"></nav>
    <div class="mt-auto">
        <button type="button" id="logoutBtn" class="w-full bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors font-bold">SAIR</button>
    </div>
</aside>`,
        "/fragments/dashboard-header.html": `
<header class="bg-white shadow-sm p-4 flex justify-between items-center flex-shrink-0" data-dashboard-header-root>
    <h1 class="text-xl font-bold" id="pageTitle" data-dashboard-title></h1>
    <div class="flex items-center gap-4">
        <span class="text-sm" id="userEmail" data-dashboard-user-email></span>
        <span class="hidden" id="adminEmail" aria-hidden="true"></span>
        <div class="relative" data-profile-menu-root>
            <button type="button" class="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-900/30"
                data-profile-menu-toggle aria-haspopup="true" aria-expanded="false" aria-label="Abrir menu do perfil">
                <span class="w-10 h-10 bg-gray-600 text-white rounded-full flex items-center justify-center font-bold"
                    data-dashboard-avatar></span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500" fill="none"
                    viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            <div class="profile-menu-dropdown right-0 z-50 hidden rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
                data-profile-menu role="menu">
                <button type="button"
                    class="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-blue-900 hover:bg-blue-50"
                    data-password-change-open role="menuitem">
                    Alterar palavra-passe
                </button>
            </div>
        </div>
    </div>
</header>`,
        "/fragments/dashboard-footer.html": `
<footer class="border-t border-gray-200 bg-white px-6 py-3 text-xs font-semibold text-gray-500" data-dashboard-footer-root>
    <div class="flex flex-wrap items-center justify-between gap-2">
        <span>InvUBI</span>
        <span>Gestão de inventário</span>
    </div>
</footer>`,
    };

    const ICONS = {
        dashboard: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>`,
        users: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>`,
        locations: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`,
        assets: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>`,
        categories: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>`,
        logs: `<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    };

    const NAV_CONFIGS = {
        admin: [
            { id: "dashboard", label: "Página Inicial", icon: "dashboard" },
            { id: "utilizadores", label: "Utilizadores", icon: "users" },
            { id: "locais", label: "Locais", icon: "locations" },
            { id: "ativos", label: "Ativos", icon: "assets" },
            { id: "categorias", label: "Categorias", icon: "categories" },
            { id: "registos", label: "Registos", icon: "logs" },
        ],
        gestor: [
            { id: "inicio", label: "Página Inicial", icon: "dashboard" },
            { id: "ativos", label: "Ativos", icon: "assets" },
            { id: "categorias", label: "Categorias", icon: "categories" },
            { id: "locais", label: "Locais", icon: "locations" },
        ],
    };

    const DEFAULT_TITLES = {
        admin: "DASHBOARD",
        gestor: "PÁGINA INICIAL",
    };

    const DEFAULT_AVATARS = {
        admin: "AD",
        gestor: "AG",
    };

    async function readFragment(path) {
        if (fragmentCache.has(path)) {
            return fragmentCache.get(path);
        }

        let html = FALLBACK_FRAGMENTS[path] || "";
        try {
            const response = await fetch(path, { cache: "no-cache" });
            if (response.ok) {
                html = await response.text();
            }
        } catch (_error) {
            // Se estiver a correr por ficheiro/local sem servidor, usa o fallback em memória.
        }

        fragmentCache.set(path, html);
        return html;
    }

    function setHostHtml(selector, html) {
        const host = document.querySelector(selector);
        if (!host) return null;
        host.innerHTML = html.trim();
        return host;
    }

    function getInactiveClass() {
        return window.DashboardCommon?.INACTIVE_NAV_CLASS || "w-full flex items-center gap-3 px-4 py-3 mb-2 rounded text-white hover:bg-blue-800";
    }

    function getActiveClass() {
        return window.DashboardCommon?.ACTIVE_NAV_CLASS || "w-full flex items-center gap-3 px-4 py-3 mb-2 rounded bg-white text-blue-900";
    }

    function renderNavItems(role, activeView, customItems) {
        const nav = document.querySelector("[data-dashboard-nav]");
        if (!nav) return;

        const items = customItems || NAV_CONFIGS[role] || [];
        const activeClass = getActiveClass();
        const inactiveClass = getInactiveClass();

        nav.innerHTML = items.map((item) => {
            const icon = ICONS[item.icon] || ICONS.dashboard;
            const isActive = item.id === activeView;
            return `
                <button type="button" onclick="showView('${item.id}')" id="btn-${item.id}"
                    class="${isActive ? activeClass : inactiveClass}">
                    ${icon}
                    <span>${item.label}</span>
                </button>
            `;
        }).join("");
    }

    async function mountDashboardLayout(options = {}) {
        const role = options.role || document.body.dataset.dashboardRole || "gestor";
        const activeView = options.activeView || (role === "admin" ? "dashboard" : "inicio");
        const title = options.title || DEFAULT_TITLES[role] || "DASHBOARD";
        const avatarText = options.avatarText || DEFAULT_AVATARS[role] || "--";

        await Promise.all([
            readFragment("/fragments/dashboard-sidebar.html").then((html) => setHostHtml("[data-dashboard-sidebar]", html)),
            readFragment("/fragments/dashboard-header.html").then((html) => setHostHtml("[data-dashboard-header]", html)),
            readFragment("/fragments/dashboard-footer.html").then((html) => setHostHtml("[data-dashboard-footer]", html)),
        ]);

        renderNavItems(role, activeView, options.navItems);

        const titleEl = document.getElementById("pageTitle");
        if (titleEl) titleEl.textContent = title;

        const avatar = document.querySelector("[data-dashboard-avatar]");
        if (avatar) avatar.textContent = avatarText;
    }

    window.InvUBILayout = {
        mountDashboardLayout,
        renderNavItems,
        NAV_CONFIGS,
    };
})();
