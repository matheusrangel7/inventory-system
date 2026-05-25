/*Lógia e restrições da página de gestor*/
(function () {
    const views = [
        { id: "inicio", title: "PÁGINA INICIAL" },
        { id: "ativos", title: "ATIVOS" },
        { id: "salas", title: "SALAS / LOCAIS" },
    ];

    function showView(viewName) {
        DashboardCommon.showDashboardView(viewName, views);
    }

    async function initGestorDashboard() {
        const user = await initDashboard({
            expectedRole: "Gestor",
            avatarText: "AG",
            emailElementIds: ["userEmail", "adminEmail"],
        });

        if (!user) return;

        window.showView = showView;
        showView("inicio");
    }

    window.initGestorDashboard = initGestorDashboard;
    window.showView = showView;
})();
