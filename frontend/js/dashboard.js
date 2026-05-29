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

    const CHART_COLORS = [
        "#1e3a8a",
        "#2563eb",
        "#60a5fa",
        "#f59e0b",
        "#ef4444",
        "#10b981",
        "#6366f1",
        "#64748b",
    ];

    const DOUGHNUT_CENTER_TOTAL_PLUGIN = {
        id: "invubiDoughnutCenterTotal",
        afterDraw(chart, _args, pluginOptions = {}) {
            if (!pluginOptions.display || !chart.chartArea) return;

            const dataset = chart.data?.datasets?.[0];
            const total = (dataset?.data || []).reduce((sum, value) => sum + Number(value || 0), 0);
            const { ctx, chartArea } = chart;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2;

            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = pluginOptions.color || "#1e3a8a";
            ctx.font = "700 20px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
            ctx.fillText(String(total), centerX, centerY - 7);
            ctx.fillStyle = pluginOptions.mutedColor || "#64748b";
            ctx.font = "600 11px Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
            ctx.fillText(pluginOptions.label || "Total", centerX, centerY + 12);
            ctx.restore();
        },
    };

    function toNumberArray(values = []) {
        return values.map((value) => {
            const number = Number(value);
            return Number.isFinite(number) ? Math.max(0, number) : 0;
        });
    }

    function getCountStepSize(values = []) {
        const max = Math.max(0, ...toNumberArray(values));
        if (max <= 10) return 1;
        if (max <= 25) return 5;
        if (max <= 50) return 10;
        return Math.ceil(max / 5 / 10) * 10;
    }

    function getSuggestedCountMax(values = []) {
        const max = Math.max(0, ...toNumberArray(values));
        const step = getCountStepSize(values);
        if (max === 0) return step;
        return Math.max(step, Math.ceil(max / step) * step);
    }

    function formatCountTooltip(context) {
        const label = context.label || context.dataset?.label || "Total";
        const rawValue = context.parsed?.y ?? context.parsed ?? context.raw ?? 0;
        const value = Array.isArray(rawValue) ? Number(rawValue[0] || 0) : Number(rawValue || 0);
        const values = toNumberArray(context.dataset?.data || []);
        const total = values.reduce((sum, item) => sum + item, 0);

        if (context.chart?.config?.type === "doughnut" && total > 0) {
            const percentage = ((value / total) * 100).toFixed(0);
            return `${label}: ${value} (${percentage}%)`;
        }

        return `${label}: ${value}`;
    }

    function getIntegerCountScale(values = []) {
        return {
            beginAtZero: true,
            suggestedMax: getSuggestedCountMax(values),
            border: { display: false },
            grid: { color: "rgba(148, 163, 184, 0.25)" },
            ticks: {
                precision: 0,
                stepSize: getCountStepSize(values),
                callback(value) {
                    const number = Number(value);
                    return Number.isInteger(number) ? String(number) : "";
                },
            },
        };
    }

    function getBaseChartOptions(extraOptions = {}) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        boxHeight: 8,
                        padding: 16,
                    },
                },
                tooltip: {
                    callbacks: { label: formatCountTooltip },
                },
            },
            ...extraOptions,
        };
    }

    function createLineCountChart(canvas, { labels = [], values = [], label = "Registos" } = {}) {
        const numericValues = toNumberArray(values);

        return new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label,
                    data: numericValues,
                    borderColor: CHART_COLORS[0],
                    backgroundColor: "rgba(30, 58, 138, 0.08)",
                    pointBackgroundColor: "#ffffff",
                    pointBorderColor: CHART_COLORS[0],
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true,
                }],
            },
            options: getBaseChartOptions({
                scales: {
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: { maxRotation: 0, autoSkip: true },
                    },
                    y: getIntegerCountScale(numericValues),
                },
            }),
        });
    }

    function createBarCountChart(canvas, { labels = [], values = [], label = "Ativos" } = {}) {
        const numericValues = toNumberArray(values);

        return new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label,
                    data: numericValues,
                    backgroundColor: "rgba(30, 58, 138, 0.82)",
                    borderColor: CHART_COLORS[0],
                    borderWidth: 1,
                    borderRadius: 8,
                    maxBarThickness: 44,
                }],
            },
            options: getBaseChartOptions({
                scales: {
                    x: {
                        border: { display: false },
                        grid: { display: false },
                    },
                    y: getIntegerCountScale(numericValues),
                },
            }),
        });
    }

    function createDoughnutCountChart(canvas, { labels = [], values = [], label = "Total" } = {}) {
        const numericValues = toNumberArray(values);

        return new Chart(canvas.getContext("2d"), {
            type: "doughnut",
            data: {
                labels,
                datasets: [{
                    data: numericValues,
                    backgroundColor: labels.map((_item, index) => CHART_COLORS[index % CHART_COLORS.length]),
                    borderColor: "#ffffff",
                    borderWidth: 3,
                    hoverOffset: 6,
                }],
            },
            options: getBaseChartOptions({
                cutout: "64%",
                interaction: { mode: "nearest", intersect: true },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            usePointStyle: true,
                            boxWidth: 8,
                            boxHeight: 8,
                            padding: 14,
                        },
                    },
                    tooltip: {
                        callbacks: { label: formatCountTooltip },
                    },
                    invubiDoughnutCenterTotal: {
                        display: true,
                        label,
                    },
                },
            }),
            plugins: [DOUGHNUT_CENTER_TOTAL_PLUGIN],
        });
    }

    function sortCountData(data, preferredOrder = []) {
        const labels = data?.labels || [];
        const values = data?.values || [];
        const preferredIndex = new Map(preferredOrder.map((label, index) => [String(label).toLowerCase(), index]));

        return labels
            .map((label, index) => ({ label, value: Number(values[index] || 0) }))
            .sort((a, b) => {
                const indexA = preferredIndex.has(String(a.label).toLowerCase()) ? preferredIndex.get(String(a.label).toLowerCase()) : Number.MAX_SAFE_INTEGER;
                const indexB = preferredIndex.has(String(b.label).toLowerCase()) ? preferredIndex.get(String(b.label).toLowerCase()) : Number.MAX_SAFE_INTEGER;

                if (indexA !== indexB) return indexA - indexB;
                if (b.value !== a.value) return b.value - a.value;
                return String(a.label).localeCompare(String(b.label), "pt", { sensitivity: "base", numeric: true });
            })
            .reduce((acc, item) => {
                acc.labels.push(item.label);
                acc.values.push(item.value);
                return acc;
            }, { labels: [], values: [] });
    }

    window.DashboardCommon = {
        initDashboard,
        showDashboardView,
        safeDestroyChart,
        createLineCountChart,
        createBarCountChart,
        createDoughnutCountChart,
        sortCountData,
        getIntegerCountScale,
        ACTIVE_NAV_CLASS,
        INACTIVE_NAV_CLASS,
    };

    window.initDashboard = initDashboard;
})();