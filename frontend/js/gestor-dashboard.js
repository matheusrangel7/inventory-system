/*Lógica e restrições da página de administrador*/
(function () {
    const views = [
        { id: "inicio", title: "PÁGINA INICIAL" },
        { id: "ativos", title: "ATIVOS" },
        { id: "categorias", title: "CATEGORIAS" },
        { id: "locais", title: "LOCAIS" },
    ];

    const TABLE_PAGE_SIZE = 10;
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
    const CATEGORY_FEATURE_ROW_CLASS = "grid grid-cols-1 gap-3 rounded-xl border border-blue-100 bg-white p-3 md:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.8fr)_auto_auto]";
    const CATEGORY_FEATURE_FIELD_CLASS = "flex flex-col gap-1";
    const CATEGORY_FEATURE_REPEATABLE_CLASS = "flex items-center gap-2 text-xs font-black uppercase tracking-wide text-blue-900";
    const CATEGORY_FEATURE_REMOVE_CLASS = "inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-red-700 transition hover:border-red-600 hover:bg-red-50";

    let currentUser = null;
    let cacheAtivos = [];
    let cacheLocais = [];
    let cacheCategorias = [];
    let cacheFeaturesPorCategoria = {};
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
        document.getElementById("asset-category")?.addEventListener("change", () => atualizarCamposSpecsDoAtivo());
        document.getElementById("asset-state")?.addEventListener("change", preencherManutencaoSeBomEstado);
        document.getElementById("formAtivoGestor")?.addEventListener("submit", handleAssetSubmit);
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
        const [assets, locations, categories] = await Promise.all([
            fetchArray("/assets/"),
            fetchArray("/locations/"),
            fetchArray("/categories/?include_features=true"),
        ]);

        cacheAtivos = assets;
        cacheLocais = locations.length ? locations : deriveLocationsFromAssets(cacheAtivos);
        cacheCategorias = categories.length ? categories : deriveCategoriesFromAssets(cacheAtivos);
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
        updateCategoriesSearchSummary();
        updateLocationsSearchSummary();
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
            { key: "id", label: "ID", required: true, header: headers.id, tdClass: "px-4 py-3", render: (asset) => `#${escapeHTML(getAssetId(asset))}` },
            { key: "asset", label: "Ativo / código", header: headers.asset, tdClass: "px-4 py-3 font-black text-blue-900", render: (asset) => escapeHTML(getAssetSerial(asset) || `INV-${getAssetId(asset)}`) },
            { key: "category", label: "Categoria / tipo", required: true, header: headers.category, tdClass: "px-4 py-3", render: (asset) => `
                <div class="font-bold text-gray-900">${escapeHTML(getAssetCategoryName(asset))}</div>
                <div class="mt-1 text-xs text-gray-500">${getAssetSpecsDetails(asset).length} característica${getAssetSpecsDetails(asset).length === 1 ? "" : "s"}</div>
            ` },
            { key: "location", label: "Sala / local", header: headers.location, tdClass: "px-4 py-3", render: (asset) => escapeHTML(getAssetLocationName(asset)) },
            { key: "status", label: "Estado", header: headers.status, tdClass: "px-4 py-3", render: (asset) => statusBadge(getAssetStatus(asset)) },
            { key: "assignment", label: "Atribuição", header: headers.assignment, tdClass: "px-4 py-3", render: (asset) => escapeHTML(getAssetAssignedTo(asset)) },
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
            render: (asset) => formatSpecValueForTable(getAssetSpecRawValue(asset, feature)),
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
            normalize(item) === normalize(getFeatureName(feature))
        );
        return key ? specs[key] : "";
    }

    function formatSpecValueForTable(value) {
        const values = flattenValue(value).filter((item) => String(item).trim() !== "").map(formatSpecPrimitive);
        if (!values.length) return `<span class="text-xs font-semibold text-gray-400">—</span>`;
        if (values.length === 1) {
            return `<span class="block max-w-44 truncate text-sm font-semibold text-gray-900" title="${escapeHTML(values[0])}">${escapeHTML(values[0])}</span>`;
        }

        const visible = values.slice(0, 3);
        const remaining = values.length - visible.length;
        return `
            <div class="flex max-w-56 flex-wrap gap-1">
                ${visible.map((item) => `<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800" title="${escapeHTML(item)}">${escapeHTML(item)}</span>`).join("")}
                ${remaining > 0 ? `<span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-900">+${remaining}</span>` : ""}
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
        }
        serialHint?.classList.toggle("hidden", !asset);

        renderAssetSpecsFields([]);

        if (asset) {
            setInputValue("asset-serial", getAssetSerial(asset));
            setInputValue("asset-category", getAssetCategoryId(asset));
            setInputValue("asset-location", getAssetLocationId(asset));
            setInputValue("asset-state", getAssetStatus(asset));
            setInputValue("asset-assigned", getAssetAssignedTo(asset) === "-" ? "" : getAssetAssignedTo(asset));
            setInputValue("asset-last-maintenance", dateInputValue(getAssetLastMaintenance(asset)));
            setInputValue("asset-maintenance-period", getAssetMaintenancePeriod(asset));
            atualizarCamposSpecsDoAtivo(asset);
        }

        abrirModalGestor("modalAtivoGestor");
    }

    async function atualizarCamposSpecsDoAtivo(asset = null) {
        const categoryId = getInputValue("asset-category");
        if (!categoryId) {
            renderAssetSpecsFields([]);
            return;
        }
        const features = await getFeaturesForCategory(categoryId);
        renderAssetSpecsFields(features, asset);
    }

    async function getFeaturesForCategory(categoryId) {
        const id = String(categoryId || "");
        if (!id) return [];
        if (cacheFeaturesPorCategoria[id]) return cacheFeaturesPorCategoria[id];

        const features = await fetchArray(`/categories/${id}/features`);
        cacheFeaturesPorCategoria[id] = features;
        return features;
    }

    function renderAssetSpecsFields(features, asset = null) {
        const container = document.getElementById("assetSpecsFields");
        if (!container) return;

        if (!features.length) {
            container.innerHTML = `<p class="md:col-span-2 text-sm text-gray-500">Esta categoria ainda não tem características associadas.</p>`;
            return;
        }

        container.innerHTML = features.map((feature) => renderFeatureInput(feature)).join("");

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

    function renderFeatureInput(feature) {
        const featureId = getFeatureId(feature);
        const name = getFeatureName(feature);
        const type = String(getFeatureType(feature)).toLowerCase();
        const isMultiple = isFeatureMultiple(feature);

        if (isMultiple) {
            return `
                <div class="md:col-span-2 rounded-lg border border-blue-100 bg-white p-3" data-repeatable-feature="${escapeHTML(featureId)}" data-feature-type="${escapeHTML(type)}">
                    <div class="mb-2 flex items-center justify-between gap-3">
                        <label class="block text-xs font-extrabold uppercase text-blue-900">${escapeHTML(name)}</label>
                        <button type="button" data-add-feature-value="${escapeHTML(featureId)}"
                            class="rounded-md border-2 border-blue-900 bg-white px-2 py-1 text-xs font-bold uppercase text-blue-900 hover:bg-gray-100">+ Valor</button>
                    </div>
                    <div class="space-y-2" data-repeatable-values="${escapeHTML(featureId)}">
                        ${renderRepeatableFeatureRow(feature)}
                    </div>
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
            <div>
                <label class="mb-1 block text-xs font-extrabold uppercase text-blue-900">${escapeHTML(name)}</label>
                <input data-feature-id="${escapeHTML(featureId)}" type="${escapeHTML(inputTypeForFeature(type))}"
                    class="asset-spec-input w-full rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20" placeholder="Valor">
            </div>
        `;
    }

    function renderRepeatableFeatureRow(feature, value = "") {
        const type = String(getFeatureType(feature)).toLowerCase();
        const featureId = getFeatureId(feature);

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
            <div class="flex gap-2" data-repeatable-row>
                <input data-feature-id="${escapeHTML(featureId)}" type="${escapeHTML(inputTypeForFeature(type))}" value="${escapeHTML(value)}"
                    class="asset-spec-input flex-1 rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20" placeholder="Valor">
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
    }

    function fillAssetSpecs(asset) {
        const details = getAssetSpecsDetails(asset);
        const byFeatureId = new Map(details.map((detail) => [String(getFeatureId(detail)), detail]));

        document.querySelectorAll(".asset-spec-input").forEach((input) => {
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

            const feature = {
                feature_id: featureId,
                feature_name: getFeatureName(detail),
                feature_type: getFeatureType(detail),
                is_multiple: true,
            };
            const values = Array.isArray(getSpecValue(detail)) ? getSpecValue(detail) : [getSpecValue(detail)];
            values.forEach((value) => addRepeatableFeatureRow(feature, valueForInput(value)));
        });
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

    function collectAssetSpecs() {
        const specs = {};
        const grouped = new Map();

        document.querySelectorAll(".asset-spec-input").forEach((input) => {
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

    function abrirDetalheAtivoGestor(assetId) {
        const asset = findAsset(assetId);
        if (!asset) {
            showToast("Ativo não encontrado.", true);
            return;
        }

        assetBeingViewedId = getAssetId(asset);
        const summary = document.getElementById("assetDetailSummary");
        const specs = document.getElementById("assetDetailSpecs");

        if (summary) {
            summary.innerHTML = [
                detailCard("ID", `#${getAssetId(asset)}`),
                detailCard("Nº Série", getAssetSerial(asset)),
                detailCard("Categoria", getAssetCategoryName(asset)),
                detailCard("Local", getAssetLocationName(asset)),
                detailCard("Estado", getAssetStatus(asset), true),
                detailCard("Atribuído a", getAssetAssignedTo(asset)),
                detailCard("Data de atribuição", formatDate(getAssetAssignedAt(asset))),
                detailCard("Registo", formatDate(getAssetRegisteredAt(asset))),
                detailCard("Última manutenção", formatDate(getAssetLastMaintenance(asset), false)),
                detailCard("Período manutenção", getAssetMaintenancePeriod(asset) ? `${getAssetMaintenancePeriod(asset)} meses` : "-"),
            ].join("");
        }

        if (specs) {
            const details = getAssetSpecsDetails(asset);
            if (!details.length) {
                specs.innerHTML = `<p class="md:col-span-2 text-sm text-gray-500">Este ativo ainda não tem características registadas.</p>`;
            } else {
                specs.innerHTML = details.map((detail) => {
                    const value = getSpecValue(detail);
                    return `
                        <div class="rounded-lg bg-white p-3 shadow-sm border border-gray-100">
                            <p class="text-xs font-extrabold uppercase text-blue-900">${escapeHTML(getFeatureName(detail))}</p>
                            <div class="mt-1 text-sm text-gray-900">${renderSpecValue(value)}</div>
                        </div>
                    `;
                }).join("");
            }
        }

        abrirModalGestor("modalDetalheAtivo");
    }

    function detailCard(label, value, badge = false) {
        return `
            <div class="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p class="text-xs font-extrabold uppercase text-blue-900">${escapeHTML(label)}</p>
                <div class="mt-1 text-sm font-bold text-gray-900">${badge ? statusBadge(value) : escapeHTML(value || "-")}</div>
            </div>
        `;
    }

    function abrirModalGestor(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        modal.setAttribute("aria-hidden", "false");
    }

    function fecharModalGestor(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add("hidden");
        modal.classList.remove("flex");
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

    function getAssetId(asset) { return firstValue(asset, ["asset_id", "id", "id_asset"], "-"); }
    function getAssetSerial(asset) { return firstValue(asset, ["serial_number", "serial", "numero_serie", "n_serie"], ""); }
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

    function getCategoryId(category) { return firstValue(category, ["category_id", "id", "categoria_id", "id_category"], "-"); }
    function getCategoryName(category) { return firstValue(category, ["category_name", "name", "nome", "categoria"], "Sem categoria"); }

    function getFeatureId(feature) { return firstValue(feature, ["feature_id", "id", "id_feature"], ""); }
    function getFeatureName(feature) {
        return String(firstValue(feature, ["feature_name", "name", "nome"], "Característica"))
            .replace(/\[\]$/g, "")
            .replace(/\s*\(m[uú]ltiplo\)\s*$/i, "")
            .trim() || "Característica";
    }
    function getFeatureType(feature) { return firstValue(feature, ["feature_type", "type", "tipo"], "text"); }
    function getFeatureTypeLabel(feature) { return FEATURE_TYPE_LABELS[String(getFeatureType(feature)).toLowerCase()] || getFeatureType(feature) || "Texto"; }
    function isFeatureMultiple(feature) { return Boolean(feature?.is_multiple || feature?.is_repeatable || feature?.multiple); }

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

    function renderSpecValue(value) {
        if (Array.isArray(value)) {
            if (!value.length) return `<span class="text-gray-400">-</span>`;
            return `<ul class="list-disc pl-5">${value.map((item) => `<li>${escapeHTML(formatSpecPrimitive(item))}</li>`).join("")}</ul>`;
        }
        return escapeHTML(formatSpecPrimitive(value));
    }

    function formatSpecPrimitive(value) {
        if (value === true) return "Sim";
        if (value === false) return "Não";
        if (value === null || value === undefined || value === "") return "-";
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