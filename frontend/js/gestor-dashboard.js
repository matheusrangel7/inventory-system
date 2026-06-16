/*Lógica e restrições da página de gestor*/
(function () {
    const views = [
        { id: "inicio", title: "PÁGINA INICIAL" },
        { id: "ativos", title: "ATIVOS" },
        { id: "categorias", title: "CATEGORIAS" },
        { id: "locais", title: "LOCAIS" },
        { id: "registos", title: "REGISTOS" },
    ];

    const TABLE_PAGE_SIZE = 10;
    const GESTOR_ROLLBACKABLE_LOG_TABLES = new Set(["assets"]);
    const ASSET_STATES = ["Bom Estado", "Necessita Manutenção", "Avariado", "Para Abate"];
    const FEATURE_TYPE_LABELS = {
        text: "Texto",
        number: "Número",
        boolean: "Sim/Não",
        date: "Data",
    };
    const ASSET_COLUMN_STORAGE_KEY = "invubi.assets.visibleColumns.gestor.v6";
    const ASSET_REQUIRED_COLUMN_KEYS = new Set(["id", "category"]);
    const ASSET_DEFAULT_COLUMN_KEYS = ["id", "asset", "category", "location", "status"];
    const TABLE_ROW_ACTIONS_CLASS = "inline-flex items-center justify-end gap-1 whitespace-nowrap";
    const TABLE_ACTION_BUTTON_BASE_CLASS = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 py-1 text-[11px] font-black uppercase tracking-wide leading-none transition";
    const TABLE_ACTION_BUTTON_VARIANT_CLASSES = {
        primary: "border-blue-900 bg-blue-900 text-white hover:bg-blue-800",
        danger: "border-red-200 bg-white text-red-700 hover:border-red-600 hover:bg-red-50",
        secondary: "border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900",
        default: "border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900"
    };
    const TABLE_ACTION_CELL_CLASS = "sticky right-0 z-10 w-px whitespace-nowrap border-l border-gray-100 bg-white/95 px-2 py-2 text-right shadow-[-10px_0_14px_-18px_rgba(15,23,42,0.75)] backdrop-blur group-hover:bg-blue-50/95";
    const TABLE_ACTION_HEADER_CLASS = "sticky right-0 z-20 w-px whitespace-nowrap border-b border-l border-gray-200 bg-slate-50 px-2 py-3 text-right text-xs font-black uppercase tracking-wide text-blue-900 shadow-[-10px_0_14px_-18px_rgba(15,23,42,0.75)]";
    const TABLE_ID_CELL_CLASS = "whitespace-nowrap px-4 py-3 text-xs font-black text-gray-800";
    const TABLE_TITLE_CLASS = "font-black text-gray-900";
    const TABLE_SUBTITLE_CLASS = "mt-0.5 text-xs font-bold text-gray-500";
    const TABLE_DATA_CELL_CLASS = "border-b border-gray-100 px-4 py-3 align-top";
    const ASSET_ACTIVE_CHIP_CLASS = "inline-flex items-center gap-1 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-bold text-blue-900 shadow-sm";
    const CHIP_REMOVE_BUTTON_CLASS = "ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-900 transition hover:bg-blue-100";
    const ASSET_SPEC_FILTER_EMPTY_CLASS = "rounded-xl border border-dashed border-gray-300 bg-white px-3 py-4 text-sm font-semibold text-gray-500";
    const ASSET_SPEC_FILTER_ROW_CLASS = "grid grid-cols-1 items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.65fr)_minmax(12rem,1fr)_auto]";
    const ASSET_SPEC_FILTER_REMOVE_CLASS = "inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-red-700 transition hover:border-red-600 hover:bg-red-50";
    const ASSET_COLUMN_OPTION_BASE_CLASS = "flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-blue-200 hover:bg-blue-50/60";
    const ASSET_COLUMN_OPTION_ACTIVE_CLASS = "border-blue-300 bg-blue-50 text-blue-900 ring-1 ring-blue-100";
    const ASSET_COLUMN_OPTION_REQUIRED_CLASS = "cursor-not-allowed opacity-80";
    const ASSET_COLUMN_OPTION_FEATURE_CLASS = "bg-slate-50";
    const ASSET_TEMPLATE_OPTION_LIMIT = 80;
    const CATEGORY_FEATURE_ROW_CLASS = "grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-white p-3 md:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.8fr)_auto_auto]";
    const CATEGORY_FEATURE_FIELD_CLASS = "flex flex-col gap-1";
    const CATEGORY_FEATURE_REPEATABLE_CLASS = "flex items-center gap-2 text-xs font-black uppercase tracking-wide text-blue-900";
    const CATEGORY_FEATURE_REMOVE_CLASS = "inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-red-700 transition hover:border-red-600 hover:bg-red-50";

    let currentUser = null;
    let cacheAtivos = [];
    let cacheLocais = [];
    let cacheCategorias = [];
    let cacheRegistos = [];
    let cacheFeaturesPorCategoria = {};
    let cacheValoresSpecsPorFeature = {};
    let cacheAtivosRegistadosPorCategoria = {};
    let chartEstado = null;
    let chartDistribuicao = null;
    let assetBeingViewedId = null;
    let assetVisibleColumnKeys = new Set(ASSET_DEFAULT_COLUMN_KEYS);
    let assetColumnSelectionTouched = false;
    let lastAssetColumnCategoryId = null;
    let dashboardUtilityObserverStarted = false;

    const tablePaginationState = {
        assets: 1,
        categories: 1,
        locations: 1,
        actionAssets: 1,
        logs: 1,
    };

    function showView(viewName) {
        DashboardCommon.showDashboardView(viewName, views, {
            onAfterChange() {
                renderAll();
            },
        });
    }

    async function initGestorDashboard() {
        await window.InvUBILayout?.mountDashboardLayout({
            role: "gestor",
            title: "PÁGINA INICIAL",
            activeView: "inicio",
            avatarText: "AG",
        });

        currentUser = await initDashboard({
            expectedRole: "Gestor",
            avatarText: "AG",
            emailElementIds: ["userEmail", "adminEmail"],
        });

        if (!currentUser) return;

        exposeGlobals();
        loadAssetColumnPreferences();
        aplicarEstilosTailwindDashboard();
        iniciarObservadorTailwindDashboard();
        bindEvents();
        showView("inicio");
        await reloadData();
    }

    function exposeGlobals() {
        Object.assign(window, {
            showView,
            abrirModalAtivoGestor,
            abrirDetalheAtivoGestor,
            fecharModalGestor,
            verDetalheRegisto,
        });
    }

    function bindEvents() {
        document.getElementById("btnNovoAtivoGestor")?.addEventListener("click", () => abrirModalAtivoGestor());
        document.getElementById("btnVerTodosAtivos")?.addEventListener("click", () => showView("ativos"));
        document.getElementById("btnLimparFiltrosAtivos")?.addEventListener("click", limparFiltrosAtivos);
        document.querySelector("[data-assets-filters-toggle]")?.addEventListener("click", toggleAssetsFilterDrawer);
        document.querySelector("[data-assets-columns-toggle]")?.addEventListener("click", toggleAssetsColumnPicker);
        document.getElementById("btnAdicionarFiltroSpecAtivo")?.addEventListener("click", (event) => {
            event.preventDefault();
            adicionarFiltroSpecAtivo();
        });
        document.querySelector("[data-locations-filters-toggle]")?.addEventListener("click", toggleLocationsFilterDrawer);
        document.querySelector("[data-categories-filters-toggle]")?.addEventListener("click", toggleCategoriesFilterDrawer);
        document.getElementById("btnLimparFiltrosLocais")?.addEventListener("click", limparFiltrosLocais);
        document.getElementById("btnLimparFiltrosCategorias")?.addEventListener("click", limparFiltrosCategorias);
        document.getElementById("btnLimparFiltrosRegistos")?.addEventListener("click", limparFiltrosRegistos);
        document.querySelector("[data-logs-filters-toggle]")?.addEventListener("click", toggleLogsFilterDrawer);
        document.getElementById("asset-category")?.addEventListener("change", () => atualizarCamposSpecsDoAtivo());
        document.getElementById("asset-existing-template-select")?.addEventListener("change", (event) => aplicarAtivoExistenteSelecionado(event.target.value));
        document.getElementById("asset-state")?.addEventListener("change", preencherManutencaoSeBomEstado);
        document.getElementById("formAtivoGestor")?.addEventListener("submit", handleAssetSubmit);
        document.getElementById("assetSpecsFields")?.addEventListener("change", handleSpecReuseChange);
        document.getElementById("btnEditarAtivoDetalhe")?.addEventListener("click", () => {
            const asset = findAsset(assetBeingViewedId);
            if (!asset) return;
            fecharModalGestor("modalDetalheAtivo");
            abrirModalAtivoGestor(asset);
        });

        ["assets-search", "assets-location", "assets-category", "assets-status", "assets-assignment", "assets-sort"].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const eventName = el.tagName === "SELECT" ? "change" : "input";
            el.addEventListener(eventName, async () => {
                tablePaginationState.assets = 1;

                if (id === "assets-category") {
                    await atualizarFeaturesCategoriaPesquisaAtivos();
                }

                renderAssetsTable();
            });
        });

        ["locations-search", "locations-sort"].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const eventName = el.tagName === "SELECT" ? "change" : "input";
            el.addEventListener(eventName, () => {
                tablePaginationState.locations = 1;
                renderLocationsTable();
                updateLocationsSearchSummary();
            });
        });

        ["categories-search", "categories-sort"].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const eventName = el.tagName === "SELECT" ? "change" : "input";
            el.addEventListener(eventName, () => {
                tablePaginationState.categories = 1;
                renderCategoriesTable();
                updateCategoriesSearchSummary();
            });
        });

        ["logs-search", "logs-user", "logs-action", "logs-sort"].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const eventName = el.tagName === "SELECT" ? "change" : "input";
            el.addEventListener(eventName, () => {
                tablePaginationState.logs = 1;
                renderLogsTable();
                updateLogsSearchSummary();
            });
        });

        document.body.addEventListener("click", async (event) => {
            const closeButton = event.target.closest("[data-close-modal]");
            if (closeButton) {
                fecharModalGestor(closeButton.dataset.closeModal);
                return;
            }

            const paginationButton = event.target.closest("[data-pagination-group][data-pagination-direction]");
            if (paginationButton && !paginationButton.disabled) {
                event.preventDefault();
                mudarPaginaTabela(paginationButton.dataset.paginationGroup, paginationButton.dataset.paginationDirection);
                return;
            }

            const actionButton = event.target.closest("[data-asset-action]");
            if (actionButton) {
                event.preventDefault();
                event.stopPropagation();
                const assetId = actionButton.dataset.assetId;
                if (actionButton.dataset.assetAction === "view") abrirDetalheAtivoGestor(assetId);
                if (actionButton.dataset.assetAction === "edit") abrirModalAtivoGestor(findAsset(assetId));
                if (actionButton.dataset.assetAction === "remove") await removerAtivoGestor(assetId);
                return;
            }

            const row = event.target.closest("[data-open-asset]");
            if (row) {
                abrirDetalheAtivoGestor(row.dataset.openAsset);
                return;
            }

            const logActionButton = event.target.closest("[data-log-action]");
            if (logActionButton) {
                event.preventDefault();
                event.stopPropagation();
                const logId = logActionButton.dataset.logId;
                if (logActionButton.dataset.logAction === "rollback") {
                    await rollbackRegisto(logId);
                } else {
                    await verDetalheRegisto(logId);
                }
                return;
            }

            const logRow = event.target.closest("[data-open-log]");
            if (logRow) {
                event.preventDefault();
                await verDetalheRegisto(logRow.dataset.openLog);
                return;
            }

            const locationButton = event.target.closest("[data-location-filter]");
            if (locationButton) {
                event.preventDefault();
                filtrarAtivosPorLocal(locationButton.dataset.locationFilter);
                return;
            }

            const categoryButton = event.target.closest("[data-category-filter]");
            if (categoryButton) {
                event.preventDefault();
                filtrarAtivosPorCategoria(categoryButton.dataset.categoryFilter);
            }
        });
    }

    async function reloadData() {
        const [assets, locations, categories, logs] = await Promise.all([
            fetchArray("/assets/"),
            fetchArray("/locations/"),
            fetchArray("/categories/?include_features=true"),
            fetchArray("/logs/"),
        ]);

        cacheAtivos = assets;
        cacheLocais = locations.length ? locations : deriveLocationsFromAssets(cacheAtivos);
        cacheCategorias = categories.length ? categories : deriveCategoriesFromAssets(cacheAtivos);
        cacheRegistos = logs
            .filter((log) => getLogTable(log) === "assets")
            .map((log) => ({
                ...log,
                table_name: "assets",
                table_label: "Ativos",
            }));
        cacheFeaturesPorCategoria = {};

        cacheCategorias.forEach((category) => {
            if (Array.isArray(category.features)) {
                cacheFeaturesPorCategoria[String(getCategoryId(category))] = category.features;
            }
        });

        populateFilters();
        populateAssetModalSelects();
        renderAll();
    }

    async function fetchArray(endpoint) {
        const result = await api.get(endpoint);
        if (!result.success) {
            console.warn(`[API Gestor] Não foi possível carregar ${endpoint}:`, result.error || result.message);
            return [];
        }

        if (Array.isArray(result.data)) return result.data;
        if (Array.isArray(result.data?.items)) return result.data.items;
        if (Array.isArray(result.data?.results)) return result.data.results;
        return [];
    }

    function renderAll() {
        renderOverview();
        renderCharts();
        renderActionAssetsTable();
        renderAssetsTable();
        renderCategoriesTable();
        renderLocationsTable();
        renderLogsTable();
        updateCategoriesSearchSummary();
        updateLocationsSearchSummary();
        updateLogsSearchSummary();
    }

    function addUtilityClasses(element, className) {
        if (!element || !className) return;
        element.classList.add(...className.split(/\s+/).filter(Boolean));
    }

    function normalizarModaisDashboard() {
        document.querySelectorAll('[data-dashboard-modal], .dashboard-modal, #modalUtilizador, #modalLocal, #modalAtivo, #modalAtivoGestor, #modalDetalheAtivo, #modalDetalheRegisto, #modalCategoria').forEach((modal) => {
            addUtilityClasses(modal, "fixed inset-0 z-[1000] items-center justify-center overflow-y-auto bg-black/40 p-4");

            const card = modal.querySelector(":scope > div");
            if (card) {
                addUtilityClasses(card, "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl");
            }

            modal.querySelectorAll("form").forEach((form) => {
                addUtilityClasses(form, "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1");
            });

            modal.querySelectorAll("input, select, textarea").forEach((field) => {
                if (field.type === "hidden") return;
                addUtilityClasses(field, "min-h-10 rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-blue-900/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500");
            });
        });
    }

    function aplicarEstilosTailwindDashboard() {
        normalizarModaisDashboard();
        document.querySelectorAll(".asset-search-control label").forEach(label => {
            addUtilityClasses(label, "text-xs font-black uppercase tracking-wide text-blue-900");
        });

        document.querySelectorAll(".asset-search-control input, .asset-search-control select").forEach(field => {
            addUtilityClasses(field, "min-h-10 w-full rounded-xl border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-blue-900/20");
        });

        document.querySelectorAll(".table-shell").forEach(shell => {
            addUtilityClasses(shell, "relative w-full overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm");
        });

        document.querySelectorAll(".table-shell table").forEach(table => {
            addUtilityClasses(table, "w-full min-w-max border-separate border-spacing-0 text-sm");
        });

        document.querySelectorAll(".table-shell thead").forEach(thead => {
            addUtilityClasses(thead, "bg-slate-50 text-blue-900");
        });

        document.querySelectorAll(".table-shell thead th:not(.sticky)").forEach(th => {
            addUtilityClasses(th, "border-b border-gray-200 bg-slate-50 px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-blue-900 whitespace-nowrap");
        });

        document.querySelectorAll(".table-shell tbody tr").forEach(row => {
            addUtilityClasses(row, "group align-top transition hover:bg-blue-50/40");
        });

        document.querySelectorAll(".table-shell tbody td:not(.sticky)").forEach(td => {
            addUtilityClasses(td, TABLE_DATA_CELL_CLASS);
        });

        document.querySelectorAll(".category-features-box").forEach(box => {
            addUtilityClasses(box, "rounded-xl border border-blue-100 bg-blue-50/40 p-4");
        });

        document.querySelectorAll(".category-features-header").forEach(header => {
            addUtilityClasses(header, "mb-3 flex flex-wrap items-start justify-between gap-3");
        });

        document.querySelectorAll(".category-features-header-title").forEach(title => {
            addUtilityClasses(title, "min-w-0");
        });

        document.querySelectorAll(".category-add-feature-button").forEach(button => {
            addUtilityClasses(button, "inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-900 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-blue-900 transition hover:bg-blue-50");
        });

        document.querySelectorAll(".modal-scroll-area").forEach(area => {
            addUtilityClasses(area, "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1");
        });

        document.querySelectorAll(".asset-spec-filter-empty").forEach(empty => {
            addUtilityClasses(empty, ASSET_SPEC_FILTER_EMPTY_CLASS);
        });

        document.querySelectorAll(".asset-category-feature-summary").forEach(summary => {
            addUtilityClasses(summary, "flex flex-wrap gap-2 empty:hidden");
        });

        document.querySelectorAll(".asset-column-picker-head").forEach(head => {
            addUtilityClasses(head, "mb-4 flex flex-wrap items-start justify-between gap-3");
        });

        document.querySelectorAll(".asset-column-picker-head strong").forEach(el => {
            addUtilityClasses(el, "text-sm font-black uppercase tracking-wide text-blue-900");
        });

        document.querySelectorAll(".asset-column-picker-head span").forEach(el => {
            addUtilityClasses(el, "text-xs font-semibold text-gray-500");
        });

        document.querySelectorAll(".asset-column-presets").forEach(group => {
            addUtilityClasses(group, "flex flex-wrap gap-2");
        });

        document.querySelectorAll(".asset-column-presets button").forEach(button => {
            addUtilityClasses(button, "inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-900 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-blue-900 transition hover:bg-blue-50");
        });

        document.querySelectorAll(".asset-column-meta").forEach(meta => {
            addUtilityClasses(meta, "mb-4 flex flex-wrap gap-2");
        });

        document.querySelectorAll(".asset-column-meta span").forEach(item => {
            addUtilityClasses(item, "rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-900 ring-1 ring-blue-100");
        });

        document.querySelectorAll(".asset-column-sections").forEach(sections => {
            addUtilityClasses(sections, "grid grid-cols-1 gap-4 xl:grid-cols-3");
        });

        document.querySelectorAll(".asset-column-section").forEach(section => {
            addUtilityClasses(section, "rounded-xl border border-gray-200 bg-slate-50 p-3");
        });

        document.querySelectorAll(".asset-column-section-title").forEach(title => {
            addUtilityClasses(title, "mb-2 text-xs font-black uppercase tracking-wide text-blue-900");
        });

        document.querySelectorAll(".asset-column-list").forEach(list => {
            addUtilityClasses(list, "grid grid-cols-1 gap-2");
        });

        document.querySelectorAll(".asset-column-list-features").forEach(list => {
            addUtilityClasses(list, "max-h-60 overflow-y-auto pr-1");
        });

        document.querySelectorAll(".asset-column-option").forEach(option => {
            addUtilityClasses(option, ASSET_COLUMN_OPTION_BASE_CLASS);
        });

        document.querySelectorAll(".asset-column-option-active").forEach(option => {
            addUtilityClasses(option, ASSET_COLUMN_OPTION_ACTIVE_CLASS);
        });

        document.querySelectorAll(".asset-column-option-required").forEach(option => {
            addUtilityClasses(option, ASSET_COLUMN_OPTION_REQUIRED_CLASS);
        });

        document.querySelectorAll(".asset-column-option-feature").forEach(option => {
            addUtilityClasses(option, ASSET_COLUMN_OPTION_FEATURE_CLASS);
        });

        document.querySelectorAll(".asset-column-option input").forEach(input => {
            addUtilityClasses(input, "mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-900 focus:ring-blue-900");
        });

        document.querySelectorAll(".asset-column-option small").forEach(text => {
            addUtilityClasses(text, "mt-0.5 block text-[11px] font-semibold text-gray-500");
        });

        document.querySelectorAll(".asset-column-empty").forEach(empty => {
            addUtilityClasses(empty, "rounded-xl border border-dashed border-gray-300 bg-white px-3 py-4 text-sm font-semibold text-gray-500");
        });
    }

    function iniciarObservadorTailwindDashboard() {
        if (dashboardUtilityObserverStarted) return;
        dashboardUtilityObserverStarted = true;

        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(() => {
                scheduled = false;
                aplicarEstilosTailwindDashboard();
            });
        };

        const target = document.querySelector("main") || document.body;
        if (!target) return;
        new MutationObserver(schedule).observe(target, { childList: true, subtree: true });
        schedule();
    }

    function renderOverview() {
        setText("count-assets", cacheAtivos.length);
        setText("count-locations", cacheLocais.length);
        setText("count-action-assets", getAssetsNeedingAction().length);

        const emptyNotice = document.getElementById("gestorEmptyNotice");
        if (emptyNotice) {
            emptyNotice.classList.toggle("hidden", cacheLocais.length > 0 || cacheAtivos.length > 0);
        }
    }

    function renderCharts() {
        if (typeof Chart === "undefined") {
            console.warn("[Dashboard] Chart.js nao esta carregado; os graficos foram ignorados.");
            return;
        }

        const estadoCanvas = document.getElementById("chartEstado");
        if (estadoCanvas) {
            DashboardCommon.safeDestroyChart(chartEstado);
            const grouped = DashboardCommon.sortCountData(groupCount(cacheAtivos, getAssetStatus), [
                "Bom Estado",
                "Necessita Manutenção",
                "Avariado",
                "Para Abate"
            ]);

            chartEstado = DashboardCommon.createDoughnutCountChart(estadoCanvas, {
                labels: grouped.labels,
                values: grouped.values,
                label: "Ativos"
            });
        }

        const distribuicaoCanvas = document.getElementById("chartDistribuicao");
        if (distribuicaoCanvas) {
            DashboardCommon.safeDestroyChart(chartDistribuicao);
            const grouped = DashboardCommon.sortCountData(groupCount(cacheAtivos, getAssetLocationName));

            chartDistribuicao = DashboardCommon.createBarCountChart(distribuicaoCanvas, {
                labels: grouped.labels,
                values: grouped.values,
                label: "Ativos"
            });
        }
    }

    function groupCount(items, accessor) {
        if (!items.length) return { labels: ["Sem dados"], values: [0] };
        const map = new Map();
        items.forEach((item) => {
            const label = accessor(item) || "Sem dados";
            map.set(label, (map.get(label) || 0) + 1);
        });
        return { labels: Array.from(map.keys()), values: Array.from(map.values()) };
    }


    function renderTableActions(actions) {
        const buttons = (actions || []).map(action => {
            const attrs = Object.entries(action.attrs || {})
                .map(([key, value]) => `${key}="${escapeHTML(value)}"`)
                .join(" ");
            const variantClass = TABLE_ACTION_BUTTON_VARIANT_CLASSES[action.variant || "default"] || TABLE_ACTION_BUTTON_VARIANT_CLASSES.default;
            const title = action.title ? ` title="${escapeHTML(action.title)}" aria-label="${escapeHTML(action.title)}"` : "";
            return `<button type="button" ${attrs}${title} class="${TABLE_ACTION_BUTTON_BASE_CLASS} ${variantClass}">${escapeHTML(action.label)}</button>`;
        }).join("");

        return `<div class="${TABLE_ROW_ACTIONS_CLASS}">${buttons}</div>`;
    }

    function renderActionAssetsTable() {
        const tbody = document.getElementById("actionAssetsTableBody");
        if (!tbody) return;

        const assets = getAssetsNeedingAction();
        updateCounter("actionAssetsResultCount", assets.length, cacheAtivos.length);
        const pagination = paginate("actionAssets", assets);
        renderPagination("actionAssets", pagination);

        if (!pagination.items.length) {
            renderEmptyRow(tbody, 6, "Não existem ativos a precisar de ação.");
            return;
        }

        tbody.innerHTML = pagination.items.map((asset) => `
            <tr class="group cursor-pointer align-top transition hover:bg-blue-50/40" data-open-asset="${escapeHTML(getAssetId(asset))}">
                <td class="${TABLE_ID_CELL_CLASS}">#${escapeHTML(getAssetId(asset))}</td>
                <td>
                    <div class="${TABLE_TITLE_CLASS}">${escapeHTML(getAssetCategoryName(asset))}</div>
                    <div class="${TABLE_SUBTITLE_CLASS}">${escapeHTML(getAssetSerial(asset) || `Ativo #${getAssetId(asset)}`)}</div>
                </td>
                <td>${escapeHTML(getAssetLocationName(asset))}</td>
                <td>${statusBadge(getAssetStatus(asset))}</td>
                <td>${escapeHTML(formatDate(getAssetLastMaintenance(asset), false))}</td>
                <td class="${TABLE_ACTION_CELL_CLASS}">
                    ${renderTableActions([{ label: "Detalhes", variant: "primary", title: "Ver detalhes do ativo", attrs: { "data-asset-action": "view", "data-asset-id": getAssetId(asset) } }])}
                </td>
            </tr>
        `).join("");
    }

    function getSelectedAssetsCategory() {
        const categoryId = getInputValue("assets-category");
        if (!categoryId) return null;
        return cacheCategorias.find((category) => String(getCategoryId(category)) === String(categoryId)) || null;
    }

    function getSelectedAssetsCategoryFeatures() {
        const category = getSelectedAssetsCategory();
        if (!category) return [];
        const categoryId = String(getCategoryId(category));
        const features = Array.isArray(category.features) ? category.features : (cacheFeaturesPorCategoria[categoryId] || []);
        return [...features].sort((a, b) => getFeatureName(a).localeCompare(getFeatureName(b), "pt", { sensitivity: "base", numeric: true }));
    }

    function getSelectedFilterLabel(selectId) {
        const select = document.getElementById(selectId);
        if (!select || !select.value) return "";
        return select.selectedOptions?.[0]?.textContent?.trim() || "";
    }

    function getAssetsSecondaryFilterCount() {
        let count = 0;
        if (getInputValue("assets-location")) count += 1;
        if (getInputValue("assets-status")) count += 1;
        if (getInputValue("assets-assignment")) count += 1;
        if ((getInputValue("assets-sort") || "date-desc") !== "date-desc") count += 1;
        return count;
    }

    function setAssetsFilterDrawerOpen(isOpen) {
        const drawer = document.getElementById("assetsFiltersDrawer");
        const toggle = document.querySelector("[data-assets-filters-toggle]");
        if (!drawer) return;

        drawer.classList.toggle("hidden", !isOpen);

        if (toggle) {
            const count = getAssetsSecondaryFilterCount();
            toggle.setAttribute("aria-expanded", String(isOpen));
            toggle.textContent = count ? `Filtros (${count})` : "Filtros";
        }
    }

    function toggleAssetsFilterDrawer(event) {
        event?.preventDefault();
        const toggle = document.querySelector("[data-assets-filters-toggle]");
        const isOpen = toggle?.getAttribute("aria-expanded") === "true";
        setAssetsFilterDrawerOpen(!isOpen);
    }

    function hasSecondaryAssetFilters() {
        return getAssetsSecondaryFilterCount() > 0;
    }

    function clearAssetFilterByKey(key) {
        if (key === "search") setInputValue("assets-search", "");
        if (key === "category") setInputValue("assets-category", "");
        if (key === "location") setInputValue("assets-location", "");
        if (key === "status") setInputValue("assets-status", "");
        if (key === "assignment") setInputValue("assets-assignment", "");
        if (key === "sort") setInputValue("assets-sort", "date-desc");
        resetPage("assets");
        renderAssetsTable();
    }

    function updateAssetsSearchSummary() {
        const summary = document.getElementById("assetsActiveFiltersSummary");
        if (!summary) return;

        const items = [];
        const search = getInputValue("assets-search").trim();
        const categoryLabel = getSelectedFilterLabel("assets-category");
        const locationLabel = getSelectedFilterLabel("assets-location");
        const statusLabel = getSelectedFilterLabel("assets-status");
        const assignmentLabel = getSelectedFilterLabel("assets-assignment");
        const sortValue = getInputValue("assets-sort") || "date-desc";
        const sortLabel = getSelectedFilterLabel("assets-sort");

        if (search) items.push({ key: "search", label: "Pesquisa", value: search });
        if (categoryLabel) items.push({ key: "category", label: "Categoria", value: categoryLabel });
        if (locationLabel) items.push({ key: "location", label: "Local", value: locationLabel });
        if (statusLabel) items.push({ key: "status", label: "Estado", value: statusLabel });
        if (assignmentLabel) items.push({ key: "assignment", label: "Atribuição", value: assignmentLabel });
        if (sortValue !== "date-desc" && sortLabel) items.push({ key: "sort", label: "Ordem", value: sortLabel });

        summary.innerHTML = items.map((item) => `
            <span class="${ASSET_ACTIVE_CHIP_CLASS}">
                <strong>${escapeHTML(item.label)}:</strong> ${escapeHTML(item.value)}
                <button type="button" class="${CHIP_REMOVE_BUTTON_CLASS}" data-clear-asset-filter="${escapeHTML(item.key)}" aria-label="Remover filtro ${escapeHTML(item.label)}">×</button>
            </span>
        `).join("");

        summary.querySelectorAll("[data-clear-asset-filter]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                clearAssetFilterByKey(button.dataset.clearAssetFilter || "");
            });
        });

        if (hasSecondaryAssetFilters()) {
            setAssetsFilterDrawerOpen(true);
        } else {
            setAssetsFilterDrawerOpen(document.querySelector("[data-assets-filters-toggle]")?.getAttribute("aria-expanded") === "true");
        }
    }

    function getLocationsSecondaryFilterCount() {
        return (getInputValue("locations-sort") || "name-asc") !== "name-asc" ? 1 : 0;
    }

    function setLocationsFilterDrawerOpen(isOpen) {
        const drawer = document.getElementById("locationsFiltersDrawer");
        const toggle = document.querySelector("[data-locations-filters-toggle]");
        const count = getLocationsSecondaryFilterCount();

        if (drawer) drawer.classList.toggle("hidden", !isOpen);
        if (toggle) {
            toggle.setAttribute("aria-expanded", String(isOpen));
            toggle.textContent = count ? `Filtros (${count})` : "Filtros";
        }
    }

    function toggleLocationsFilterDrawer(event) {
        event?.preventDefault();
        const toggle = document.querySelector("[data-locations-filters-toggle]");
        const isOpen = toggle?.getAttribute("aria-expanded") === "true";
        setLocationsFilterDrawerOpen(!isOpen);
    }

    function clearLocationFilterByKey(key) {
        if (key === "search") setInputValue("locations-search", "");
        if (key === "sort") setInputValue("locations-sort", "name-asc");
        tablePaginationState.locations = 1;
        renderLocationsTable();
        updateLocationsSearchSummary();
    }

    function updateLocationsSearchSummary() {
        const summary = document.getElementById("locationsActiveFiltersSummary");
        if (!summary) return;

        const items = [];
        const search = getInputValue("locations-search").trim();
        const sortValue = getInputValue("locations-sort") || "name-asc";
        const sortLabel = getSelectedFilterLabel("locations-sort");

        if (search) items.push({ key: "search", label: "Pesquisa", value: search });
        if (sortValue !== "name-asc" && sortLabel) items.push({ key: "sort", label: "Ordem", value: sortLabel });

        summary.innerHTML = items.map((item) => `
            <span class="${ASSET_ACTIVE_CHIP_CLASS}">
                <strong>${escapeHTML(item.label)}:</strong> ${escapeHTML(item.value)}
                <button type="button" class="${CHIP_REMOVE_BUTTON_CLASS}" data-clear-location-filter="${escapeHTML(item.key)}" aria-label="Remover filtro ${escapeHTML(item.label)}">×</button>
            </span>
        `).join("");

        summary.querySelectorAll("[data-clear-location-filter]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                clearLocationFilterByKey(button.dataset.clearLocationFilter || "");
            });
        });

        const shouldKeepOpen = document.querySelector("[data-locations-filters-toggle]")?.getAttribute("aria-expanded") === "true";
        setLocationsFilterDrawerOpen(shouldKeepOpen || getLocationsSecondaryFilterCount() > 0);
    }

    function getCategoriesSecondaryFilterCount() {
        return (getInputValue("categories-sort") || "name-asc") !== "name-asc" ? 1 : 0;
    }

    function setCategoriesFilterDrawerOpen(isOpen) {
        const drawer = document.getElementById("categoriesFiltersDrawer");
        const toggle = document.querySelector("[data-categories-filters-toggle]");
        const count = getCategoriesSecondaryFilterCount();

        if (drawer) drawer.classList.toggle("hidden", !isOpen);
        if (toggle) {
            toggle.setAttribute("aria-expanded", String(isOpen));
            toggle.textContent = count ? `Filtros (${count})` : "Filtros";
        }
    }

    function toggleCategoriesFilterDrawer(event) {
        event?.preventDefault();
        const toggle = document.querySelector("[data-categories-filters-toggle]");
        const isOpen = toggle?.getAttribute("aria-expanded") === "true";
        setCategoriesFilterDrawerOpen(!isOpen);
    }

    function clearCategoryFilterByKey(key) {
        if (key === "search") setInputValue("categories-search", "");
        if (key === "sort") setInputValue("categories-sort", "name-asc");
        tablePaginationState.categories = 1;
        renderCategoriesTable();
        updateCategoriesSearchSummary();
    }

    function updateCategoriesSearchSummary() {
        const summary = document.getElementById("categoriesActiveFiltersSummary");
        if (!summary) return;

        const items = [];
        const search = getInputValue("categories-search").trim();
        const sortValue = getInputValue("categories-sort") || "name-asc";
        const sortLabel = getSelectedFilterLabel("categories-sort");

        if (search) items.push({ key: "search", label: "Pesquisa", value: search });
        if (sortValue !== "name-asc" && sortLabel) items.push({ key: "sort", label: "Ordem", value: sortLabel });

        summary.innerHTML = items.map((item) => `
            <span class="${ASSET_ACTIVE_CHIP_CLASS}">
                <strong>${escapeHTML(item.label)}:</strong> ${escapeHTML(item.value)}
                <button type="button" class="${CHIP_REMOVE_BUTTON_CLASS}" data-clear-category-filter="${escapeHTML(item.key)}" aria-label="Remover filtro ${escapeHTML(item.label)}">×</button>
            </span>
        `).join("");

        summary.querySelectorAll("[data-clear-category-filter]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                clearCategoryFilterByKey(button.dataset.clearCategoryFilter || "");
            });
        });

        const shouldKeepOpen = document.querySelector("[data-categories-filters-toggle]")?.getAttribute("aria-expanded") === "true";
        setCategoriesFilterDrawerOpen(shouldKeepOpen || getCategoriesSecondaryFilterCount() > 0);
    }


    function getLogsSecondaryFilterCount() {
        let count = 0;
        if (getInputValue("logs-user")) count += 1;
        if (getInputValue("logs-action")) count += 1;
        if ((getInputValue("logs-sort") || "date-desc") !== "date-desc") count += 1;
        return count;
    }

    function setLogsFilterDrawerOpen(isOpen) {
        const drawer = document.getElementById("logsFiltersDrawer");
        const toggle = document.querySelector("[data-logs-filters-toggle]");
        const count = getLogsSecondaryFilterCount();

        if (drawer) drawer.classList.toggle("hidden", !isOpen);
        if (toggle) {
            toggle.setAttribute("aria-expanded", String(isOpen));
            toggle.textContent = count ? `Filtros (${count})` : "Filtros";
        }
    }

    function toggleLogsFilterDrawer(event) {
        event?.preventDefault();
        const toggle = document.querySelector("[data-logs-filters-toggle]");
        const isOpen = toggle?.getAttribute("aria-expanded") === "true";
        setLogsFilterDrawerOpen(!isOpen);
    }

    function clearLogFilterByKey(key) {
        if (key === "search") setInputValue("logs-search", "");
        if (key === "user") setInputValue("logs-user", "");
        if (key === "action") setInputValue("logs-action", "");
        if (key === "sort") setInputValue("logs-sort", "date-desc");
        tablePaginationState.logs = 1;
        renderLogsTable();
        updateLogsSearchSummary();
    }

    function updateLogsSearchSummary() {
        const summary = document.getElementById("logsActiveFiltersSummary");
        if (!summary) return;

        const items = [];
        const search = getInputValue("logs-search").trim();
        const userLabel = getSelectedFilterLabel("logs-user");
        const actionLabel = getSelectedFilterLabel("logs-action");
        const sortValue = getInputValue("logs-sort") || "date-desc";
        const sortLabel = getSelectedFilterLabel("logs-sort");

        if (search) items.push({ key: "search", label: "Pesquisa", value: search });
        if (userLabel) items.push({ key: "user", label: "Utilizador", value: userLabel });
        if (actionLabel) items.push({ key: "action", label: "Ação", value: actionLabel });
        if (sortValue !== "date-desc" && sortLabel) items.push({ key: "sort", label: "Ordem", value: sortLabel });

        summary.innerHTML = items.map((item) => `
            <span class="${ASSET_ACTIVE_CHIP_CLASS}">
                <strong>${escapeHTML(item.label)}:</strong> ${escapeHTML(item.value)}
                <button type="button" class="${CHIP_REMOVE_BUTTON_CLASS}" data-clear-log-filter="${escapeHTML(item.key)}" aria-label="Remover filtro ${escapeHTML(item.label)}">×</button>
            </span>
        `).join("");

        summary.querySelectorAll("[data-clear-log-filter]").forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                clearLogFilterByKey(button.dataset.clearLogFilter || "");
            });
        });

        const shouldKeepOpen = document.querySelector("[data-logs-filters-toggle]")?.getAttribute("aria-expanded") === "true";
        setLogsFilterDrawerOpen(shouldKeepOpen || getLogsSecondaryFilterCount() > 0);
    }



    function getAssetsTableColspan() {
        return getVisibleAssetColumnDefinitions().length + 1;
    }

    function getSelectedAssetCategoryFilterId() {
        return getInputValue("assets-category");
    }

    function getSelectedAssetCategoryFilter() {
        return getSelectedAssetsCategory();
    }

    function getFeaturesTabelaAtivos() {
        return getSelectedAssetsCategoryFeatures().filter(isFeatureActive);
    }

    function getFeaturesDisponiveisParaFiltrosAtivos() {
        const selectedCategory = getSelectedAssetsCategory();
        if (!selectedCategory) return [];

        return getFeaturesTabelaAtivos().map((feature) => ({
            feature_id: getFeatureId(feature),
            feature_name: getFeatureName(feature),
            feature_type: getFeatureType(feature),
            is_repeatable: isFeatureRepeatable(feature),
            is_multiple: isFeatureRepeatable(feature),
            category_id: getCategoryId(selectedCategory),
            category_name: getCategoryName(selectedCategory),
        }));
    }

    function renderAssetsCategoryFeaturesPanel() {
        const panel = document.getElementById("assetsCategoryFeaturesPanel");
        const helper = document.getElementById("assetSpecFilterHelper");
        const addButton = document.getElementById("btnAdicionarFiltroSpecAtivo");
        const selectedCategory = getSelectedAssetsCategory();
        const features = getFeaturesTabelaAtivos();

        if (!selectedCategory) {
            if (panel) panel.innerHTML = "";
            if (helper) helper.textContent = "Seleciona uma categoria para ativar filtros por características.";
            if (addButton) {
                addButton.disabled = true;
                addButton.title = "Seleciona primeiro uma categoria.";
            }
            return;
        }

        if (!features.length) {
            if (panel) panel.innerHTML = "";
            if (helper) helper.textContent = "Esta categoria ainda não tem características para filtrar.";
            if (addButton) {
                addButton.disabled = true;
                addButton.title = "Esta categoria ainda não tem características.";
            }
            return;
        }

        const categoryName = getCategoryName(selectedCategory);
        if (helper) {
            helper.textContent = `${features.length} característica${features.length === 1 ? "" : "s"} disponível${features.length === 1 ? "" : "eis"} em ${categoryName}.`;
        }

        if (addButton) {
            addButton.disabled = false;
            addButton.title = "Adicionar filtro por característica.";
        }

        if (panel) {
            const visibleFeatures = features.slice(0, 6);
            const remainingCount = features.length - visibleFeatures.length;
            panel.innerHTML = `
                ${visibleFeatures.map((feature) => `
                    <span class="inline-flex items-center rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-900 shadow-sm">
                        ${escapeHTML(getFeatureName(feature))}
                    </span>
                `).join("")}
                ${remainingCount > 0 ? `<span class="inline-flex items-center rounded-full border border-blue-100 bg-blue-900 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">+${remainingCount}</span>` : ""}
            `;
        }
    }

    function removerFiltrosSpecsIncompativeisComCategoria() {
        const selectedCategoryId = getSelectedAssetCategoryFilterId();

        if (!selectedCategoryId) {
            document.querySelectorAll("[data-asset-spec-filter-row]").forEach((row) => row.remove());
            garantirMensagemFiltrosSpecsAtivos();
            return;
        }

        const allowedFeatureIds = new Set(getFeaturesTabelaAtivos().map((feature) => String(getFeatureId(feature))));
        document.querySelectorAll("[data-asset-spec-filter-row]").forEach((row) => {
            const featureSelect = row.querySelector("[data-asset-spec-filter-feature]");
            const featureId = String(featureSelect?.value || "");
            if (featureId && !allowedFeatureIds.has(featureId)) row.remove();
        });

        garantirMensagemFiltrosSpecsAtivos();
    }

    async function atualizarFeaturesCategoriaPesquisaAtivos() {
        const categoryId = getSelectedAssetCategoryFilterId();
        if (categoryId) {
            try {
                await getFeaturesForCategory(categoryId);
            } catch (error) {
                console.warn("[Gestor] Não foi possível carregar features da categoria selecionada.", error);
            }
        }

        removerFiltrosSpecsIncompativeisComCategoria();
        popularOpcoesFeaturesSpecsAtivos();
        renderAssetsCategoryFeaturesPanel();
        atualizarVisibilidadeFiltrosSpecsAtivos();
        renderAssetsTableHead();
    }

    function popularOpcoesFeaturesSpecsAtivos() {
        const selects = document.querySelectorAll("[data-asset-spec-filter-feature]");
        if (!selects.length) return;

        const features = getFeaturesDisponiveisParaFiltrosAtivos();

        selects.forEach((select) => {
            const currentValue = select.value;
            select.innerHTML = renderSelectEmptyOption("Selecionar característica", { asPlaceholder: true, selected: !currentValue }) + features.map((feature) => `
                <option value="${escapeHTML(feature.feature_id)}">${escapeHTML(feature.feature_name)}</option>
            `).join("");

            if (features.some((feature) => String(feature.feature_id) === String(currentValue))) {
                select.value = currentValue;
            } else {
                select.value = "";
            }
        });
    }

    function atualizarVisibilidadeValorFiltroSpec(row) {
        const operatorSelect = row.querySelector("[data-asset-spec-filter-operator]");
        const valueInput = row.querySelector("[data-asset-spec-filter-value]");
        if (!operatorSelect || !valueInput) return;

        const doesNotNeedValue = operatorSelect.value === "exists";
        valueInput.disabled = doesNotNeedValue;
        valueInput.classList.toggle("opacity-50", doesNotNeedValue);
        valueInput.placeholder = doesNotNeedValue ? "Não precisa de valor" : "Ex.: 16GB, DDR4, 2026-12-31";
        if (doesNotNeedValue) valueInput.value = "";
    }

    function adicionarFiltroSpecAtivo(filtro = {}) {
        const container = document.getElementById("assetSpecFiltersRows");
        if (!container) return;

        const selectedCategory = getSelectedAssetsCategory();
        const availableFeatures = getFeaturesTabelaAtivos();

        if (!selectedCategory) {
            setAssetsFilterDrawerOpen(true);
            renderAssetsCategoryFeaturesPanel();
            showToast("Seleciona primeiro uma categoria para filtrar por características.", true);
            return;
        }

        if (!availableFeatures.length) {
            setAssetsFilterDrawerOpen(true);
            renderAssetsCategoryFeaturesPanel();
            showToast("Esta categoria ainda não tem características para filtrar.", true);
            return;
        }

        setAssetsFilterDrawerOpen(true);

        const emptyMessage = container.querySelector(".asset-spec-filter-empty");
        if (emptyMessage) emptyMessage.remove();

        const row = document.createElement("div");
        row.className = ASSET_SPEC_FILTER_ROW_CLASS;
        row.dataset.assetSpecFilterRow = "true";
        row.innerHTML = `
            <div class="flex flex-col gap-1">
                <label class="text-xs font-black uppercase tracking-wide text-blue-900">Característica</label>
                <select class="min-h-10 rounded-xl border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-900/20" data-asset-spec-filter-feature></select>
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-xs font-black uppercase tracking-wide text-blue-900">Operador</label>
                <select class="min-h-10 rounded-xl border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-900/20" data-asset-spec-filter-operator>
                    <option value="contains">Contém</option>
                    <option value="equals">Igual a</option>
                    <option value="not_contains">Não contém</option>
                    <option value="gt">Maior que</option>
                    <option value="gte">Maior ou igual</option>
                    <option value="lt">Menor que</option>
                    <option value="lte">Menor ou igual</option>
                    <option value="before">Antes de</option>
                    <option value="after">Depois de</option>
                    <option value="exists">Tem valor</option>
                </select>
            </div>
            <div class="flex flex-col gap-1">
                <label class="text-xs font-black uppercase tracking-wide text-blue-900">Valor</label>
                <input type="text" class="min-h-10 rounded-xl border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-900/20 disabled:cursor-not-allowed" data-asset-spec-filter-value placeholder="Ex.: 16GB, DDR4, 2026-12-31">
            </div>
            <button type="button" class="${ASSET_SPEC_FILTER_REMOVE_CLASS}" data-asset-spec-filter-remove aria-label="Remover filtro" title="Remover filtro">×</button>
        `;

        container.appendChild(row);
        atualizarVisibilidadeFiltrosSpecsAtivos();
        popularOpcoesFeaturesSpecsAtivos();

        const featureSelect = row.querySelector("[data-asset-spec-filter-feature]");
        const operatorSelect = row.querySelector("[data-asset-spec-filter-operator]");
        const valueInput = row.querySelector("[data-asset-spec-filter-value]");

        if (featureSelect && filtro.feature_id) featureSelect.value = String(filtro.feature_id);
        if (operatorSelect && filtro.operator) operatorSelect.value = String(filtro.operator);
        if (valueInput && filtro.value !== undefined) valueInput.value = String(filtro.value);
        if (featureSelect && !featureSelect.value) featureSelect.focus();

        row.querySelectorAll("select, input").forEach((input) => {
            const eventName = input.tagName === "SELECT" ? "change" : "input";
            input.addEventListener(eventName, () => {
                if (input.matches("[data-asset-spec-filter-operator]")) {
                    atualizarVisibilidadeValorFiltroSpec(row);
                }
                tablePaginationState.assets = 1;
                renderAssetsTable();
            });
        });

        atualizarVisibilidadeValorFiltroSpec(row);

        row.querySelector("[data-asset-spec-filter-remove]")?.addEventListener("click", () => {
            row.remove();
            garantirMensagemFiltrosSpecsAtivos();
            tablePaginationState.assets = 1;
            renderAssetsTable();
        });
    }

    function garantirMensagemFiltrosSpecsAtivos() {
        const container = document.getElementById("assetSpecFiltersRows");
        if (!container) return;

        if (!container.querySelector("[data-asset-spec-filter-row]")) {
            container.innerHTML = `<p class="asset-spec-filter-empty ${ASSET_SPEC_FILTER_EMPTY_CLASS}">Sem filtros avançados ativos.</p>`;
        }

        atualizarVisibilidadeFiltrosSpecsAtivos();
    }

    function recolherFiltrosSpecsAtivos() {
        return Array.from(document.querySelectorAll("[data-asset-spec-filter-row]")).map((row) => {
            const featureSelect = row.querySelector("[data-asset-spec-filter-feature]");
            const operatorSelect = row.querySelector("[data-asset-spec-filter-operator]");
            const valueInput = row.querySelector("[data-asset-spec-filter-value]");
            const selectedOption = featureSelect?.selectedOptions?.[0];

            return {
                feature_id: featureSelect?.value || "",
                feature_name: selectedOption ? selectedOption.textContent.trim() : "",
                operator: operatorSelect?.value || "contains",
                value: valueInput?.value?.trim() || "",
            };
        }).filter((filter) => filter.feature_id || filter.feature_name);
    }

    function existemFiltrosSpecsAtivos() {
        return Boolean(document.querySelector("[data-asset-spec-filter-row]"));
    }

    function atualizarVisibilidadeFiltrosSpecsAtivos() {
        const section = document.querySelector(".asset-advanced-filters");
        if (!section) return;
        section.classList.toggle("hidden", !existemFiltrosSpecsAtivos());
    }

    function loadAssetColumnPreferences() {
        try {
            const saved = JSON.parse(window.localStorage.getItem(ASSET_COLUMN_STORAGE_KEY) || "null");
            if (Array.isArray(saved) && saved.length) {
                assetVisibleColumnKeys = new Set(saved.map(String));
                assetColumnSelectionTouched = true;
            }
        } catch (error) {
            console.warn("[Gestor] Não foi possível ler as preferências de colunas.", error);
        }

        ensureRequiredAssetColumns();
    }

    function saveAssetColumnPreferences() {
        try {
            ensureRequiredAssetColumns();
            window.localStorage.setItem(ASSET_COLUMN_STORAGE_KEY, JSON.stringify(Array.from(assetVisibleColumnKeys)));
        } catch (error) {
            console.warn("[Gestor] Não foi possível guardar as preferências de colunas.", error);
        }
    }

    function ensureRequiredAssetColumns() {
        ASSET_REQUIRED_COLUMN_KEYS.forEach((key) => assetVisibleColumnKeys.add(key));
    }

    function getAssetFeatureColumnKey(feature) {
        return `feature:${getFeatureId(feature)}`;
    }

    function syncDynamicAssetColumns() {
        const currentCategoryId = getInputValue("assets-category") || "";

        if (lastAssetColumnCategoryId !== currentCategoryId) {
            lastAssetColumnCategoryId = currentCategoryId;
            assetColumnSelectionTouched = false;
        }

        if (!assetColumnSelectionTouched) {
            assetVisibleColumnKeys = new Set(ASSET_DEFAULT_COLUMN_KEYS);
            getSelectedAssetsCategoryFeatures().forEach((feature) => {
                const key = getAssetFeatureColumnKey(feature);
                if (key !== "feature:") assetVisibleColumnKeys.add(key);
            });
        }

        ensureRequiredAssetColumns();
    }

    function getAssetsTableBaseColumnDefinitions() {
        const selectedCategory = getSelectedAssetsCategory();
        const categoryName = selectedCategory ? getCategoryName(selectedCategory) : "";

        const headers = selectedCategory
            ? {
                id: { label: "ID", sublabel: categoryName },
                asset: { label: `${categoryName} · ATIVO`, sublabel: "Nº série / código" },
                category: { label: "TIPO DE ATIVO", sublabel: categoryName },
                location: { label: "LOCAL", sublabel: `Sala do ${categoryName}` },
                status: { label: "ESTADO", sublabel: `Estado do ${categoryName}` },
                assignment: { label: "ATRIBUÍDO A", sublabel: `Responsável pelo ${categoryName}` },
                registration: { label: "REGISTO", sublabel: `Data do ${categoryName}` },
            }
            : {
                id: { label: "ID", sublabel: "Identificador" },
                asset: { label: "ATIVO", sublabel: "Nº série / código" },
                category: { label: "TIPO", sublabel: "Categoria" },
                location: { label: "LOCAL", sublabel: "Sala" },
                status: { label: "ESTADO", sublabel: "Condição" },
                assignment: { label: "ATRIBUÍDO A", sublabel: "Responsável" },
                registration: { label: "REGISTO", sublabel: "Data" },
            };

        return [
            { key: "id", label: "ID", required: true, header: headers.id, tdClass: "px-4 py-3", render: renderAssetIdCell },
            { key: "asset", label: "Ativo / código", header: headers.asset, tdClass: "px-4 py-3", render: renderAssetIdentityCell },
            { key: "category", label: "Categoria / tipo", required: true, header: headers.category, tdClass: "px-4 py-3", render: renderAssetCategoryCell },
            { key: "location", label: "Sala / local", header: headers.location, tdClass: "px-4 py-3", render: renderAssetLocationCell },
            { key: "status", label: "Estado", header: headers.status, tdClass: "px-4 py-3", render: (asset) => statusBadge(getAssetStatus(asset)) },
            { key: "assignment", label: "Atribuição", header: headers.assignment, tdClass: "px-4 py-3", render: renderAssetAssignmentCell },
            { key: "registration", label: "Data de registo", header: headers.registration, tdClass: "px-4 py-3 whitespace-nowrap", render: (asset) => escapeHTML(formatDate(getAssetRegisteredAt(asset))) },
        ];
    }

    function getAssetsTableDynamicColumnDefinitions() {
        const selectedCategory = getSelectedAssetsCategory();
        const categoryName = selectedCategory ? getCategoryName(selectedCategory) : "";

        return getSelectedAssetsCategoryFeatures().map((feature) => ({
            key: getAssetFeatureColumnKey(feature),
            label: getFeatureName(feature),
            header: {
                label: getFeatureName(feature),
                sublabel: categoryName || "Característica",
            },
            tdClass: "px-4 py-3",
            render: (asset) => formatSpecValueForTable(getAssetSpecRawValue(asset, feature), feature),
        }));
    }

    function getAllAssetColumnDefinitions() {
        return [
            ...getAssetsTableBaseColumnDefinitions(),
            ...getAssetsTableDynamicColumnDefinitions(),
        ];
    }

    function getVisibleAssetColumnDefinitions() {
        syncDynamicAssetColumns();
        const definitions = getAllAssetColumnDefinitions();
        const visible = definitions.filter((column) => column.required || assetVisibleColumnKeys.has(column.key));

        if (!visible.some((column) => column.key === "id")) {
            const idColumn = definitions.find((column) => column.key === "id");
            if (idColumn) visible.unshift(idColumn);
        }

        if (!visible.some((column) => column.key === "category")) {
            const categoryColumn = definitions.find((column) => column.key === "category");
            if (categoryColumn) visible.splice(Math.min(1, visible.length), 0, categoryColumn);
        }

        return visible;
    }

    function updateAssetsColumnToggleText() {
        const toggle = document.querySelector("[data-assets-columns-toggle]");
        if (!toggle) return;
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        toggle.textContent = `Colunas (${getVisibleAssetColumnDefinitions().length})`;
        toggle.setAttribute("aria-expanded", String(isOpen));
    }

    function setAssetsColumnPickerOpen(isOpen) {
        const picker = document.getElementById("assetsColumnPicker");
        const toggle = document.querySelector("[data-assets-columns-toggle]");
        if (!picker) return;

        picker.classList.toggle("hidden", !isOpen);
        if (toggle) toggle.setAttribute("aria-expanded", String(isOpen));
        updateAssetsColumnToggleText();
    }

    function toggleAssetsColumnPicker(event) {
        event?.preventDefault();
        const toggle = document.querySelector("[data-assets-columns-toggle]");
        const isOpen = toggle?.getAttribute("aria-expanded") === "true";
        setAssetsColumnPickerOpen(!isOpen);
    }

    function renderAssetsColumnPicker() {
        const picker = document.getElementById("assetsColumnPicker");
        if (!picker) return;

        const selectedCategory = getSelectedAssetsCategory();

        if (!selectedCategory) {
            picker.innerHTML = "";
            picker.classList.add("hidden");
            updateAssetsColumnToggleText();
            return;
        }

        picker.classList.remove("hidden");

        const baseColumns = getAssetsTableBaseColumnDefinitions();
        const featureColumns = getAssetsTableDynamicColumnDefinitions();
        const requiredColumns = baseColumns.filter((column) => column.required);
        const generalColumns = baseColumns.filter((column) => !column.required);
        const visibleColumns = getVisibleAssetColumnDefinitions();
        const visibleCount = visibleColumns.length;
        const categoryName = getCategoryName(selectedCategory);

        const renderOption = (column, extraClass = "") => {
            const checked = column.required || assetVisibleColumnKeys.has(column.key);
            const activeClass = checked ? "asset-column-option-active" : "";
            return `
                <label class="asset-column-option ${activeClass} ${column.required ? "asset-column-option-required" : ""} ${extraClass}">
                    <input type="checkbox" data-asset-column-key="${escapeHTML(column.key)}" ${checked ? "checked" : ""} ${column.required ? "disabled" : ""}>
                    <span>${escapeHTML(column.label)}</span>
                    ${column.required ? `<small>fixo</small>` : ""}
                </label>
            `;
        };

        picker.innerHTML = `
            <div class="asset-column-picker-head">
                <div>
                    <strong>Campos de ${escapeHTML(categoryName)}</strong>
                    <span>Escolhe rapidamente as colunas que queres ver nesta categoria.</span>
                </div>
            </div>

            <div class="asset-column-meta">
                <span>${visibleCount} coluna${visibleCount === 1 ? "" : "s"} visível${visibleCount === 1 ? "" : "eis"}</span>
                <span>ID e categoria ficam sempre ativos para identificar o ativo.</span>
            </div>

            <div class="asset-column-sections">
                <section class="asset-column-section asset-column-section-fixed">
                    <div class="asset-column-section-title">Identificação fixa</div>
                    <div class="asset-column-list asset-column-list-compact">
                        ${requiredColumns.map((column) => renderOption(column)).join("")}
                    </div>
                </section>

                <section class="asset-column-section">
                    <div class="asset-column-section-title">Dados gerais</div>
                    <div class="asset-column-list asset-column-list-compact">
                        ${generalColumns.map((column) => renderOption(column)).join("")}
                    </div>
                </section>

                <section class="asset-column-section asset-column-section-features">
                    <div class="asset-column-section-title">Características de ${escapeHTML(categoryName)}</div>
                    ${featureColumns.length ? `
                        <div class="asset-column-list asset-column-list-features">
                            ${featureColumns.map((column) => renderOption(column, "asset-column-option-feature")).join("")}
                        </div>
                    ` : `<p class="asset-column-empty">Esta categoria ainda não tem características configuradas.</p>`}
                </section>
            </div>
        `;

        picker.querySelectorAll("[data-asset-column-key]").forEach((input) => {
            input.addEventListener("change", () => {
                const key = input.dataset.assetColumnKey || "";
                if (ASSET_REQUIRED_COLUMN_KEYS.has(key)) return;

                assetColumnSelectionTouched = true;
                if (input.checked) {
                    assetVisibleColumnKeys.add(key);
                } else {
                    assetVisibleColumnKeys.delete(key);
                }
                saveAssetColumnPreferences();
                renderAssetsTable();
            });
        });

        picker.querySelectorAll("[data-asset-columns-preset]").forEach((button) => {
            button.addEventListener("click", () => {
                const preset = button.dataset.assetColumnsPreset;
                const allColumns = [...baseColumns, ...featureColumns];
                assetColumnSelectionTouched = true;

                if (preset === "identity") {
                    assetVisibleColumnKeys = new Set(["id", "category"]);
                } else if (preset === "all") {
                    assetVisibleColumnKeys = new Set(allColumns.map((column) => column.key));
                } else {
                    assetVisibleColumnKeys = new Set(ASSET_DEFAULT_COLUMN_KEYS);
                }

                ensureRequiredAssetColumns();
                saveAssetColumnPreferences();
                renderAssetsTable();
            });
        });

        updateAssetsColumnToggleText();
    }

    function renderAssetsHeaderCell(header, align = "left", extraClass = "") {
        const alignClass = align === "right" ? "text-right" : "text-left";
        const headerClass = extraClass || `border-b border-gray-200 bg-slate-50 px-4 py-3 ${alignClass} text-xs font-black uppercase tracking-wide text-blue-900 whitespace-nowrap`;
        const sublabel = header.sublabel
            ? `<div class="mt-0.5 text-[10px] font-bold normal-case tracking-normal text-blue-900/60">${escapeHTML(header.sublabel)}</div>`
            : "";

        return `
            <th class="${headerClass}">
                <div>${escapeHTML(header.label)}</div>
                ${sublabel}
            </th>
        `;
    }

    function renderAssetsTableHead() {
        const thead = document.getElementById("assetsTableHead");
        if (!thead) return;

        const columns = getVisibleAssetColumnDefinitions();

        thead.innerHTML = `
            <tr>
                ${columns.map((column) => renderAssetsHeaderCell(column.header)).join("")}
                ${renderAssetsHeaderCell({ label: "AÇÕES" }, "right", TABLE_ACTION_HEADER_CLASS)}
            </tr>
        `;

        renderAssetsColumnPicker();
    }

    function getAssetSpecRawValue(asset, feature) {
        const featureId = String(getFeatureId(feature));
        const detail = getAssetSpecsDetails(asset).find((item) => String(getFeatureId(item)) === featureId);
        if (detail) return getSpecValue(detail);

        const specs = asset && asset.specs && typeof asset.specs === "object" ? asset.specs : {};
        const key = Object.keys(specs).find((item) =>
            String(item) === featureId ||
            normalize(item) === normalize(getFeatureName(feature)) ||
            normalize(item) === normalize(getFeatureRawName(feature))
        );
        return key ? specs[key] : "";
    }

    function formatStructuredSpecValueForTable(feature, rawValue) {
        const schema = getFeatureFieldSchema(feature);
        const values = decodeSpecValue(rawValue)
            .map(parseSpecStructuredValue)
            .filter((item) => Object.keys(item).length > 0);

        if (!values.length) {
            return `<span class="text-xs font-semibold text-gray-400">—</span>`;
        }

        const visibleValues = values.slice(0, 2);
        const remainingCount = values.length - visibleValues.length;

        return `
            <div class="min-w-64 max-w-[28rem] space-y-1.5">
                ${visibleValues.map((item, index) => {
                    const fields = schema.map((field) => {
                        const formatted = formatStructuredFieldValue(item[getSchemaFieldKey(field)], field);
                        if (!formatted) return "";
                        return `
                            <span class="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-800 ring-1 ring-gray-200">
                                <strong class="text-blue-900">${escapeHTML(getSchemaFieldLabel(field))}:</strong>
                                ${escapeHTML(formatted)}
                            </span>
                        `;
                    }).filter(Boolean).join("");

                    return `
                        <div class="rounded-xl border border-blue-100 bg-blue-50/40 p-2" title="${escapeHTML(formatStructuredSpecValue(feature, item)[0] || "")}">
                            ${values.length > 1 ? `<div class="mb-1 text-[10px] font-black uppercase tracking-wide text-blue-900">Valor ${index + 1}</div>` : ""}
                            <div class="flex flex-wrap gap-1">${fields || `<span class="text-xs font-semibold text-gray-400">—</span>`}</div>
                        </div>
                    `;
                }).join("")}
                ${remainingCount > 0 ? `<span class="inline-flex rounded-full bg-blue-900 px-2.5 py-1 text-[11px] font-black text-white">+${remainingCount} valor${remainingCount === 1 ? "" : "es"}</span>` : ""}
            </div>
        `;
    }

    function formatSpecValueForTable(value, feature = null) {
        if (feature && hasFeatureFieldSchema(feature)) {
            return formatStructuredSpecValueForTable(feature, value);
        }

        const values = decodeSpecValue(value)
            .filter((item) => item !== undefined && item !== null && String(item).trim() !== "")
            .map(formatSpecPrimitive);

        if (!values.length) return `<span class="text-xs font-semibold text-gray-400">—</span>`;
        if (values.length === 1) {
            return `<span class="block max-w-56 truncate text-sm font-semibold text-gray-900" title="${escapeHTML(values[0])}">${escapeHTML(values[0])}</span>`;
        }

        const visible = values.slice(0, 3);
        const remaining = values.length - visible.length;
        return `
            <div class="flex max-w-64 flex-wrap gap-1">
                ${visible.map((item) => `<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800" title="${escapeHTML(item)}">${escapeHTML(item)}</span>`).join("")}
                ${remaining > 0 ? `<span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-900">+${remaining}</span>` : ""}
            </div>
        `;
    }

    function renderAssetIdCell(asset) {
        return `
            <div class="min-w-20">
                <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-black text-gray-800 ring-1 ring-gray-200">#${escapeHTML(getAssetId(asset))}</span>
            </div>
        `;
    }

    function renderAssetIdentityCell(asset) {
        return `
            <div class="min-w-44">
                <div class="font-black text-blue-900">${escapeHTML(getAssetCode(asset))}</div>
                <div class="mt-0.5 text-xs text-gray-500">Identificação do ativo</div>
            </div>
        `;
    }

    function renderAssetCategoryCell(asset) {
        const detailsCount = getAssetSpecsDetails(asset).length;
        return `
            <div class="min-w-40">
                <div class="font-bold text-gray-900">${escapeHTML(getAssetCategoryName(asset))}</div>
                <div class="mt-1 text-xs text-gray-500">${detailsCount} característica${detailsCount === 1 ? "" : "s"} preenchida${detailsCount === 1 ? "" : "s"}</div>
            </div>
        `;
    }

    function renderAssetLocationCell(asset) {
        return `
            <div class="min-w-36">
                <div class="font-semibold text-gray-900">${escapeHTML(getAssetLocationName(asset))}</div>
                <div class="text-xs text-gray-500">Local #${escapeHTML(getAssetLocationId(asset) || "-")}</div>
            </div>
        `;
    }

    function renderAssetAssignmentCell(asset) {
        const assigned = getAssetAssignedTo(asset);
        const isAssigned = assigned && assigned !== "-";
        return `
            <div class="min-w-40">
                <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${isAssigned ? "bg-blue-50 text-blue-900 ring-1 ring-blue-100" : "bg-gray-100 text-gray-500"}">
                    ${escapeHTML(isAssigned ? assigned : "Sem atribuição")}
                </span>
                ${isAssigned ? `<div class="mt-1 text-xs text-gray-500">${escapeHTML(formatDate(getAssetAssignedAt(asset)))}</div>` : ""}
            </div>
        `;
    }

    function renderAssetActions(asset) {
        const id = getAssetId(asset);
        return renderTableActions([
            { label: "Ver", variant: "primary", title: "Ver detalhes do ativo", attrs: { "data-asset-action": "view", "data-asset-id": id } },
            { label: "Editar", variant: "secondary", title: "Editar ativo", attrs: { "data-asset-action": "edit", "data-asset-id": id } },
            { label: "Remover", variant: "danger", title: "Remover ativo", attrs: { "data-asset-action": "remove", "data-asset-id": id } }
        ]);
    }

    function renderAssetsTable() {
        const tbody = document.getElementById("assetsTableBody");
        if (!tbody) return;

        renderAssetsTableHead();
        renderAssetsCategoryFeaturesPanel();
        updateAssetsSearchSummary();

        const assets = getFilteredAssets();
        updateCounter("assetsResultCount", assets.length, cacheAtivos.length);
        const pagination = paginate("assets", assets);
        renderPagination("assets", pagination);

        if (!pagination.items.length) {
            renderEmptyRow(tbody, getAssetsTableColspan(), "Nenhum ativo encontrado para os filtros selecionados.");
            return;
        }

        const visibleColumns = getVisibleAssetColumnDefinitions();

        tbody.innerHTML = pagination.items.map((asset) => `
            <tr class="group cursor-pointer align-top transition hover:bg-blue-50/40" data-open-asset="${escapeHTML(getAssetId(asset))}">
                ${visibleColumns.map((column) => `<td class="${column.tdClass || "px-4 py-3"}">${column.render(asset)}</td>`).join("")}
                <td class="${TABLE_ACTION_CELL_CLASS}">${renderAssetActions(asset)}</td>
            </tr>
        `).join("");
    }


    function renderCategoryFeatures(features) {
        if (!features.length) {
            return `<span class="text-sm font-semibold text-gray-400">Sem features</span>`;
        }

        const visible = features.slice(0, 5);
        const remaining = features.length - visible.length;

        return `
            <div class="flex max-w-2xl flex-wrap gap-2">
                ${visible.map((feature) => `<span class="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-900">${escapeHTML(getFeatureName(feature))}</span>`).join("")}
                ${remaining > 0 ? `<span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">+${remaining}</span>` : ""}
            </div>
        `;
    }

    function getCategoryFeaturesSync(category) {
        if (!category) return [];
        if (typeof category !== "object") {
            const found = cacheCategorias.find((item) => String(getCategoryId(item)) === String(category));
            if (found) return getCategoryFeaturesSync(found);
            return cacheFeaturesPorCategoria[String(category)] || [];
        }
        if (Array.isArray(category.features)) return category.features;
        return cacheFeaturesPorCategoria[String(getCategoryId(category))] || [];
    }

    function getCategoryFeaturesText(category) {
        return getCategoryFeaturesSync(category).map(getFeatureName).join(" ");
    }

    function getFilteredCategories() {
        let categories = [...cacheCategorias];
        const search = getInputValue("categories-search");
        const sort = getInputValue("categories-sort") || "name-asc";

        categories = categories.filter((category) => includesSearch([
            getCategoryId(category),
            getCategoryName(category),
            getCategoryFeaturesText(category),
        ], search));

        const sortMap = {
            "name-asc": { accessor: getCategoryName, dir: 1, type: "text" },
            "name-desc": { accessor: getCategoryName, dir: -1, type: "text" },
            "id-asc": { accessor: getCategoryId, dir: 1, type: "number" },
            "id-desc": { accessor: getCategoryId, dir: -1, type: "number" },
            "features-asc": { accessor: (category) => getCategoryFeaturesSync(category).length, dir: 1, type: "number" },
            "features-desc": { accessor: (category) => getCategoryFeaturesSync(category).length, dir: -1, type: "number" },
        };

        const config = sortMap[sort] || sortMap["name-asc"];
        return [...categories].sort((a, b) => compareValues(config.accessor(a), config.accessor(b), config.type) * config.dir);
    }

    function renderCategoriesTable() {
        const tbody = document.getElementById("categoriesTableBody");
        if (!tbody) return;

        const categories = getFilteredCategories();
        updateCounter("categoriesResultCount", categories.length, cacheCategorias.length);
        const pagination = paginate("categories", categories);
        renderPagination("categories", pagination);

        if (!pagination.items.length) {
            renderEmptyRow(tbody, 4, "Nenhuma categoria encontrada.");
            return;
        }

        tbody.innerHTML = pagination.items.map((category) => `
            <tr class="align-top transition hover:bg-blue-50/40">
                <td class="${TABLE_ID_CELL_CLASS}">#${escapeHTML(getCategoryId(category))}</td>
                <td>
                    <div class="${TABLE_TITLE_CLASS}">${escapeHTML(getCategoryName(category))}</div>
                    <div class="${TABLE_SUBTITLE_CLASS}">${getCategoryFeaturesSync(category).length} característica${getCategoryFeaturesSync(category).length === 1 ? "" : "s"}</div>
                </td>
                <td>${renderCategoryFeatures(getCategoryFeaturesSync(category))}</td>
                <td class="${TABLE_ACTION_CELL_CLASS}">
                    ${renderTableActions([{ label: "Ativos", variant: "primary", title: "Listar ativos desta categoria", attrs: { "data-category-filter": getCategoryId(category) } }])}
                </td>
            </tr>
        `).join("");
    }



    function renderLocationsTable() {
        const tbody = document.getElementById("locationsTableBody");
        if (!tbody) return;

        const locations = getFilteredLocations();
        updateCounter("locationsResultCount", locations.length, cacheLocais.length);
        const pagination = paginate("locations", locations);
        renderPagination("locations", pagination);

        if (!pagination.items.length) {
            renderEmptyRow(tbody, 4, "Nenhum local associado encontrado.");
            return;
        }

        tbody.innerHTML = pagination.items.map((location) => `
            <tr class="align-top transition hover:bg-blue-50/40">
                <td class="${TABLE_ID_CELL_CLASS}">#${escapeHTML(getLocationId(location))}</td>
                <td>
                    <div class="${TABLE_TITLE_CLASS}">${escapeHTML(getLocationName(location))}</div>
                    <div class="${TABLE_SUBTITLE_CLASS}">Local associado</div>
                </td>
                <td class="font-semibold">${escapeHTML(getLocationAssetCount(location))}</td>
                <td class="${TABLE_ACTION_CELL_CLASS}">
                    ${renderTableActions([{ label: "Ver ativos", variant: "primary", title: "Ver ativos deste local", attrs: { "data-location-filter": getLocationId(location) } }])}
                </td>
            </tr>
        `).join("");
    }

    function getFilteredLogs() {
        let logs = [...cacheRegistos];
        const search = getInputValue("logs-search");
        const user = getInputValue("logs-user");
        const action = getInputValue("logs-action");
        const sort = getInputValue("logs-sort") || "date-desc";

        logs = logs.filter((log) => {
            const matchesSearch = includesSearch([
                getLogId(log),
                formatDate(getLogDate(log)),
                getLogUser(log),
                getLogAction(log),
                getLogActionLabel(log),
                getLogTableLabel(log),
                getLogDetails(log),
                auditDisplayText(log.old_value_display),
                auditDisplayText(log.new_value_display),
                auditDisplayText(log.changes),
            ], search);
            const matchesUser = !user || normalize(getLogUser(log)) === normalize(user);
            const matchesAction = !action || normalize(getLogActionLabel(log)) === normalize(action);
            return matchesSearch && matchesUser && matchesAction;
        });

        const sortMap = {
            "date-desc": { accessor: getLogDate, dir: -1, type: "date" },
            "date-asc": { accessor: getLogDate, dir: 1, type: "date" },
            "user-asc": { accessor: getLogUser, dir: 1, type: "text" },
            "action-asc": { accessor: getLogActionLabel, dir: 1, type: "text" },
        };
        const config = sortMap[sort] || sortMap["date-desc"];
        return [...logs].sort((a, b) => compareValues(config.accessor(a), config.accessor(b), config.type) * config.dir);
    }

    function renderLogsTable() {
        const tbody = document.getElementById("logsTableBody");
        if (!tbody) return;

        const logs = getFilteredLogs();
        updateCounter("logsResultCount", logs.length, cacheRegistos.length);
        const pagination = paginate("logs", logs);
        renderPagination("logs", pagination);

        if (!pagination.items.length) {
            renderEmptyRow(tbody, 5, "Nenhum registo encontrado para os teus ativos.");
            return;
        }

        tbody.innerHTML = pagination.items.map((log) => `
            <tr class="align-top transition hover:bg-blue-50/40 cursor-pointer" data-open-log="${escapeHTML(getLogId(log))}">
                <td class="whitespace-nowrap px-4 py-3 font-semibold text-gray-900">${escapeHTML(formatDate(getLogDate(log)))}</td>
                <td class="px-4 py-3">${escapeHTML(getLogUser(log))}</td>
                <td class="px-4 py-3"><span class="${TABLE_TITLE_CLASS}">${escapeHTML(getLogActionLabel(log))}</span></td>
                <td class="px-4 py-3">${escapeHTML(getLogTableLabel(log))}</td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-gray-900">${escapeHTML(getLogDetails(log))}</div>
                    <div class="mt-2">${renderTableActions([
                        { label: "Detalhe", variant: "secondary", title: "Ver detalhe do registo", attrs: { "data-log-action": "view", "data-log-id": getLogId(log) } },
                        ...(canRollbackLog(log) ? [{ label: "Reverter", variant: "danger", title: getLogRollbackLabel(log), attrs: { "data-log-action": "rollback", "data-log-id": getLogId(log) } }] : [])
                    ])}</div>
                </td>
            </tr>
        `).join("");
    }

    function auditDisplayText(items) {
        if (!items) return "";
        if (!Array.isArray(items)) return String(items);
        return items.map((item) => [item?.label, item?.value, item?.old, item?.new].filter(Boolean).join(" ")).join(" ");
    }

    function isAuditKeyHidden(key) {
        const normalizedKey = String(key || "");
        return normalizedKey.startsWith("_rollback_") ||
            ["specs_details", "totp_secret", "password_hash", "registration_token_hash", "mfa_recovery_code_hash"].includes(normalizedKey);
    }

    function humanizeAuditKey(key) {
        const labels = {
            asset_id: "ID do ativo",
            asset_state: "Estado",
            assigned_at: "Data de atribuição",
            assigned_to: "Atribuído a",
            category_id: "ID da categoria",
            category_name: "Categoria",
            content: "Conteúdo",
            created_at: "Criado em",
            feature_id: "ID da característica",
            feature_name: "Característica",
            last_maintenance: "Última manutenção",
            location_id: "ID do local",
            location_name: "Local",
            maintenance_period_months: "Período de manutenção",
            registered_at: "Data de registo",
            serial_number: "Número de série",
            specs: "Características",
            status: "Estado",
        };
        return labels[key] || String(key || "Campo").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
    }

    function formatAuditFallbackValue(value) {
        if (value === null || value === undefined || value === "") return "-";
        if (value === true) return "Sim";
        if (value === false) return "Não";
        if (Array.isArray(value)) return value.map(formatAuditFallbackValue).join("; ") || "-";
        if (typeof value === "object") {
            return Object.entries(value)
                .filter(([key]) => !isAuditKeyHidden(key))
                .map(([key, item]) => `${humanizeAuditKey(key)}: ${formatAuditFallbackValue(item)}`)
                .join("; ") || "-";
        }
        return String(value);
    }

    function buildAuditItemsFromRawValue(rawValue) {
        if (!rawValue) return [];
        if (typeof rawValue !== "object" || Array.isArray(rawValue)) {
            return [{ label: "Valor", value: formatAuditFallbackValue(rawValue) }];
        }

        const items = [];
        Object.entries(rawValue).forEach(([key, value]) => {
            if (isAuditKeyHidden(key)) return;
            if (key === "specs" && value && typeof value === "object" && !Array.isArray(value)) {
                Object.entries(value).forEach(([specName, specValue]) => {
                    items.push({ label: `Característica · ${specName}`, value: formatAuditFallbackValue(specValue) });
                });
                return;
            }
            items.push({ label: humanizeAuditKey(key), value: formatAuditFallbackValue(value) });
        });
        return items;
    }

    function getAuditItems(log, displayKey, rawKey) {
        const displayItems = log && Array.isArray(log[displayKey]) ? log[displayKey] : [];
        if (displayItems.length) return displayItems;
        return buildAuditItemsFromRawValue(log ? log[rawKey] : null);
    }

    function renderAuditItemList(items, emptyText) {
        if (!items.length) return `<p class="text-sm text-gray-500">${escapeHTML(emptyText)}</p>`;
        return `
            <div class="grid grid-cols-1 gap-2">
                ${items.map((item) => `
                    <div class="rounded-lg border border-gray-100 bg-white px-3 py-2">
                        <p class="text-[11px] font-extrabold uppercase text-blue-900">${escapeHTML(item.label || "Campo")}</p>
                        <p class="mt-1 break-words text-sm font-semibold text-gray-900">${escapeHTML(item.value ?? "-")}</p>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderAuditChanges(log) {
        const changes = Array.isArray(log?.changes) ? log.changes : [];
        if (!changes.length) return `<p class="text-sm text-gray-500">Sem diferenças diretas para comparar.</p>`;

        return `
            <div class="space-y-2">
                ${changes.map((change) => `
                    <div class="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                        <p class="text-xs font-extrabold uppercase text-blue-900">${escapeHTML(change.label || "Campo")}</p>
                        <div class="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div class="rounded-lg bg-white p-2">
                                <p class="text-[11px] font-bold uppercase text-gray-500">Antes</p>
                                <p class="break-words text-sm font-semibold text-gray-900">${escapeHTML(change.old ?? "-")}</p>
                            </div>
                            <div class="rounded-lg bg-white p-2">
                                <p class="text-[11px] font-bold uppercase text-gray-500">Depois</p>
                                <p class="break-words text-sm font-semibold text-gray-900">${escapeHTML(change.new ?? "-")}</p>
                            </div>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function renderRollbackPanel(log) {
        if (canRollbackLog(log)) {
            return `
                <section class="rounded-2xl border border-red-100 bg-red-50/70 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 class="text-sm font-black uppercase text-red-800">Reversão disponível</h3>
                            <p class="mt-1 text-xs font-semibold text-red-700">${escapeHTML(getLogRollbackLabel(log))}. A reversão só é permitida para ativos que continuam dentro das tuas salas e cria um novo registo de auditoria.</p>
                        </div>
                        <button type="button" class="rounded-lg border-2 border-red-700 bg-white px-4 py-2 text-sm font-black uppercase text-red-700 hover:bg-red-100" data-log-action="rollback" data-log-id="${escapeHTML(getLogId(log))}">Executar Reversão</button>
                    </div>
                </section>
            `;
        }

        return `
            <section class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <h3 class="text-sm font-black uppercase text-gray-600">Rollback indisponível</h3>
                <p class="mt-1 text-xs font-semibold text-gray-500">${escapeHTML(getLogRollbackReason(log))}</p>
            </section>
        `;
    }

    function renderLogDetail(log) {
        const content = document.getElementById("logDetailContent");
        if (!content) return;

        const oldItems = getAuditItems(log, "old_value_display", "old_value");
        const newItems = getAuditItems(log, "new_value_display", "new_value");

        content.innerHTML = `
            ${renderRollbackPanel(log)}
            <section>
                <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Resumo</h3>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    ${detailCard("Data/hora", formatDate(getLogDate(log)))}
                    ${detailCard("Utilizador", getLogUser(log))}
                    ${detailCard("Ação", getLogActionLabel(log))}
                    ${detailCard("Área", "Ativos")}
                    ${detailCard("Registo afetado", getLogRecordLabel(log))}
                    ${detailCard("Origem", getLogOriginLabel(log))}
                </div>
            </section>
            <section>
                <h3 class="mb-3 text-sm font-black uppercase text-blue-900">O que mudou</h3>
                ${renderAuditChanges(log)}
            </section>
            <section class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div class="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Antes</h3>
                    ${renderAuditItemList(oldItems, "Sem valor anterior. Normalmente acontece quando o ativo foi criado.")}
                </div>
                <div class="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Depois</h3>
                    ${renderAuditItemList(newItems, "Sem valor novo. Normalmente acontece quando o ativo foi removido.")}
                </div>
            </section>
        `;
    }

    async function rollbackRegisto(logId) {
        const log = findLog(logId);
        const label = log ? `${getLogRollbackLabel(log)} em ${getLogTableLabel(log)} #${getLogRecordId(log)}` : `Rollback do registo #${logId}`;

        if (log && !canRollbackLog(log)) {
            showToast(getLogRollbackReason(log), true);
            return;
        }

        if (!confirm(`${label}. Tens a certeza?`)) return;

        const result = await api.post(`/logs/${logId}/rollback`, {});
        if (!result.success) {
            showToast(result.error || result.message || "Não foi possível executar o rollback.", true);
            return;
        }

        showToast(result.message || "Rollback executado com sucesso.");
        fecharModalGestor("modalDetalheRegisto");
        await reloadData();
    }

    async function verDetalheRegisto(logId) {
        let log = findLog(logId);

        const result = await api.get(`/logs/${logId}`);
        if (result.success && result.data) {
            log = result.data;
            const index = cacheRegistos.findIndex((item) => String(getLogId(item)) === String(logId));
            if (index >= 0) {
                cacheRegistos[index] = { ...cacheRegistos[index], ...log, table_name: "assets", table_label: "Ativos" };
            }
        }

        if (!log) {
            showToast(result.error || result.message || "Registo não encontrado.", true);
            return;
        }

        renderLogDetail(log);
        abrirModalGestor("modalDetalheRegisto");
    }


    function getAssetsNeedingAction() {
        return cacheAtivos
            .filter((asset) => getAssetStatus(asset) !== "Bom Estado" || isMaintenanceDue(asset))
            .sort((a, b) => compareValues(getAssetStatus(a), getAssetStatus(b), "text"));
    }

    function getFilteredAssets() {
        let assets = [...cacheAtivos];
        const search = getInputValue("assets-search");
        const locationId = getInputValue("assets-location");
        const categoryId = getInputValue("assets-category");
        const status = getInputValue("assets-status");
        const assignment = getInputValue("assets-assignment");
        const sort = getInputValue("assets-sort") || "date-desc";

        assets = assets.filter((asset) => {
            const assignedTo = getAssetAssignedTo(asset);
            const matchesSearch = includesSearch([
                getAssetId(asset),
                getAssetSerial(asset),
                getAssetCategoryName(asset),
                getAssetLocationName(asset),
                getAssetStatus(asset),
                assignedTo,
                formatDate(getAssetRegisteredAt(asset)),
                getSpecsSearchText(asset),
            ], search);
            const matchesLocation = !locationId || String(getAssetLocationId(asset)) === String(locationId);
            const matchesCategory = !categoryId || String(getAssetCategoryId(asset)) === String(categoryId);
            const matchesStatus = !status || normalize(getAssetStatus(asset)) === normalize(status);
            const matchesAssignment = !assignment ||
                (assignment === "assigned" && assignedTo !== "-") ||
                (assignment === "unassigned" && assignedTo === "-");
            return matchesSearch && matchesLocation && matchesCategory && matchesStatus && matchesAssignment;
        });

        return sortAssets(assets, sort);
    }

    function getFilteredLocations() {
        let locations = [...cacheLocais];
        const search = getInputValue("locations-search");
        const sort = getInputValue("locations-sort") || "name-asc";

        locations = locations.filter((location) => includesSearch([
            getLocationId(location),
            getLocationName(location),
            getLocationStatus(location),
            getLocationAssetCount(location),
        ], search));

        const sortMap = {
            "name-asc": { accessor: getLocationName, dir: 1, type: "text" },
            "name-desc": { accessor: getLocationName, dir: -1, type: "text" },
            "assets-desc": { accessor: getLocationAssetCount, dir: -1, type: "number" },
            "assets-asc": { accessor: getLocationAssetCount, dir: 1, type: "number" },
            "id-asc": { accessor: getLocationId, dir: 1, type: "number" },
            "id-desc": { accessor: getLocationId, dir: -1, type: "number" },
        };

        const config = sortMap[sort] || sortMap["name-asc"];
        return [...locations].sort((a, b) => compareValues(config.accessor(a), config.accessor(b), config.type) * config.dir);
    }

    function sortAssets(assets, sort) {
        const sortMap = {
            "category-asc": { accessor: getAssetCategoryName, dir: 1, type: "text" },
            "location-asc": { accessor: getAssetLocationName, dir: 1, type: "text" },
            "status-asc": { accessor: getAssetStatus, dir: 1, type: "text" },
            "date-desc": { accessor: getAssetRegisteredAt, dir: -1, type: "date" },
            "date-asc": { accessor: getAssetRegisteredAt, dir: 1, type: "date" },
            "id-asc": { accessor: getAssetId, dir: 1, type: "number" },
            "id-desc": { accessor: getAssetId, dir: -1, type: "number" },
        };
        const config = sortMap[sort] || sortMap["date-desc"];
        return [...assets].sort((a, b) => compareValues(config.accessor(a), config.accessor(b), config.type) * config.dir);
    }

    function populateFilters() {
        populateSelectFromRecords("assets-location", cacheLocais, getLocationId, getLocationName, "Todos");
        populateSelectFromRecords("assets-category", cacheCategorias, getCategoryId, getCategoryName, "Todas");
        populateSelect("assets-status", uniqueValues(cacheAtivos.map(getAssetStatus)), "Todos");
        populateSelect("logs-user", uniqueValues(cacheRegistos.map(getLogUser)), "Todos");
        populateSelect("logs-action", uniqueValues(cacheRegistos.map(getLogActionLabel)), "Todas");
    }

    function populateAssetModalSelects() {
        populateSelectFromRecords("asset-location", cacheLocais, getLocationId, getLocationName, "Selecionar local");
        populateSelectFromRecords("asset-category", cacheCategorias, getCategoryId, getCategoryName, "Selecionar categoria");
    }

    function populateSelect(selectId, values, placeholder) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const currentValue = select.value;
        const options = values
            .filter((value) => value !== undefined && value !== null && String(value).trim() !== "")
            .sort((a, b) => String(a).localeCompare(String(b), "pt", { sensitivity: "base", numeric: true }));
        const placeholderOnly = shouldRenderAsPlaceholderOnly(placeholder);
        select.innerHTML = renderSelectEmptyOption(placeholder, { asPlaceholder: placeholderOnly, selected: !currentValue }) + options
            .map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`)
            .join("");
        if (options.some((value) => String(value) === String(currentValue))) {
            select.value = currentValue;
        } else {
            select.value = "";
        }
    }

    function populateSelectFromRecords(selectId, records, getValue, getLabel, placeholder) {
        const select = document.getElementById(selectId);
        if (!select) return;
        const currentValue = select.value;
        const placeholderOnly = shouldRenderAsPlaceholderOnly(placeholder);
        select.innerHTML = renderSelectEmptyOption(placeholder, { asPlaceholder: placeholderOnly, selected: !currentValue }) + records
            .map((record) => `<option value="${escapeHTML(getValue(record))}">${escapeHTML(getLabel(record))}</option>`)
            .join("");
        if (Array.from(select.options).some((option) => option.value === String(currentValue))) {
            select.value = currentValue;
        } else {
            select.value = "";
        }
    }

    function abrirModalAtivoGestor(asset = null) {
        populateAssetModalSelects();
        const form = document.getElementById("formAtivoGestor");
        form?.reset();

        const editingId = document.getElementById("editing-asset-id");
        const serialInput = document.getElementById("asset-serial");
        const title = document.getElementById("modalAtivoTitulo");
        const submitButton = document.getElementById("assetSubmitBtn");
        const serialHint = document.getElementById("serialEditHint");

        if (editingId) editingId.value = asset ? String(getAssetId(asset)) : "";
        if (title) title.textContent = asset ? "Editar Ativo" : "Novo Ativo";
        if (submitButton) submitButton.textContent = asset ? "Atualizar" : "Guardar";
        if (serialInput) {
            serialInput.disabled = !!asset;
            serialInput.classList.toggle("bg-gray-100", !!asset);
            serialInput.classList.toggle("cursor-not-allowed", !!asset);
        }
        serialHint?.classList.toggle("hidden", !asset);

        resetAssetTemplateSelect();

        if (asset) {
            setInputValue("asset-serial", getAssetSerial(asset));
            setInputValue("asset-category", getAssetCategoryId(asset));
            setInputValue("asset-location", getAssetLocationId(asset));
            setInputValue("asset-state", getAssetStatus(asset));
            setInputValue("asset-assigned", getAssetAssignedTo(asset) === "-" ? "" : getAssetAssignedTo(asset));
            setInputValue("asset-last-maintenance", dateInputValue(getAssetLastMaintenance(asset)));
            setInputValue("asset-maintenance-period", getAssetMaintenancePeriod(asset));
            atualizarCamposSpecsDoAtivo(asset);
        } else {
            resetAssetCreateModalValues();
        }

        abrirModalGestor("modalAtivoGestor");
    }

    function resetAssetCreateModalValues() {
        setInputValue("editing-asset-id", "");
        setInputValue("asset-serial", "");
        setInputValue("asset-category", "");
        setInputValue("asset-location", "");
        setInputValue("asset-state", "Bom Estado");
        setInputValue("asset-assigned", "");
        setInputValue("asset-last-maintenance", "");
        setInputValue("asset-maintenance-period", "");
        renderAssetSpecsPlaceholder("Seleciona uma categoria para aparecerem os campos certos.");
        resetAssetTemplateSelect();
    }

    async function atualizarCamposSpecsDoAtivo(asset = null) {
        const categoryId = getInputValue("asset-category");
        if (!categoryId) {
            renderAssetSpecsPlaceholder("Seleciona uma categoria para aparecerem os campos certos.");
            resetAssetTemplateSelect();
            return;
        }
        const features = await getFeaturesForCategory(categoryId);
        renderAssetSpecsFields(features, asset);
        updateAssetTemplateSelect();
    }

    async function getFeaturesForCategory(categoryId) {
        const id = String(categoryId || "");
        if (!id) return [];
        if (cacheFeaturesPorCategoria[id]) return cacheFeaturesPorCategoria[id];

        const features = await fetchArray(`/categories/${id}/features`);
        cacheFeaturesPorCategoria[id] = features;
        return features;
    }

    function getSpecReuseDatalistId(featureId) {
        return `gestor-spec-values-${String(featureId).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    }

    function getSpecReuseCacheKey(featureId, fieldKey = "") {
        const safeFeatureId = String(featureId || "");
        const safeFieldKey = String(fieldKey || "");
        return safeFieldKey ? `${safeFeatureId}::${safeFieldKey}` : safeFeatureId;
    }

    function renderSchemaFieldReuseSelect(feature, field) {
        const featureId = getFeatureId(feature);
        const fieldKey = getSchemaFieldKey(field);
        if (!featureId || !fieldKey) return "";

        return `
            <select data-spec-existing-field-select data-feature-id="${escapeHTML(featureId)}" data-field-key="${escapeHTML(fieldKey)}"
                class="asset-spec-existing-field-select mt-2 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-xs font-bold text-blue-900 outline-none focus:ring-2 focus:ring-blue-900/20" disabled>
                <option value="">Valores registados deste campo...</option>
            </select>
        `;
    }

    function renderSpecReuseSelect(feature) {
        if (String(getFeatureType(feature)).toLowerCase() === "boolean") return "";
        return `
            <label class="min-w-0 flex-1">
                <span class="mb-1 block text-[11px] font-black uppercase text-blue-900">Usar dados já registados</span>
                <select data-spec-existing-select data-feature-id="${escapeHTML(getFeatureId(feature))}"
                    class="asset-spec-existing-select min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-xs font-bold text-blue-900 outline-none focus:ring-2 focus:ring-blue-900/20" disabled>
                    <option value="">Valores registados...</option>
                </select>
            </label>
        `;
    }

    async function getFeatureRegisteredValues(featureId, fieldKey = "") {
        const key = String(featureId || "");
        const schemaFieldKey = String(fieldKey || "");
        if (!key) return [];

        const cacheKey = getSpecReuseCacheKey(key, schemaFieldKey);
        if (Array.isArray(cacheValoresSpecsPorFeature[cacheKey])) return cacheValoresSpecsPorFeature[cacheKey];

        const query = schemaFieldKey ? `?field_key=${encodeURIComponent(schemaFieldKey)}` : "";
        const result = await api.get(`/assets/features/${encodeURIComponent(key)}/values${query}`);
        const values = result.success && Array.isArray(result.data) ? result.data : [];
        cacheValoresSpecsPorFeature[cacheKey] = values;
        return values;
    }

    function optionDataValue(item) {
        return item && typeof item === "object" ? item.value : item;
    }

    function optionDataLabel(item) {
        return item && typeof item === "object" ? (item.label || item.value) : item;
    }

    function updateSpecReuseOptions(featureId, values = [], fieldKey = "") {
        const key = String(featureId || "");
        const schemaFieldKey = String(fieldKey || "");

        if (schemaFieldKey) {
            document.querySelectorAll("[data-spec-existing-field-select]").forEach((select) => {
                if (String(select.dataset.featureId) !== key || String(select.dataset.fieldKey) !== schemaFieldKey) return;
                const currentValue = select.value;
                select.innerHTML = `<option value="">Valores registados deste campo...</option>` + values.map((item) => {
                    const value = optionDataValue(item);
                    const label = optionDataLabel(item);
                    return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
                }).join("");
                select.disabled = values.length === 0;
                select.value = values.some((item) => String(optionDataValue(item)) === String(currentValue)) ? currentValue : "";
            });
            return;
        }

        const datalistId = getSpecReuseDatalistId(key);
        const datalistOptions = values.map((item) => {
            const value = optionDataValue(item);
            const label = optionDataLabel(item);
            return `<option value="${escapeHTML(value)}" label="${escapeHTML(label)}"></option>`;
        }).join("");

        document.querySelectorAll("datalist[data-spec-values-list]").forEach((datalist) => {
            if (datalist.id === datalistId) datalist.innerHTML = datalistOptions;
        });

        document.querySelectorAll("[data-spec-existing-select]").forEach((select) => {
            if (String(select.dataset.featureId) !== key) return;
            const currentValue = select.value;
            select.innerHTML = `<option value="">Valores registados...</option>` + values.map((item) => {
                const value = optionDataValue(item);
                const label = optionDataLabel(item);
                return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
            }).join("");
            select.disabled = values.length === 0;
            select.value = values.some((item) => String(optionDataValue(item)) === String(currentValue)) ? currentValue : "";
        });
    }

    async function hydrateSpecReuseValues(features = []) {
        await Promise.all((features || []).map(async (feature) => {
            const featureId = getFeatureId(feature);
            const featureType = String(getFeatureType(feature)).toLowerCase();

            if (featureType !== "boolean") {
                const values = await getFeatureRegisteredValues(featureId);
                updateSpecReuseOptions(featureId, values);
            }

            if (hasFeatureFieldSchema(feature)) {
                await Promise.all(getFeatureFieldSchema(feature).map(async (field) => {
                    const fieldKey = getSchemaFieldKey(field);
                    if (!fieldKey) return;
                    const values = await getFeatureRegisteredValues(featureId, fieldKey);
                    updateSpecReuseOptions(featureId, values, fieldKey);
                }));
            }
        }));
    }

    function handleSpecReuseChange(event) {
        const fieldSelect = event.target.closest("[data-spec-existing-field-select]");
        if (fieldSelect) {
            if (!fieldSelect.value) return;
            const row = fieldSelect.closest("[data-spec-input-row]") || fieldSelect.parentElement;
            if (!row) return;
            const fieldKey = fieldSelect.dataset.fieldKey;
            const input = Array.from(row.querySelectorAll("[data-schema-field-key]"))
                .find(item => String(item.dataset.schemaFieldKey) === String(fieldKey));
            if (!input) return;
            input.value = fieldSelect.value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return;
        }

        const select = event.target.closest("[data-spec-existing-select]");
        if (!select || !select.value) return;
        const row = select.closest("[data-spec-input-row]") || select.parentElement;
        if (!row) return;

        if (row.matches("[data-structured-spec-row]")) {
            const structuredValue = parseSpecStructuredValue(select.value);
            row.querySelectorAll(".asset-structured-spec-input").forEach((input) => {
                const key = input.dataset.schemaFieldKey;
                input.value = key && structuredValue[key] !== undefined && structuredValue[key] !== null ? String(structuredValue[key]) : "";
                input.dispatchEvent(new Event("input", { bubbles: true }));
            });
            return;
        }

        const input = row.querySelector(".asset-spec-input");
        if (!input) return;
        input.value = select.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function renderAssetSpecsPlaceholder(message) {
        const container = document.getElementById("assetSpecsFields");
        if (!container) return;
        container.innerHTML = `<p class="md:col-span-2 text-sm text-gray-500">${escapeHTML(message)}</p>`;
    }

    function renderAssetSpecsFields(features, asset = null) {
        const container = document.getElementById("assetSpecsFields");
        if (!container) return;

        if (!features.length) {
            renderAssetSpecsPlaceholder("Esta categoria ainda não tem características associadas.");
            return;
        }

        container.innerHTML = features.map((feature) => renderFeatureInput(feature)).join("");
        hydrateSpecReuseValues(features);

        container.querySelectorAll("[data-add-feature-value]").forEach((button) => {
            button.addEventListener("click", () => {
                const featureId = button.dataset.addFeatureValue;
                const feature = features.find((item) => String(getFeatureId(item)) === String(featureId));
                if (feature) addRepeatableFeatureRow(feature);
            });
        });

        container.querySelectorAll("[data-remove-feature-value]").forEach((button) => {
            button.addEventListener("click", () => button.closest("[data-repeatable-row]")?.remove());
        });

        if (asset) fillAssetSpecs(asset);
    }

    function renderSchemaFieldControl(feature, field, value = "") {
        const featureId = getFeatureId(feature);
        const key = getSchemaFieldKey(field);
        const type = getSchemaFieldType(field);
        const label = getSchemaFieldLabel(field);
        const unit = getSchemaFieldUnit(field);
        const required = isSchemaFieldRequired(field);
        const safeValue = value === undefined || value === null ? "" : String(value);
        const commonClass = "asset-structured-spec-input w-full rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20";
        const fieldReuseSelect = renderSchemaFieldReuseSelect(feature, field);

        if (type === "boolean") {
            const normalized = safeValue.toLowerCase();
            const selectedValue = ["true", "1", "sim", "yes"].includes(normalized) ? "true" : (["false", "0", "nao", "não", "no"].includes(normalized) ? "false" : "");
            return `
                <label class="block min-w-0">
                    <span class="mb-1 block text-[11px] font-black uppercase text-blue-900">${escapeHTML(label)}${required ? " *" : ""}</span>
                    <select data-feature-id="${escapeHTML(featureId)}" data-schema-field-key="${escapeHTML(key)}" class="${commonClass}">
                        ${renderSelectEmptyOption("Selecionar", { asPlaceholder: true, selected: !selectedValue })}
                        <option value="true" ${selectedValue === "true" ? "selected" : ""}>Sim</option>
                        <option value="false" ${selectedValue === "false" ? "selected" : ""}>Não</option>
                    </select>
                    ${fieldReuseSelect}
                </label>
            `;
        }

        if (type === "select") {
            const options = getSchemaFieldOptions(field);
            return `
                <label class="block min-w-0">
                    <span class="mb-1 block text-[11px] font-black uppercase text-blue-900">${escapeHTML(label)}${required ? " *" : ""}</span>
                    <select data-feature-id="${escapeHTML(featureId)}" data-schema-field-key="${escapeHTML(key)}" class="${commonClass}">
                        ${renderSelectEmptyOption("Selecionar", { asPlaceholder: true, selected: !safeValue })}
                        ${options.map((option) => `<option value="${escapeHTML(option)}" ${String(option) === safeValue ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}
                    </select>
                    ${fieldReuseSelect}
                </label>
            `;
        }

        return `
            <label class="block min-w-0">
                <span class="mb-1 block text-[11px] font-black uppercase text-blue-900">${escapeHTML(label)}${unit ? ` (${escapeHTML(unit)})` : ""}${required ? " *" : ""}</span>
                <input data-feature-id="${escapeHTML(featureId)}" data-schema-field-key="${escapeHTML(key)}" type="${escapeHTML(inputTypeForFeature(type))}" value="${escapeHTML(safeValue)}" class="${commonClass}" placeholder="${escapeHTML(firstValue(field, ["placeholder"], ""))}">
                ${fieldReuseSelect}
            </label>
        `;
    }

    function renderStructuredFeatureRow(feature, value = "", allowRemove = true) {
        const schema = getFeatureFieldSchema(feature);
        const structuredValue = parseSpecStructuredValue(value);
        return `
            <div class="asset-spec-value-row asset-structured-spec-row rounded-2xl border border-blue-100 bg-blue-50/30 p-3 shadow-sm" data-repeatable-row data-spec-input-row data-structured-spec-row>
                <div class="asset-structured-fields-grid grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    ${schema.map((field) => renderSchemaFieldControl(feature, field, structuredValue[getSchemaFieldKey(field)])).join("")}
                </div>
                <div class="asset-structured-actions mt-3 grid grid-cols-1 items-end gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                    ${renderSpecReuseSelect(feature)}
                    ${allowRemove ? `<button type="button" data-remove-feature-value class="rounded-lg border-2 border-red-600 px-3 py-2 text-xs font-bold uppercase text-red-600 hover:bg-red-50">Remover</button>` : ""}
                </div>
            </div>
        `;
    }

    function renderFeatureSchemaPreview(feature) {
        const schema = getFeatureFieldSchema(feature);
        if (!schema.length) return "";
        return `
            <div class="mt-2 flex flex-wrap gap-1">
                ${schema.map((field) => `
                    <span class="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-900 ring-1 ring-blue-100">
                        ${escapeHTML(getSchemaFieldLabel(field))}${getSchemaFieldUnit(field) ? ` (${escapeHTML(getSchemaFieldUnit(field))})` : ""}${isSchemaFieldRequired(field) ? " *" : ""}
                    </span>
                `).join("")}
            </div>
        `;
    }

    function renderFeatureInput(feature) {
        const featureId = getFeatureId(feature);
        const name = getFeatureName(feature);
        const type = String(getFeatureType(feature)).toLowerCase();
        const isMultiple = isFeatureMultiple(feature);

        if (hasFeatureFieldSchema(feature)) {
            return `
                <div class="asset-spec-feature-card md:col-span-2 rounded-lg border border-blue-100 bg-white p-3" data-repeatable-feature="${escapeHTML(featureId)}" data-feature-type="${escapeHTML(type)}" data-structured-feature="true" data-is-multiple="${isMultiple ? "true" : "false"}">
                    <div class="asset-spec-feature-header mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                            <label class="block text-xs font-extrabold uppercase text-blue-900">${escapeHTML(name)}</label>
                            <div class="mt-1 flex flex-wrap gap-1">
                                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-700">Estruturada</span>
                                ${isMultiple ? `<span class="rounded-full bg-blue-900 px-2 py-0.5 text-[11px] font-bold text-white">Múltipla</span>` : ""}
                            </div>
                            ${renderFeatureSchemaPreview(feature)}
                        </div>
                        ${isMultiple ? `<button type="button" data-add-feature-value="${escapeHTML(featureId)}" class="rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-xs font-bold uppercase text-blue-900 hover:bg-gray-100">+ Valor</button>` : ""}
                    </div>
                    <div class="space-y-2" data-repeatable-values="${escapeHTML(featureId)}">
                        ${renderStructuredFeatureRow(feature, "", isMultiple)}
                    </div>
                </div>
            `;
        }

        if (isMultiple) {
            return `
                <div class="asset-spec-feature-card md:col-span-2 rounded-lg border border-blue-100 bg-white p-3" data-repeatable-feature="${escapeHTML(featureId)}" data-feature-type="${escapeHTML(type)}">
                    <div class="asset-spec-feature-header mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                            <label class="block text-xs font-extrabold uppercase text-blue-900">${escapeHTML(name)}</label>
                            <div class="mt-1 flex flex-wrap gap-1">
                                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-700">${escapeHTML(FEATURE_TYPE_LABELS[type] || "Texto")}</span>
                                <span class="rounded-full bg-blue-900 px-2 py-0.5 text-[11px] font-bold text-white">Múltipla</span>
                            </div>
                        </div>
                        <button type="button" data-add-feature-value="${escapeHTML(featureId)}"
                            class="rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-xs font-bold uppercase text-blue-900 hover:bg-gray-100">+ Valor</button>
                    </div>
                    <div class="space-y-2" data-repeatable-values="${escapeHTML(featureId)}">
                        ${renderRepeatableFeatureRow(feature)}
                    </div>
                    ${type !== "boolean" ? `<datalist id="${escapeHTML(getSpecReuseDatalistId(featureId))}" data-spec-values-list></datalist>` : ""}
                </div>
            `;
        }

        if (type === "boolean") {
            return `
                <div>
                    <label class="mb-1 block text-xs font-extrabold uppercase text-blue-900">${escapeHTML(name)}</label>
                    <select data-feature-id="${escapeHTML(featureId)}" class="asset-spec-input w-full rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20">
                        ${renderSelectEmptyOption("Selecionar valor", { asPlaceholder: true, selected: true })}
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                    </select>
                </div>
            `;
        }

        return `
            <div class="asset-spec-field-card" data-spec-input-row>
                <label class="mb-1 block text-xs font-extrabold uppercase text-blue-900">${escapeHTML(name)}</label>
                <input data-feature-id="${escapeHTML(featureId)}" list="${escapeHTML(getSpecReuseDatalistId(featureId))}" type="${escapeHTML(inputTypeForFeature(type))}"
                    class="asset-spec-input w-full rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20" placeholder="Valor">
                ${renderSpecReuseSelect(feature)}
                <datalist id="${escapeHTML(getSpecReuseDatalistId(featureId))}" data-spec-values-list></datalist>
            </div>
        `;
    }

    function renderRepeatableFeatureRow(feature, value = "") {
        const type = String(getFeatureType(feature)).toLowerCase();
        const featureId = getFeatureId(feature);

        if (hasFeatureFieldSchema(feature)) {
            return renderStructuredFeatureRow(feature, value);
        }

        if (type === "boolean") {
            return `
                <div class="flex gap-2" data-repeatable-row>
                    <select data-feature-id="${escapeHTML(featureId)}" class="asset-spec-input flex-1 rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20">
                        ${renderSelectEmptyOption("Selecionar valor", { asPlaceholder: true, selected: !String(value || "").trim() })}
                        <option value="true" ${String(value).toLowerCase() === "true" ? "selected" : ""}>Sim</option>
                        <option value="false" ${String(value).toLowerCase() === "false" ? "selected" : ""}>Não</option>
                    </select>
                    <button type="button" data-remove-feature-value class="rounded-lg border-2 border-red-600 px-3 py-2 text-xs font-bold uppercase text-red-600 hover:bg-red-50">Remover</button>
                </div>
            `;
        }

        return `
            <div class="grid grid-cols-1 items-end gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(11rem,0.7fr)_auto]" data-repeatable-row data-spec-input-row>
                <div class="min-w-0">
                    <input data-feature-id="${escapeHTML(featureId)}" list="${escapeHTML(getSpecReuseDatalistId(featureId))}" type="${escapeHTML(inputTypeForFeature(type))}" value="${escapeHTML(value)}"
                        class="asset-spec-input w-full rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20" placeholder="Valor">
                </div>
                ${renderSpecReuseSelect(feature)}
                <button type="button" data-remove-feature-value class="rounded-lg border-2 border-red-600 px-3 py-2 text-xs font-bold uppercase text-red-600 hover:bg-red-50">Remover</button>
            </div>
        `;
    }

    function addRepeatableFeatureRow(feature, value = "") {
        const container = document.querySelector(`[data-repeatable-values="${String(getFeatureId(feature))}"]`);
        if (!container) return;
        const wrapper = document.createElement("div");
        wrapper.innerHTML = renderRepeatableFeatureRow(feature, value).trim();
        const row = wrapper.firstElementChild;
        row?.querySelector("[data-remove-feature-value]")?.addEventListener("click", () => row.remove());
        container.appendChild(row);
        hydrateSpecReuseValues([feature]);
    }

    function fillAssetSpecs(asset) {
        const details = getAssetSpecsDetails(asset);
        const byFeatureId = new Map(details.map((detail) => [String(getFeatureId(detail)), detail]));

        document.querySelectorAll(".asset-spec-input").forEach((input) => {
            if (input.closest("[data-structured-feature='true']")) return;
            const featureId = input.dataset.featureId;
            const detail = byFeatureId.get(String(featureId));
            if (!detail) return;
            const value = getSpecValue(detail);
            if (Array.isArray(value)) return;
            input.value = valueForInput(value);
        });

        details.forEach((detail) => {
            const featureId = String(getFeatureId(detail));
            const repeatable = document.querySelector(`[data-repeatable-feature="${featureId}"]`);
            if (!repeatable) return;

            const valuesContainer = repeatable.querySelector(`[data-repeatable-values="${featureId}"]`);
            if (!valuesContainer) return;
            valuesContainer.innerHTML = "";

            const categoryFeatures = getCategoryFeaturesSync(getAssetCategoryId(asset));
            const categoryFeature = categoryFeatures.find((item) => String(getFeatureId(item)) === featureId);
            const feature = categoryFeature || {
                feature_id: featureId,
                feature_name: getFeatureName(detail),
                feature_type: getFeatureType(detail),
                field_schema: getFeatureFieldSchema(detail),
                is_multiple: true,
            };
            const values = Array.isArray(getSpecValue(detail)) ? getSpecValue(detail) : [getSpecValue(detail)];
            values.forEach((value) => addRepeatableFeatureRow(feature, hasFeatureFieldSchema(feature) ? value : valueForInput(value)));
        });
    }

    function resetAssetTemplateSelect() {
        const block = document.getElementById("assetExistingTemplateBlock");
        const select = document.getElementById("asset-existing-template-select");
        if (block) block.classList.add("hidden");
        if (select) {
            select.innerHTML = `<option value="">Seleciona uma categoria primeiro...</option>`;
            select.value = "";
            select.disabled = true;
        }
    }

    function formatAssetTemplateOption(asset) {
        const pieces = [getAssetSerial(asset) || `INV-${getAssetId(asset)}`, getAssetLocation(asset), getAssetStatus(asset)]
            .map((value) => String(value || "").trim())
            .filter(Boolean);
        return pieces.join(" · ") || `Ativo #${getAssetId(asset)}`;
    }

    async function getRegisteredAssetsForCategory(categoryId) {
        const key = String(categoryId || "");
        if (!key) return [];
        if (Array.isArray(cacheAtivosRegistadosPorCategoria[key])) return cacheAtivosRegistadosPorCategoria[key];

        const values = await fetchArray(`/assets/categories/${encodeURIComponent(key)}/registered-assets?limit=${ASSET_TEMPLATE_OPTION_LIMIT}`);
        cacheAtivosRegistadosPorCategoria[key] = values;
        return values;
    }

    async function updateAssetTemplateSelect() {
        const categoryId = getInputValue("asset-category");
        const editingAssetId = getInputValue("editing-asset-id");
        const block = document.getElementById("assetExistingTemplateBlock");
        const select = document.getElementById("asset-existing-template-select");

        if (!block || !select) return;
        if (!categoryId || editingAssetId) {
            resetAssetTemplateSelect();
            return;
        }

        block.classList.remove("hidden");
        select.disabled = true;
        select.innerHTML = `<option value="">A carregar ativos registados...</option>`;

        const assets = await getRegisteredAssetsForCategory(categoryId);
        if (!assets.length) {
            select.innerHTML = `<option value="">Sem ativos registados nesta categoria</option>`;
            select.disabled = true;
            return;
        }

        select.innerHTML = `<option value="">Preencher através de um ativo existente...</option>` + assets.map((asset) =>
            `<option value="${escapeHTML(getAssetId(asset))}">${escapeHTML(formatAssetTemplateOption(asset))}</option>`
        ).join("");
        select.disabled = false;
    }

    async function aplicarAtivoExistenteSelecionado(assetId) {
        const categoryId = getInputValue("asset-category");
        if (!categoryId || !assetId) return;

        const assets = await getRegisteredAssetsForCategory(categoryId);
        const asset = assets.find((item) => String(getAssetId(item)) === String(assetId));
        if (!asset) {
            showToast("Ativo existente não encontrado.", true);
            return;
        }

        setInputValue("asset-location", getAssetLocationId(asset));
        setInputValue("asset-state", getAssetStatus(asset));
        setInputValue("asset-assigned", getAssetAssignedTo(asset) === "-" ? "" : getAssetAssignedTo(asset));
        setInputValue("asset-last-maintenance", dateInputValue(getAssetLastMaintenance(asset)));
        setInputValue("asset-maintenance-period", getAssetMaintenancePeriod(asset));

        const features = await getFeaturesForCategory(categoryId);
        renderAssetSpecsFields(features, asset);
        showToast("Campos preenchidos com dados existentes. Confirma o número de série antes de guardar.");
    }

    async function handleAssetSubmit(event) {
        event.preventDefault();
        const editingAssetId = getInputValue("editing-asset-id");
        const existingAsset = editingAssetId ? findAsset(editingAssetId) : null;
        const serial = existingAsset ? getAssetSerial(existingAsset) : getInputValue("asset-serial");
        let lastMaintenance = getInputValue("asset-last-maintenance") || null;
        const state = getInputValue("asset-state") || "Bom Estado";

        if (state === "Bom Estado" && !lastMaintenance) {
            lastMaintenance = todayInputValue();
            setInputValue("asset-last-maintenance", lastMaintenance);
        }

        const payload = {
            serial_number: serial,
            category_id: Number(getInputValue("asset-category")),
            location_id: Number(getInputValue("asset-location")),
            asset_state: state,
            assigned_to: getInputValue("asset-assigned"),
            last_maintenance: lastMaintenance,
            maintenance_period_months: getInputValue("asset-maintenance-period") || null,
            specs: collectAssetSpecs(),
        };

        const submitButton = document.getElementById("assetSubmitBtn");
        const oldText = submitButton?.textContent || "Guardar";
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = editingAssetId ? "A atualizar..." : "A guardar...";
        }

        const result = editingAssetId
            ? await api.put(`/assets/${editingAssetId}`, payload)
            : await api.post("/assets/", payload);

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = oldText;
        }

        if (!result.success) {
            showToast(result.error || result.message || "Não foi possível guardar o ativo.", true);
            return;
        }

        fecharModalGestor("modalAtivoGestor");
        showToast(editingAssetId ? "Ativo atualizado com sucesso." : "Ativo criado com sucesso.");
        await reloadData();
    }

    function collectStructuredSpecRow(row) {
        const value = {};
        row.querySelectorAll(".asset-structured-spec-input").forEach((input) => {
            const key = input.dataset.schemaFieldKey;
            if (!key) return;
            const inputValue = input.value;
            if (inputValue === undefined || String(inputValue).trim() === "") return;
            value[key] = inputValue;
        });
        return value;
    }

    function collectAssetSpecs() {
        const specs = {};
        const grouped = new Map();

        document.querySelectorAll("[data-structured-feature='true']").forEach((wrapper) => {
            const featureId = wrapper.dataset.repeatableFeature;
            if (!featureId) return;
            const values = Array.from(wrapper.querySelectorAll("[data-structured-spec-row]"))
                .map(collectStructuredSpecRow)
                .filter((value) => Object.keys(value).length > 0);
            if (!values.length) return;
            specs[featureId] = wrapper.dataset.isMultiple === "true" ? values : values[0];
        });

        document.querySelectorAll(".asset-spec-input").forEach((input) => {
            if (input.closest("[data-structured-feature='true']")) return;
            const featureId = input.dataset.featureId;
            if (!featureId) return;
            const value = input.value;
            if (value === undefined || String(value).trim() === "") return;

            const repeatableWrapper = input.closest("[data-repeatable-feature]");
            if (repeatableWrapper) {
                if (!grouped.has(featureId)) grouped.set(featureId, []);
                grouped.get(featureId).push(value);
            } else {
                specs[featureId] = value;
            }
        });

        grouped.forEach((values, featureId) => {
            if (values.length) specs[featureId] = values;
        });

        return specs;
    }

    async function removerAtivoGestor(assetId) {
        const asset = findAsset(assetId);
        const label = asset ? `${getAssetCategoryName(asset)} #${getAssetId(asset)}` : `#${assetId}`;
        if (!confirm(`Tens a certeza que queres remover o ativo "${label}"?`)) return;

        const result = await api.delete(`/assets/${assetId}`);
        if (!result.success) {
            showToast(result.error || result.message || "Não foi possível remover o ativo.", true);
            return;
        }

        showToast("Ativo removido com sucesso.");
        await reloadData();
    }

    async function abrirDetalheAtivoGestor(assetId) {
        const asset = findAsset(assetId);
        if (!asset) {
            showToast("Ativo não encontrado.", true);
            return;
        }

        assetBeingViewedId = getAssetId(asset);

        try {
            const categoryId = getAssetCategoryId(asset);
            if (categoryId) await getFeaturesForCategory(categoryId);
        } catch (error) {
            console.warn("[Gestor] Não foi possível carregar as características da categoria para o detalhe.", error);
        }

        renderAssetDetail(asset);
        abrirModalGestor("modalDetalheAtivo");
    }

    function renderDetailField(label, value) {
        return `
            <div class="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p class="text-xs font-extrabold uppercase text-blue-900">${escapeHTML(label)}</p>
                <p class="mt-1 break-words text-sm font-semibold text-gray-900">${escapeHTML(displayValueOrNA(value))}</p>
            </div>
        `;
    }

    function detailCard(label, value, badge = false) {
        return `
            <div class="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p class="text-xs font-extrabold uppercase text-blue-900">${escapeHTML(label)}</p>
                <div class="mt-1 text-sm font-bold text-gray-900">${badge ? statusBadge(value) : escapeHTML(displayValueOrNA(value))}</div>
            </div>
        `;
    }

    function renderAssetDetail(asset) {
        const content = document.getElementById("assetDetailContent");
        const summary = document.getElementById("assetDetailSummary");
        const specs = document.getElementById("assetDetailSpecs");

        const html = `
            <section>
                <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Dados principais</h3>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                    ${renderDetailField("Código interno", getAssetCode(asset))}
                    ${renderDetailField("ID técnico", `#${getAssetId(asset)}`)}
                    ${renderDetailField("Categoria", getAssetCategoryName(asset))}
                    ${renderDetailField("Local", getAssetLocationName(asset))}
                    ${renderDetailField("Estado", getAssetStatus(asset))}
                    ${renderDetailField("Atribuído a", getAssetAssignedTo(asset))}
                    ${renderDetailField("Data de atribuição", formatDate(getAssetAssignedAt(asset)))}
                    ${renderDetailField("Data de registo", formatDate(getAssetRegisteredAt(asset)))}
                    ${renderDetailField("Última manutenção", formatDate(getAssetLastMaintenance(asset), false))}
                    ${renderDetailField("Período manutenção", getAssetMaintenancePeriod(asset) ? `${getAssetMaintenancePeriod(asset)} meses` : "")}
                </div>
            </section>
            <section>
                <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Características</h3>
                ${renderAssetSpecsDetail(asset)}
            </section>
        `;

        if (content) {
            content.innerHTML = html;
            return;
        }

        if (summary) {
            summary.innerHTML = [
                renderDetailField("Código interno", getAssetCode(asset)),
                renderDetailField("ID técnico", `#${getAssetId(asset)}`),
                renderDetailField("Categoria", getAssetCategoryName(asset)),
                renderDetailField("Local", getAssetLocationName(asset)),
                renderDetailField("Estado", getAssetStatus(asset)),
                renderDetailField("Atribuído a", getAssetAssignedTo(asset)),
                renderDetailField("Data de atribuição", formatDate(getAssetAssignedAt(asset))),
                renderDetailField("Data de registo", formatDate(getAssetRegisteredAt(asset))),
                renderDetailField("Última manutenção", formatDate(getAssetLastMaintenance(asset), false)),
                renderDetailField("Período manutenção", getAssetMaintenancePeriod(asset) ? `${getAssetMaintenancePeriod(asset)} meses` : ""),
            ].join("");
        }

        if (specs) specs.innerHTML = renderAssetSpecsDetail(asset);
    }

    function renderAssetSpecsDetail(asset) {
        const details = getAssetSpecsDetails(asset);
        const activeFeatures = getCategoryFeaturesSync(getAssetCategoryId(asset));
        const specsByFeatureId = {};
        const featureMap = new Map();

        activeFeatures.forEach((feature) => {
            const featureId = String(getFeatureId(feature));
            if (featureId) featureMap.set(featureId, feature);
        });

        details.forEach((detail) => {
            const featureId = String(getFeatureId(detail));
            if (!featureId) return;
            specsByFeatureId[featureId] = getSpecValue(detail);

            if (!featureMap.has(featureId)) {
                featureMap.set(featureId, {
                    feature_id: featureId,
                    feature_name: getFeatureName(detail),
                    feature_type: getFeatureType(detail),
                    field_schema: getFeatureFieldSchema(detail),
                    has_field_schema: hasFeatureFieldSchema(detail),
                    is_multiple: isFeatureMultiple(detail),
                    is_repeatable: isFeatureMultiple(detail),
                    feature_is_active: isFeatureActive(detail),
                    is_active: isFeatureActive(detail),
                });
            }
        });

        const specs = asset && asset.specs && typeof asset.specs === "object" ? asset.specs : {};
        Object.entries(specs).forEach(([key, value]) => {
            const feature = Array.from(featureMap.values()).find((item) =>
                String(getFeatureName(item)) === String(key) ||
                String(getFeatureRawName(item)) === String(key) ||
                String(getFeatureId(item)) === String(key)
            );
            if (feature) specsByFeatureId[String(getFeatureId(feature))] = value;
        });

        const features = Array.from(featureMap.values());
        if (!features.length) {
            return `<p class="text-sm text-gray-500">Este ativo não tem características registadas.</p>`;
        }

        return `
            <div class="grid grid-cols-1 gap-3">
                ${features.map((feature) => {
                    const featureId = String(getFeatureId(feature));
                    const rawValue = Object.prototype.hasOwnProperty.call(specsByFeatureId, featureId) ? specsByFeatureId[featureId] : "";
                    const structured = hasFeatureFieldSchema(feature);
                    return `
                        <div class="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p class="text-xs font-black uppercase tracking-wide text-blue-900">${escapeHTML(getFeatureName(feature))}</p>
                                    <p class="mt-0.5 text-[11px] font-semibold text-gray-500">${structured ? "" : escapeHTML(getFeatureTypeLabel(feature))}</p>
                                </div>
                            </div>
                            ${formatSpecValueForDetail(feature, rawValue)}
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    function formatSpecValueForDetail(feature, rawValue) {
        if (hasFeatureFieldSchema(feature)) {
            return renderStructuredSpecValueForDetail(feature, rawValue);
        }

        const values = decodeSpecValue(rawValue).filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
        if (!values.length) return `<span class="inline-flex rounded-lg bg-white px-2 py-1 text-sm font-semibold text-gray-500 ring-1 ring-gray-100">N/A</span>`;

        if (values.length > 1) {
            return `
                <div class="flex flex-wrap gap-2">
                    ${values.map((value) => `<span class="rounded-lg bg-white px-2 py-1 text-sm font-semibold text-gray-900 ring-1 ring-gray-100">${escapeHTML(formatSpecPrimitive(value))}</span>`).join("")}
                </div>
            `;
        }

        return `<span class="inline-flex rounded-lg bg-white px-2 py-1 text-sm font-semibold text-gray-900 ring-1 ring-gray-100">${escapeHTML(formatSpecPrimitive(values[0]))}</span>`;
    }

    function renderStructuredSpecValueForDetail(feature, rawValue) {
        const schema = getFeatureFieldSchema(feature);
        const values = getStructuredSpecValues(feature, rawValue);

        if (!values.length) return `<span class="inline-flex rounded-lg bg-white px-2 py-1 text-sm font-semibold text-gray-500 ring-1 ring-gray-100">N/A</span>`;

        return `
            <div class="space-y-3">
                ${values.map((item, index) => `
                    <div class="rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
                        ${values.length > 1 ? `<p class="mb-2 text-[11px] font-black uppercase text-blue-900">Valor ${index + 1}</p>` : ""}
                        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            ${schema.map((field) => {
                                const formatted = formatStructuredFieldValue(item[getSchemaFieldKey(field)], field) || "N/A";
                                return `
                                    <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                        <p class="text-[10px] font-black uppercase tracking-wide text-blue-900">${escapeHTML(getSchemaFieldLabel(field))}</p>
                                        <p class="mt-1 break-words text-sm font-semibold text-gray-900">${escapeHTML(formatted)}</p>
                                    </div>
                                `;
                            }).join("")}
                        </div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    function abrirModalGestor(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove("hidden");
        modal.classList.add("admin-modal-open", "flex");
        modal.style.display = "flex";
        modal.style.position = "fixed";
        modal.style.top = "0";
        modal.style.right = "0";
        modal.style.bottom = "0";
        modal.style.left = "0";
        modal.style.zIndex = "1000";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.background = "rgba(0, 0, 0, 0.40)";
        modal.style.padding = "1rem";
        modal.style.overflowY = "auto";
        modal.setAttribute("aria-hidden", "false");
    }

    function fecharModalGestor(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add("hidden");
        modal.classList.remove("admin-modal-open", "flex");
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }

    function limparFiltrosAtivos() {
        ["assets-search", "assets-location", "assets-category", "assets-status", "assets-assignment"].forEach((id) => setInputValue(id, ""));
        setInputValue("assets-sort", "date-desc");
        setAssetsFilterDrawerOpen(false);
        setAssetsColumnPickerOpen(false);
        tablePaginationState.assets = 1;
        renderAssetsTable();
    }

    function limparFiltrosLocais() {
        setInputValue("locations-search", "");
        setInputValue("locations-sort", "name-asc");
        tablePaginationState.locations = 1;
        setLocationsFilterDrawerOpen(false);
        renderLocationsTable();
        updateLocationsSearchSummary();
    }

    function limparFiltrosCategorias() {
        setInputValue("categories-search", "");
        setInputValue("categories-sort", "name-asc");
        tablePaginationState.categories = 1;
        setCategoriesFilterDrawerOpen(false);
        renderCategoriesTable();
        updateCategoriesSearchSummary();
    }

    function limparFiltrosRegistos() {
        ["logs-search", "logs-user", "logs-action"].forEach((id) => setInputValue(id, ""));
        setInputValue("logs-sort", "date-desc");
        tablePaginationState.logs = 1;
        setLogsFilterDrawerOpen(false);
        renderLogsTable();
        updateLogsSearchSummary();
    }

    function scrollParaTabelaAtivos() {
        const target = document.getElementById("assetsTableBody")?.closest(".table-shell")
            || document.getElementById("assetsPagination")
            || document.getElementById("assetsResultCount")
            || document.getElementById("view-ativos");

        if (!target) return;

        window.setTimeout(() => {
            target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
        }, 120);
    }

    function filtrarAtivosPorLocal(locationId) {
        setInputValue("assets-location", locationId || "");
        tablePaginationState.assets = 1;
        setAssetsFilterDrawerOpen(false);
        showView("ativos");
        renderAssetsTable();
        scrollParaTabelaAtivos();
    }

    async function filtrarAtivosPorCategoria(categoryId) {
        setInputValue("assets-category", categoryId || "");
        tablePaginationState.assets = 1;
        setAssetsFilterDrawerOpen(false);
        await atualizarFeaturesCategoriaPesquisaAtivos();
        showView("ativos");
        renderAssetsTable();
        scrollParaTabelaAtivos();
    }

    function mudarPaginaTabela(group, direction) {
        if (!Object.prototype.hasOwnProperty.call(tablePaginationState, group)) return;
        const delta = direction === "next" ? 1 : -1;
        tablePaginationState[group] = Math.max(1, (Number(tablePaginationState[group]) || 1) + delta);
        if (group === "assets") renderAssetsTable();
        if (group === "categories") renderCategoriesTable();
        if (group === "locations") renderLocationsTable();
        if (group === "actionAssets") renderActionAssetsTable();
        if (group === "logs") renderLogsTable();
    }

    function paginate(group, items) {
        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
        const currentPage = Math.min(Math.max(Number(tablePaginationState[group]) || 1, 1), totalPages);
        const start = (currentPage - 1) * TABLE_PAGE_SIZE;
        const end = Math.min(start + TABLE_PAGE_SIZE, total);
        tablePaginationState[group] = currentPage;

        return {
            items: items.slice(start, end),
            total,
            totalPages,
            currentPage,
            startIndex: total ? start + 1 : 0,
            endIndex: end,
        };
    }

    function renderPagination(group, pagination) {
        const container = document.getElementById(`${group}Pagination`);
        if (!container) return;
        const isFirstPage = pagination.currentPage <= 1;
        const isLastPage = pagination.currentPage >= pagination.totalPages;
        const info = pagination.total
            ? `A mostrar ${pagination.startIndex}-${pagination.endIndex} de ${pagination.total} · Página ${pagination.currentPage} de ${pagination.totalPages}`
            : "0 resultados";

        container.innerHTML = `
            <span class="text-sm font-bold text-gray-500">${escapeHTML(info)}</span>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-900 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-blue-900 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white" data-pagination-group="${escapeHTML(group)}" data-pagination-direction="prev" ${isFirstPage ? "disabled" : ""}>Anterior</button>
                <button type="button" class="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-900 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-blue-900 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white" data-pagination-group="${escapeHTML(group)}" data-pagination-direction="next" ${isLastPage ? "disabled" : ""}>Seguinte</button>
            </div>
        `;
    }

    function preencherManutencaoSeBomEstado() {
        const state = getInputValue("asset-state");
        const lastMaintenanceInput = document.getElementById("asset-last-maintenance");
        if (state === "Bom Estado" && lastMaintenanceInput && !lastMaintenanceInput.value) {
            lastMaintenanceInput.value = todayInputValue();
        }
    }

    function isMaintenanceDue(asset) {
        const period = Number(getAssetMaintenancePeriod(asset));
        const lastMaintenance = getAssetLastMaintenance(asset);
        if (!period || !lastMaintenance) return false;
        const lastDate = new Date(lastMaintenance);
        if (Number.isNaN(lastDate.getTime())) return false;
        const due = new Date(lastDate);
        due.setMonth(due.getMonth() + period);
        return due.getTime() < Date.now();
    }

    function renderEmptyRow(tbody, colspan, message) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="px-4 py-6 text-center text-sm text-gray-500">
                    ${escapeHTML(message)}
                </td>
            </tr>
        `;
    }

    function statusBadge(status) {
        const text = String(status || "-");
        const normalized = normalize(text);
        let classes = "bg-blue-100 text-blue-800";
        if (["ativo", "ativa", "operacional", "bom", "bom estado", "disponivel", "ok"].includes(normalized)) {
            classes = "bg-green-100 text-green-800";
        } else if (["avariado", "para abate", "inativo", "inativa", "removido", "removida"].includes(normalized)) {
            classes = "bg-red-100 text-red-800";
        } else if (["necessita manutencao", "manutencao", "pendente", "reservado", "reservada"].includes(normalized)) {
            classes = "bg-yellow-100 text-yellow-800";
        }
        return `<span class="px-2 py-1 rounded text-xs ${classes}">${escapeHTML(text)}</span>`;
    }

    function showToast(message, isError = false) {
        const toast = document.getElementById("toastMessage");
        if (!toast) return;
        toast.textContent = message;
        toast.className = `fixed right-6 top-6 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${isError ? "bg-red-100 text-red-800 border border-red-200" : "bg-green-100 text-green-800 border border-green-200"}`;
        setTimeout(() => toast.classList.add("hidden"), 3500);
    }

    function updateCounter(elementId, filtered, total) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = `${filtered} de ${total} resultados`;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function getInputValue(id) {
        return document.getElementById(id)?.value || "";
    }

    function setInputValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value ?? "";
    }

    function firstValue(obj, keys, fallback = "") {
        for (const key of keys) {
            if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
                return obj[key];
            }
        }
        return fallback;
    }

    function displayValueOrNA(value) {
        if (value === undefined || value === null) return "N/A";
        const text = String(value).trim();
        if (!text || text === "-" || text === "—") return "N/A";
        return value;
    }

    function getAssetId(asset) { return firstValue(asset, ["asset_id", "id", "id_asset"], "-"); }
    function getAssetSerial(asset) { return firstValue(asset, ["serial_number", "serial", "numero_serie", "n_serie"], ""); }
    function getAssetCode(asset) { return getAssetSerial(asset) || `INV-${getAssetId(asset)}`; }
    function getAssetCategoryId(asset) { return firstValue(asset, ["category_id", "categoria_id", "id_category", "id_categoria"], ""); }
    function getAssetLocationId(asset) { return firstValue(asset, ["location_id", "local_id", "id_location", "id_local"], ""); }
    function getAssetCategoryName(asset) { return firstValue(asset, ["category_name", "category", "categoria", "nome_categoria"], "Equipamento"); }
    function getAssetLocationName(asset) { return firstValue(asset, ["location_name", "location", "local", "sala", "room_name"], "Sem local"); }
    function getAssetStatus(asset) { return firstValue(asset, ["asset_state", "status", "estado", "state"], "Bom Estado"); }
    function getAssetAssignedTo(asset) { return firstValue(asset, ["assigned_to", "assigned_to_name", "atribuido_a", "responsavel"], "-"); }
    function getAssetAssignedAt(asset) { return firstValue(asset, ["assigned_at", "assignment_date", "data_atribuicao"], ""); }
    function getAssetRegisteredAt(asset) { return firstValue(asset, ["registered_at", "created_at", "registration_date", "data_registo"], ""); }
    function getAssetLastMaintenance(asset) { return firstValue(asset, ["last_maintenance", "ultima_manutencao", "ultima_manutenção"], ""); }
    function getAssetMaintenancePeriod(asset) { return firstValue(asset, ["maintenance_period_months", "periodo_manutencao", "maintenance_period"], ""); }
    function getAssetSpecsDetails(asset) { return Array.isArray(asset?.specs_details) ? asset.specs_details : []; }

    function getLocationId(location) { return firstValue(location, ["location_id", "id", "local_id", "id_location"], "-"); }
    function getLocationName(location) { return firstValue(location, ["location_name", "name", "designacao", "sala"], "Sem designação"); }
    function getLocationStatus(location) { return firstValue(location, ["status", "estado", "state"], "Operacional"); }
    function getLocationAssetCount(location) {
        const explicit = firstValue(location, ["asset_count", "assets_count", "quantidade_ativos"], "");
        if (explicit !== "") return Number(explicit) || 0;
        const id = String(getLocationId(location));
        return cacheAtivos.filter((asset) => String(getAssetLocationId(asset)) === id).length;
    }

    function getLogId(log) { return firstValue(log, ["log_id", "id", "audit_log_id"], ""); }
    function getLogRecordId(log) { return firstValue(log, ["record_id", "entity_id", "target_id"], ""); }
    function getLogRecordLabel(log) { return firstValue(log, ["record_label", "entity_label", "target_label"], `${getLogTableLabel(log)} #${getLogRecordId(log)}`); }
    function getLogOriginLabel(log) { return firstValue(log, ["origin_label", "origem_label"], firstValue(log, ["origin", "origem"], "Sistema")); }
    function getLogDate(log) { return firstValue(log, ["created_at", "date", "data"], ""); }
    function getLogUser(log) { return firstValue(log, ["user_email", "email", "user", "utilizador"], "Sistema"); }
    function getLogAction(log) { return firstValue(log, ["action", "acao"], ""); }
    function getLogActionLabel(log) { return firstValue(log, ["action_label", "acao_label"], getLogAction(log) || "Ação"); }
    function getLogTable(log) { return firstValue(log, ["table_name", "table", "tabela"], "assets"); }
    function getLogTableKey(log) { return String(getLogTable(log) || "").trim().toLowerCase(); }
    function getLogTableLabel(log) { return firstValue(log, ["table_label", "area"], getLogTable(log) === "assets" ? "Ativos" : getLogTable(log)); }
    function getLogDetails(log) { return firstValue(log, ["details", "description", "descricao"], `${getLogActionLabel(log)} em ${getLogTableLabel(log)} #${getLogRecordId(log)}`); }
    function canRollbackLog(log) {
        if (!GESTOR_ROLLBACKABLE_LOG_TABLES.has(getLogTableKey(log))) return false;
        if (String(getLogAction(log) || "").toUpperCase() === "INSERT") return false;
        return firstValue(log, ["can_rollback", "rollback_available"], false) === true;
    }
    function getLogRollbackReason(log) {
        if (!GESTOR_ROLLBACKABLE_LOG_TABLES.has(getLogTableKey(log))) return "Gestores só podem reverter registos de ativos das suas salas.";
        if (String(getLogAction(log) || "").toUpperCase() === "INSERT") return "Gestores não podem reverter criação de ativos.";
        return firstValue(log, ["rollback_reason"], "Rollback indisponível.");
    }
    function getLogRollbackLabel(log) { return firstValue(log, ["rollback_label"], "Rollback"); }
    function findLog(logId) { return cacheRegistos.find((log) => String(getLogId(log)) === String(logId)); }


    function getCategoryId(category) { return firstValue(category, ["category_id", "id", "categoria_id", "id_category"], "-"); }
    function getCategoryName(category) { return firstValue(category, ["category_name", "name", "nome", "categoria"], "Sem categoria"); }

    function getFeatureId(feature) { return firstValue(feature, ["feature_id", "id", "id_feature"], ""); }
    function getFeatureRawName(feature) { return firstValue(feature, ["feature_name", "name", "nome"], ""); }
    function getFeatureName(feature) {
        return String(getFeatureRawName(feature) || "Característica")
            .replace(/\[\]$/g, "")
            .replace(/\s*\(m[uú]ltiplo\)\s*$/i, "")
            .trim() || "Característica";
    }
    function getFeatureType(feature) { return firstValue(feature, ["feature_type", "type", "tipo"], "text"); }

    function getFeatureFieldSchema(feature) {
        const schema = firstValue(feature, ["field_schema", "schema", "fields", "campos"], []);
        if (Array.isArray(schema)) return schema;
        if (typeof schema === "string" && schema.trim()) {
            try {
                const parsed = JSON.parse(schema);
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                return [];
            }
        }
        return [];
    }

    function hasFeatureFieldSchema(feature) { return getFeatureFieldSchema(feature).length > 0; }
    function getSchemaFieldKey(field) { return firstValue(field, ["key", "field_key", "id", "name", "nome"], ""); }
    function getSchemaFieldLabel(field) { return firstValue(field, ["label", "field_label", "name", "nome"], getSchemaFieldKey(field) || "Campo"); }
    function getSchemaFieldType(field) { return String(firstValue(field, ["type", "field_type", "tipo"], "text") || "text").toLowerCase(); }
    function getSchemaFieldUnit(field) { return firstValue(field, ["unit", "unidade"], ""); }
    function isSchemaFieldRequired(field) {
        const value = firstValue(field, ["required", "obrigatorio"], false);
        if (typeof value === "boolean") return value;
        return ["true", "1", "sim", "yes", "on"].includes(String(value || "").trim().toLowerCase());
    }
    function getSchemaFieldOptions(field) {
        const options = firstValue(field, ["options", "opcoes", "choices"], []);
        if (Array.isArray(options)) return options.map((option) => String(option || "").trim()).filter(Boolean);
        if (typeof options === "string") return options.split(options.includes("\n") ? "\n" : ",").map((option) => option.trim()).filter(Boolean);
        return [];
    }

    function parseSpecStructuredValue(value) {
        if (value && typeof value === "object" && !Array.isArray(value)) return value;
        if (typeof value === "string" && value.trim()) {
            try {
                const parsed = JSON.parse(value);
                return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
            } catch (error) {
                return {};
            }
        }
        return {};
    }

    function formatStructuredFieldValue(value, field) {
        if (value === undefined || value === null || String(value).trim() === "") return "";
        let display = value === true ? "Sim" : value === false ? "Não" : String(value);
        const unit = getSchemaFieldUnit(field);
        if (unit && display !== "Sim" && display !== "Não") display = `${display} ${unit}`;
        return display;
    }

    function decodeSpecValue(rawValue) {
        if (Array.isArray(rawValue)) return rawValue;
        if (rawValue === undefined || rawValue === null || rawValue === "") return [];

        if (typeof rawValue === "string") {
            const trimmed = rawValue.trim();
            if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) return parsed;
                    if (parsed && typeof parsed === "object") return [parsed];
                } catch (error) {
                    return [rawValue];
                }
            }
        }

        return [rawValue];
    }

    function formatStructuredSpecValue(feature, rawValue) {
        const schema = getFeatureFieldSchema(feature);
        const values = decodeSpecValue(rawValue)
            .map(parseSpecStructuredValue)
            .filter((item) => Object.keys(item).length > 0);
        return values.map((item) => schema.map((field) => {
            const formatted = formatStructuredFieldValue(item[getSchemaFieldKey(field)], field);
            return formatted ? `${getSchemaFieldLabel(field)}: ${formatted}` : "";
        }).filter(Boolean).join("; ")).filter(Boolean);
    }

    function getStructuredSpecValues(feature, rawValue) {
        return decodeSpecValue(rawValue)
            .map(parseSpecStructuredValue)
            .filter((item) => Object.keys(item).length > 0);
    }

    function getFeatureTypeLabel(feature) { return FEATURE_TYPE_LABELS[String(getFeatureType(feature)).toLowerCase()] || getFeatureType(feature) || "Texto"; }
    function isFeatureMultiple(feature) {
        if (!feature) return false;
        const explicitValue = firstValue(feature, ["is_repeatable", "repeatable", "multipla", "multiple", "is_multiple"], null);
        if (explicitValue !== null && explicitValue !== "") {
            if (typeof explicitValue === "boolean") return explicitValue;
            return ["true", "1", "sim", "yes", "on"].includes(String(explicitValue).trim().toLowerCase());
        }
        const rawName = String(getFeatureRawName(feature) || "").trim();
        return rawName.endsWith("[]") || /\(m[uú]ltiplo\)$/i.test(rawName);
    }

    function isFeatureActive(feature) {
        if (!feature) return true;

        const explicitValue = firstValue(feature, ["feature_is_active", "is_active", "active"], null);
        if (explicitValue === null || explicitValue === "") return true;
        if (typeof explicitValue === "boolean") return explicitValue;

        return ["true", "1", "sim", "yes", "on", "ativa", "ativo"].includes(String(explicitValue).trim().toLowerCase());
    }

    function getSpecValue(detail) { return detail?.content !== undefined ? detail.content : detail?.spec_value; }

    function findAsset(assetId) {
        return cacheAtivos.find((asset) => String(getAssetId(asset)) === String(assetId));
    }

    function getSpecsSearchText(asset) {
        return getAssetSpecsDetails(asset).map((detail) => `${getFeatureName(detail)} ${flattenValue(getSpecValue(detail)).join(" ")}`).join(" ");
    }

    function flattenValue(value) {
        if (value === null || value === undefined) return [];
        if (Array.isArray(value)) return value.flatMap(flattenValue);
        if (typeof value === "object") return Object.values(value).flatMap(flattenValue);
        return [String(value)];
    }

    function renderSpecValue(value, feature = null) {
        if (feature && hasFeatureFieldSchema(feature)) {
            const formatted = formatStructuredSpecValue(feature, value);
            if (!formatted.length) return `<span class="text-gray-400">-</span>`;
            return `<ul class="space-y-1">${formatted.map((item) => `<li class="rounded-lg bg-gray-50 px-2 py-1 font-semibold ring-1 ring-gray-100">${escapeHTML(item)}</li>`).join("")}</ul>`;
        }

        if (Array.isArray(value)) {
            if (!value.length) return `<span class="text-gray-400">-</span>`;
            return `<ul class="list-disc pl-5">${value.map((item) => `<li>${escapeHTML(formatSpecPrimitive(item))}</li>`).join("")}</ul>`;
        }
        return escapeHTML(formatSpecPrimitive(value));
    }

    function formatSpecPrimitive(value) {
        if (value === true) return "Sim";
        if (value === false) return "Não";
        if (value === null || value === undefined || value === "") return "N/A";
        return String(value);
    }

    function valueForInput(value) {
        if (value === true) return "true";
        if (value === false) return "false";
        if (value === null || value === undefined) return "";
        return String(value);
    }

    function inputTypeForFeature(type) {
        if (type === "number") return "number";
        if (type === "date") return "date";
        return "text";
    }

    function includesSearch(values, search) {
        const term = normalize(search);
        if (!term) return true;
        const text = normalize(values.filter((value) => value !== null && value !== undefined).join(" "));
        return term.split(/\s+/).every((word) => text.includes(word));
    }

    function normalize(value) {
        return String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    function uniqueValues(values) {
        const map = new Map();
        values.forEach((value) => {
            const text = String(value ?? "").trim();
            if (!text) return;
            map.set(normalize(text), text);
        });
        return Array.from(map.values());
    }

    function compareValues(a, b, type = "text") {
        if (type === "number") return (Number(a) || 0) - (Number(b) || 0);
        if (type === "date") return (new Date(a).getTime() || 0) - (new Date(b).getTime() || 0);
        return String(a ?? "").localeCompare(String(b ?? ""), "pt", { sensitivity: "base", numeric: true });
    }

    function formatDate(value, includeTime = true) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value).slice(0, 10) || "-";
        const options = includeTime
            ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
            : { day: "2-digit", month: "2-digit", year: "numeric" };
        return date.toLocaleString("pt-PT", options);
    }

    function dateInputValue(value) {
        if (!value) return "";
        return String(value).slice(0, 10);
    }

    function todayInputValue() {
        return new Date().toISOString().slice(0, 10);
    }

    function deriveLocationsFromAssets(assets) {
        const map = new Map();
        assets.forEach((asset) => {
            const id = getAssetLocationId(asset) || getAssetLocationName(asset);
            if (!id || map.has(String(id))) return;
            map.set(String(id), {
                location_id: id,
                location_name: getAssetLocationName(asset),
                status: "Operacional",
                asset_count: assets.filter((item) => String(getAssetLocationId(item)) === String(id)).length,
            });
        });
        return Array.from(map.values());
    }

    function deriveCategoriesFromAssets(assets) {
        const map = new Map();
        assets.forEach((asset) => {
            const id = getAssetCategoryId(asset) || getAssetCategoryName(asset);
            if (!id || map.has(String(id))) return;
            map.set(String(id), { category_id: id, category_name: getAssetCategoryName(asset), features: [] });
        });
        return Array.from(map.values());
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function renderSelectEmptyOption(label, { asPlaceholder = false, selected = false } = {}) {
        const selectedAttr = selected ? " selected" : "";

        if (asPlaceholder) {
            return `<option value="" disabled hidden${selectedAttr}>${escapeHTML(label)}</option>`;
        }

        return `<option value=""${selectedAttr}>${escapeHTML(label)}</option>`;
    }

    function shouldRenderAsPlaceholderOnly(label) {
        return /^selecionar\b/i.test(String(label || "").trim());
    }

    window.initGestorDashboard = initGestorDashboard;
    window.showView = showView;
})();