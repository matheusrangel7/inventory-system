/*Lógica e restrições da página de administrador*/
let meuGraficoRegistos = null;
let meuGraficoAtividade = null;

let cacheUtilizadores = [];
let cacheAtivos = [];
let cacheLocais = [];
let cacheCategorias = [];
let cacheRegistos = [];
let cacheFeaturesPorCategoria = {};
let ativosSearchRequestId = 0;
let assetSearchDebounceTimer = null;
let activeView = "dashboard";
let carregamentoEmCurso = null;
let paginaInicializada = false;
let dashboardUtilityObserverStarted = false;
const TABLE_PAGE_SIZE = 10;
const ASSET_SEARCH_DEBOUNCE_MS = 250;
const LOG_CHART_DEFAULT_PERIOD = "year";
const LOG_CHART_PERIOD_LABELS = {
    all: "Todo o tempo",
    year: "Último ano",
    month: "Últimos 30 dias"
};
const ASSET_COLUMN_STORAGE_KEY = "invubi.assets.visibleColumns.admin.v6";
const ASSET_REQUIRED_COLUMN_KEYS = new Set(["id", "category"]);
const ASSET_DEFAULT_COLUMN_KEYS = ["id", "asset", "category", "location", "status"];
let assetVisibleColumnKeys = new Set(ASSET_DEFAULT_COLUMN_KEYS);
let assetColumnSelectionTouched = false;
let lastAssetColumnCategoryId = null;
const tablePaginationState = {
    dashboardUsers: 1,
    users: 1,
    locations: 1,
    assets: 1,
    categories: 1,
    logs: 1
};


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
const ASSET_SPEC_FILTER_EMPTY_CLASS = "rounded-xl border border-dashed border-blue-100 bg-blue-50/40 px-3 py-3 text-sm font-semibold text-gray-500";
const ASSET_SPEC_FILTER_ROW_CLASS = "grid grid-cols-1 items-end gap-2 rounded-xl border border-blue-100 bg-slate-50/80 p-3 md:grid-cols-[minmax(11rem,1fr)_minmax(8rem,0.65fr)_minmax(11rem,1fr)_auto]";
const ASSET_SPEC_FILTER_REMOVE_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white text-lg font-black leading-none text-red-700 transition hover:border-red-600 hover:bg-red-50";
const ASSET_COLUMN_OPTION_BASE_CLASS = "flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-blue-200 hover:bg-blue-50/60";
const ASSET_COLUMN_OPTION_ACTIVE_CLASS = "border-blue-300 bg-blue-50 text-blue-900 ring-1 ring-blue-100";
const ASSET_COLUMN_OPTION_REQUIRED_CLASS = "cursor-not-allowed opacity-80";
const ASSET_COLUMN_OPTION_FEATURE_CLASS = "bg-slate-50";
const CATEGORY_FEATURE_ROW_CLASS = "grid grid-cols-1 items-end gap-3 rounded-xl border border-blue-100 bg-white p-3 md:grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.7fr)] lg:grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.55fr)_minmax(7.5rem,auto)_auto]";
const CATEGORY_FEATURE_FIELD_CLASS = "min-w-0 flex flex-col gap-1";
const CATEGORY_FEATURE_REPEATABLE_CLASS = "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-blue-900";
const CATEGORY_FEATURE_REMOVE_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-white text-lg font-black leading-none text-red-700 transition hover:border-red-600 hover:bg-red-50";

const FEATURE_TYPE_LABELS = {
    text: "Texto",
    number: "Número",
    boolean: "Sim/Não",
    date: "Data"
};
const REPEATABLE_FEATURE_SUFFIX = "[]";

const filterGroups = {
    dashboardUsers: ["dash-users-search", "dash-users-role", "dash-users-status", "dash-users-sort"],
    users: ["users-search", "users-role", "users-status", "users-sort"],
    locations: ["locations-search", "locations-sort"],
    assets: ["assets-search", "assets-category", "assets-location", "assets-status", "assets-assignment", "assets-sort"],
    categories: ["categories-search", "categories-sort"],
    logs: ["logs-search", "logs-user", "logs-action", "logs-table", "logs-sort"]
};

const cleanSearchConfigs = {
    dashboardUsers: {
        summaryId: "dashboardUsersActiveFiltersSummary",
        drawerId: "dashboardUsersFiltersDrawer",
        toggleSelector: '[data-filter-drawer-toggle="dashboardUsers"]',
        defaults: { "dash-users-sort": "id-desc" },
        filters: [
            { id: "dash-users-search", label: "Pesquisa", primary: true },
            { id: "dash-users-role", label: "Cargo" },
            { id: "dash-users-status", label: "Registo" },
            { id: "dash-users-sort", label: "Ordem", defaultValue: "id-desc" }
        ]
    },
    users: {
        summaryId: "usersActiveFiltersSummary",
        drawerId: "usersFiltersDrawer",
        toggleSelector: '[data-filter-drawer-toggle="users"]',
        defaults: { "users-sort": "email-asc" },
        filters: [
            { id: "users-search", label: "Pesquisa", primary: true },
            { id: "users-role", label: "Cargo" },
            { id: "users-status", label: "Registo" },
            { id: "users-sort", label: "Ordem", defaultValue: "email-asc" }
        ]
    },
    locations: {
        summaryId: "locationsActiveFiltersSummary",
        drawerId: "locationsFiltersDrawer",
        toggleSelector: '[data-filter-drawer-toggle="locations"]',
        defaults: { "locations-sort": "name-asc" },
        filters: [
            { id: "locations-search", label: "Pesquisa", primary: true },
            { id: "locations-sort", label: "Ordem", defaultValue: "name-asc" }
        ]
    },
    categories: {
        summaryId: "categoriesActiveFiltersSummary",
        drawerId: "categoriesFiltersDrawer",
        toggleSelector: '[data-filter-drawer-toggle="categories"]',
        defaults: { "categories-sort": "name-asc" },
        filters: [
            { id: "categories-search", label: "Pesquisa", primary: true },
            { id: "categories-sort", label: "Ordem", defaultValue: "name-asc" }
        ]
    },
    logs: {
        summaryId: "logsActiveFiltersSummary",
        drawerId: "logsFiltersDrawer",
        toggleSelector: '[data-filter-drawer-toggle="logs"]',
        defaults: { "logs-sort": "date-desc" },
        filters: [
            { id: "logs-search", label: "Pesquisa", primary: true },
            { id: "logs-user", label: "Utilizador" },
            { id: "logs-action", label: "Ação" },
            { id: "logs-table", label: "Área" },
            { id: "logs-sort", label: "Ordem", defaultValue: "date-desc" }
        ]
    }
};

function showView(viewName) {
    console.log("[Navegacao] Mudar para view: " + viewName);
    activeView = viewName;

    const views = ["dashboard", "utilizadores", "locais", "ativos", "categorias", "registos"];

    views.forEach(v => {
        const div = document.getElementById(`view-${v}`);
        const btn = document.getElementById(`btn-${v}`);

        if (!div || !btn) return;

        if (v === viewName) {
            div.classList.remove("hidden");
            btn.className = "w-full flex items-center gap-3 px-4 py-3 mb-2 rounded bg-white text-blue-900";
            document.getElementById("pageTitle").innerText = v.toUpperCase();
        } else {
            div.classList.add("hidden");
            btn.className = "w-full flex items-center gap-3 px-4 py-3 mb-2 rounded text-white hover:bg-blue-800";
        }
    });

    recarregarDados();
}

async function recarregarDados() {
    if (carregamentoEmCurso) return carregamentoEmCurso;

    carregamentoEmCurso = carregarDados()
        .catch(err => console.error("[Erro API] Nao foi possivel atualizar a aba:", err))
        .finally(() => {
            carregamentoEmCurso = null;
        });

    return carregamentoEmCurso;
}

async function carregarDados() {
    try {
        const [users, assets, locations, categories, logs] = await Promise.all([
            fetchArray("/users/"),
            fetchArray("/assets/"),
            fetchArray("/locations/"),
            fetchArray("/categories/?include_features=true"),
            fetchArray("/logs/")
        ]);

        cacheUtilizadores = users;
        cacheAtivos = assets;
        cacheLocais = locations.length ? locations : derivarLocaisDosAtivos(cacheAtivos);
        cacheCategorias = categories.length ? categories : derivarCategoriasDosAtivos(cacheAtivos);
        cacheFeaturesPorCategoria = {};
        cacheCategorias.forEach(category => {
            if (Array.isArray(category.features)) {
                cacheFeaturesPorCategoria[String(getCategoryId(category))] = category.features;
            }
        });
        cacheRegistos = logs;

        document.getElementById("count-users").innerText = cacheUtilizadores.length;
        document.getElementById("count-assets").innerText = cacheAtivos.length;
        document.getElementById("count-locations").innerText = cacheLocais.length;

        popularOpcoesDosFiltros();
        atualizarSelectsDosModais();
        popularTabelas();
        inicializarGraficos();
    } catch (err) {
        console.error("[Erro API] Nao foi possivel processar os dados:", err);
    }
}

async function fetchJSON(endpoint) {
    const result = await api.get(endpoint);

    if (!result.success) {
        throw new Error(result.error || result.message || `Endpoint indisponível: ${endpoint}`);
    }

    return {
        success: result.success,
        data: result.data,
        message: result.message,
        error: result.error,
        status: result.status
    };
}

async function fetchArray(endpoint) {
    try {
        const json = await fetchJSON(endpoint);

        if (Array.isArray(json)) return json;
        if (Array.isArray(json.data)) return json.data;
        if (Array.isArray(json.items)) return json.items;
        if (Array.isArray(json.results)) return json.results;

        return [];
    } catch (error) {
        console.warn(`[API] Nao foi possivel carregar ${endpoint}:`, error);
        return [];
    }
}

function popularTabelas() {
    renderDashboardUsersTable();
    renderUsersTable();
    renderLocationsTable();
    renderAssetsTable();
    renderCategoriesTable();
    renderLogsTable();
    atualizarInterfacesPesquisaConsultas();
}


function addUtilityClasses(element, className) {
    if (!element || !className) return;
    element.classList.add(...className.split(/\s+/).filter(Boolean));
}

function normalizarModaisDashboard() {
    document.querySelectorAll('[data-dashboard-modal], .dashboard-modal, #modalUtilizador, #modalLocal, #modalAtivo, #modalAtivoGestor, #modalDetalheAtivo, #modalDetalheRegisto, #modalCategoria').forEach(modal => {
        addUtilityClasses(modal, "fixed inset-0 z-[1000] items-center justify-center overflow-y-auto bg-black/40 p-4");

        const card = modal.querySelector(":scope > div");
        if (card) {
            addUtilityClasses(card, "flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl");
        }

        modal.querySelectorAll("form").forEach(form => {
            addUtilityClasses(form, "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1");
        });

        modal.querySelectorAll("input, select, textarea").forEach(field => {
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

function popularOpcoesDosFiltros() {
    popularSelect("dash-users-role", valoresUnicos(cacheUtilizadores.map(getUserRole)), "Todos");
    popularSelect("dash-users-status", valoresUnicos(cacheUtilizadores.map(getUserStatus)), "Todos");

    popularSelect("users-role", valoresUnicos(cacheUtilizadores.map(getUserRole)), "Todos");
    popularSelect("users-status", valoresUnicos(cacheUtilizadores.map(getUserStatus)), "Todos");


    popularSelectFromRecords("assets-category", cacheCategorias, getCategoryId, getCategoryName, "Todas");
    popularSelectFromRecords("assets-location", cacheLocais, getLocationId, getLocationName, "Todas");
    popularSelect("assets-status", valoresUnicos(cacheAtivos.map(getAssetStatus)), "Todos");
    popularOpcoesFeaturesSpecsAtivos();
    atualizarPainelFeaturesCategoriaAtivos();
    renderAssetsTableHead();

    popularSelect("logs-user", valoresUnicos(cacheRegistos.map(getLogUser)), "Todos");
    popularSelect("logs-action", valoresUnicos(cacheRegistos.map(getLogActionLabel)), "Todas");
    popularSelect("logs-table", valoresUnicos(cacheRegistos.map(getLogTableLabel)), "Todas");
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

function getTodasFeaturesAtivas() {
    const featuresMap = new Map();

    cacheCategorias.forEach(category => {
        const categoryName = getCategoryName(category);
        getCategoryFeatures(category).forEach(feature => {
            const featureId = getFeatureId(feature);
            if (!featureId) return;

            featuresMap.set(String(featureId), {
                feature_id: featureId,
                feature_name: getFeatureName(feature),
                feature_type: getFeatureType(feature),
                is_repeatable: Boolean(feature.is_repeatable || feature.repeatable || feature.multipla),
                category_name: categoryName
            });
        });
    });

    return Array.from(featuresMap.values()).sort((a, b) => {
        const labelA = `${a.category_name} ${a.feature_name}`;
        const labelB = `${b.category_name} ${b.feature_name}`;
        return labelA.localeCompare(labelB, "pt", { sensitivity: "base", numeric: true });
    });
}

function getSelectedAssetCategoryFilterId() {
    return getInputValue("assets-category");
}

function getSelectedAssetCategoryFilter() {
    const categoryId = getSelectedAssetCategoryFilterId();
    if (!categoryId) return null;
    return cacheCategorias.find(category => String(getCategoryId(category)) === String(categoryId)) || null;
}

function getFeaturesDisponiveisParaFiltrosAtivos() {
    const selectedCategoryId = getSelectedAssetCategoryFilterId();
    if (selectedCategoryId) {
        return getCategoryFeatures(selectedCategoryId)
            .filter(isFeatureActive)
            .map(feature => ({
                feature_id: getFeatureId(feature),
                feature_name: getFeatureName(feature),
                feature_type: getFeatureType(feature),
                is_repeatable: isFeatureRepeatable(feature),
                is_multiple: isFeatureRepeatable(feature),
                category_id: selectedCategoryId,
                category_name: getCategoryName(getSelectedAssetCategoryFilter() || {})
            }));
    }

    return getTodasFeaturesAtivas().filter(isFeatureActive);
}

function getFeaturesTabelaAtivos() {
    const selectedCategoryId = getSelectedAssetCategoryFilterId();
    if (!selectedCategoryId) return [];

    return getCategoryFeatures(selectedCategoryId)
        .filter(isFeatureActive)
        .sort((a, b) => getFeatureName(a).localeCompare(getFeatureName(b), "pt", { sensitivity: "base", numeric: true }));
}

function getAssetsTableColspan() {
    return getVisibleAssetColumnDefinitions().length + 1;
}

function renderFeatureTypePill(feature) {
    return `
        <span class="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-900 ring-1 ring-blue-100">
            ${escapeHTML(getFeatureName(feature))}
        </span>
    `;
}

function atualizarPainelFeaturesCategoriaAtivos() {
    const panel = document.getElementById("assetsCategoryFeaturesPanel");
    const helper = document.getElementById("assetSpecFilterHelper");
    const addButton = document.getElementById("btnAdicionarFiltroSpecAtivo");
    const selectedCategory = getSelectedAssetCategoryFilter();
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
            ${visibleFeatures.map(feature => `
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
        document.querySelectorAll("[data-asset-spec-filter-row]").forEach(row => row.remove());
        garantirMensagemFiltrosSpecsAtivos();
        return;
    }

    const allowedFeatureIds = new Set(getFeaturesTabelaAtivos().map(feature => String(getFeatureId(feature))));
    document.querySelectorAll("[data-asset-spec-filter-row]").forEach(row => {
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
            await carregarFeaturesCategoria(categoryId);
        } catch (error) {
            console.warn("[Dashboard] Não foi possível carregar features da categoria selecionada.", error);
        }
    }

    removerFiltrosSpecsIncompativeisComCategoria();
    popularOpcoesFeaturesSpecsAtivos();
    atualizarPainelFeaturesCategoriaAtivos();
    atualizarInterfacePesquisaAtivos();
    renderAssetsTableHead();
}

function popularOpcoesFeaturesSpecsAtivos() {
    const selects = document.querySelectorAll("[data-asset-spec-filter-feature]");
    if (!selects.length) return;

    const selectedCategoryId = getInputValue("assets-category");
    const features = getFeaturesDisponiveisParaFiltrosAtivos();

    selects.forEach(select => {
        const valorAtual = select.value;
        const placeholder = selectedCategoryId
            ? "Selecionar característica da categoria"
            : "Selecionar característica";

        select.innerHTML = renderSelectEmptyOption(placeholder, { asPlaceholder: true, selected: !valorAtual }) + features.map(feature => {
            const label = selectedCategoryId
                ? feature.feature_name
                : `${feature.category_name} · ${feature.feature_name}`;
            return `<option value="${escapeHTML(feature.feature_id)}">${escapeHTML(label)}</option>`;
        }).join("");

        if (features.some(feature => String(feature.feature_id) === String(valorAtual))) {
            select.value = valorAtual;
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

    const selectedCategory = getSelectedAssetCategoryFilter();
    const availableFeatures = getFeaturesTabelaAtivos();

    if (!selectedCategory) {
        setAssetsFilterDrawerOpen(true);
        atualizarPainelFeaturesCategoriaAtivos();
        mostrarToast("Seleciona primeiro uma categoria para filtrar por características.", true);
        return;
    }

    if (!availableFeatures.length) {
        setAssetsFilterDrawerOpen(true);
        atualizarPainelFeaturesCategoriaAtivos();
        mostrarToast("Esta categoria ainda não tem características para filtrar.", true);
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

    row.querySelectorAll("select, input").forEach(input => {
        const eventName = input.tagName === "SELECT" ? "change" : "input";
        input.addEventListener(eventName, () => {
            if (input.matches("[data-asset-spec-filter-operator]")) {
                atualizarVisibilidadeValorFiltroSpec(row);  
            }
            resetarPaginaTabela("assets");
            agendarRenderAssetsTable();
        });
    });

    atualizarVisibilidadeValorFiltroSpec(row);

    const removeButton = row.querySelector("[data-asset-spec-filter-remove]");
    if (removeButton) {
        removeButton.addEventListener("click", () => {
            row.remove();
            garantirMensagemFiltrosSpecsAtivos();
            atualizarInterfacePesquisaAtivos();
            resetarPaginaTabela("assets");
            agendarRenderAssetsTable();
        });
    }
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
    return Array.from(document.querySelectorAll("[data-asset-spec-filter-row]")).map(row => {
        const featureSelect = row.querySelector("[data-asset-spec-filter-feature]");
        const operatorSelect = row.querySelector("[data-asset-spec-filter-operator]");
        const valueInput = row.querySelector("[data-asset-spec-filter-value]");
        const featureId = featureSelect?.value || "";
        const selectedOption = featureSelect?.selectedOptions?.[0];
        const featureName = selectedOption ? selectedOption.textContent.split("·").pop().replace(/\([^)]*\)/g, "").trim() : "";

        return {
            feature_id: featureId,
            feature_name: featureName,
            operator: operatorSelect?.value || "contains",
            value: valueInput?.value?.trim() || ""
        };
    }).filter(filter => filter.feature_id || filter.feature_name);
}

function construirEndpointPesquisaAtivos() {
    const params = new URLSearchParams();
    const search = getInputValue("assets-search").trim();
    const category = getInputValue("assets-category");
    const location = getInputValue("assets-location");
    const status = getInputValue("assets-status");
    const assigned = getInputValue("assets-assignment");
    const sort = getInputValue("assets-sort") || "date-desc";
    const specFilters = recolherFiltrosSpecsAtivos();

    params.set("page", String(tablePaginationState.assets || 1));
    params.set("page_size", String(TABLE_PAGE_SIZE));
    params.set("sort", sort);

    if (search) params.set("search", search);
    if (category) params.set(Number.isNaN(Number(category)) ? "category_name" : "category_id", category);
    if (location) params.set(Number.isNaN(Number(location)) ? "location_name" : "location_id", location);
    if (status) params.set("asset_state", status);
    if (assigned) params.set("assigned", assigned);
    if (specFilters.length) params.set("spec_filters", JSON.stringify(specFilters));

    return `/assets/?${params.toString()}`;
}

function paginationFromApi(apiPagination, itemsLength) {
    const total = Number(apiPagination?.total ?? itemsLength ?? 0);
    const currentPage = Number(apiPagination?.page ?? tablePaginationState.assets ?? 1);
    const totalPages = Math.max(1, Number(apiPagination?.total_pages ?? Math.ceil(total / TABLE_PAGE_SIZE) ?? 1));
    const startIndex = Number(apiPagination?.start_index ?? (total ? ((currentPage - 1) * TABLE_PAGE_SIZE) + 1 : 0));
    const endIndex = Number(apiPagination?.end_index ?? Math.min(currentPage * TABLE_PAGE_SIZE, total));

    tablePaginationState.assets = currentPage;

    return {
        items: [],
        total,
        totalPages,
        currentPage,
        startIndex,
        endIndex
    };
}

function agendarRenderAssetsTable() {
    window.clearTimeout(assetSearchDebounceTimer);
    assetSearchDebounceTimer = window.setTimeout(() => {
        renderAssetsTable();
    }, ASSET_SEARCH_DEBOUNCE_MS);
}

function getSelectedFilterLabel(selectId) {
    const select = document.getElementById(selectId);
    if (!select || !select.value) return "";
    return select.selectedOptions?.[0]?.textContent?.trim() || "";
}

function existemFiltrosSpecsAtivos() {
    return Boolean(document.querySelector("[data-asset-spec-filter-row]"));
}

function getAssetsSecondaryFilterCount() {
    let count = 0;
    if (getInputValue("assets-location")) count += 1;
    if (getInputValue("assets-status")) count += 1;
    if (getInputValue("assets-assignment")) count += 1;
    if ((getInputValue("assets-sort") || "date-desc") !== "date-desc") count += 1;
    count += document.querySelectorAll("[data-asset-spec-filter-row]").length;
    return count;
}

function existemFiltrosSecundariosAtivos() {
    return getAssetsSecondaryFilterCount() > 0;
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

function atualizarVisibilidadeFiltrosSpecsAtivos() {
    const section = document.querySelector(".asset-advanced-filters");
    if (!section) return;
    section.classList.toggle("hidden", !existemFiltrosSpecsAtivos());
}

function setAssetFilterValue(id, value = "") {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT" && value === "") {
        el.selectedIndex = 0;
        return;
    }
    el.value = value;
}

function limparFiltroAtivoPorChave(key) {
    if (key === "search") setAssetFilterValue("assets-search");
    if (key === "category") setAssetFilterValue("assets-category");
    if (key === "location") setAssetFilterValue("assets-location");
    if (key === "status") setAssetFilterValue("assets-status");
    if (key === "assignment") setAssetFilterValue("assets-assignment");
    if (key === "sort") setAssetFilterValue("assets-sort", "date-desc");
    if (key === "specs") {
        const specFilters = document.getElementById("assetSpecFiltersRows");
        if (specFilters) specFilters.innerHTML = `<p class="asset-spec-filter-empty ${ASSET_SPEC_FILTER_EMPTY_CLASS}">Sem filtros avançados ativos.</p>`;
        garantirMensagemFiltrosSpecsAtivos();
    }

    resetarPaginaTabela("assets");
    if (key === "category") {
        atualizarFeaturesCategoriaPesquisaAtivos().finally(() => renderAssetsTable());
        return;
    }
    agendarRenderAssetsTable();
}

function atualizarResumoPesquisaAtivos() {
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
    const specFilterCount = document.querySelectorAll("[data-asset-spec-filter-row]").length;

    if (search) items.push({ key: "search", label: "Pesquisa", value: search });
    if (categoryLabel) items.push({ key: "category", label: "Categoria", value: categoryLabel });
    if (locationLabel) items.push({ key: "location", label: "Local", value: locationLabel });
    if (statusLabel) items.push({ key: "status", label: "Estado", value: statusLabel });
    if (assignmentLabel) items.push({ key: "assignment", label: "Atribuição", value: assignmentLabel });
    if (sortValue !== "date-desc" && sortLabel) items.push({ key: "sort", label: "Ordem", value: sortLabel });
    if (specFilterCount) items.push({ key: "specs", label: "Características", value: `${specFilterCount}` });

    summary.innerHTML = items.map(item => `
        <span class="${ASSET_ACTIVE_CHIP_CLASS}">
            <strong>${escapeHTML(item.label)}:</strong> ${escapeHTML(item.value)}
            <button type="button" class="${CHIP_REMOVE_BUTTON_CLASS}" data-clear-asset-filter="${escapeHTML(item.key)}" aria-label="Remover filtro ${escapeHTML(item.label)}">×</button>
        </span>
    `).join("");

    summary.querySelectorAll("[data-clear-asset-filter]").forEach(button => {
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            limparFiltroAtivoPorChave(button.dataset.clearAssetFilter || "");
        });
    });

    if (existemFiltrosSecundariosAtivos()) {
        setAssetsFilterDrawerOpen(true);
    } else {
        setAssetsFilterDrawerOpen(document.querySelector("[data-assets-filters-toggle]")?.getAttribute("aria-expanded") === "true");
    }
}

function atualizarInterfacePesquisaAtivos() {
    atualizarVisibilidadeFiltrosSpecsAtivos();
    atualizarResumoPesquisaAtivos();
}

function getCleanFilterValue(filter) {
    const element = document.getElementById(filter.id);
    if (!element) return "";
    const value = String(element.value || "").trim();
    if (!value) return "";
    if (filter.defaultValue !== undefined && value === String(filter.defaultValue)) return "";
    if (element.tagName === "SELECT") {
        return element.selectedOptions?.[0]?.textContent?.trim() || value;
    }
    return value;
}

function getCleanSearchActiveItems(grupo, includePrimary = true) {
    const config = cleanSearchConfigs[grupo];
    if (!config) return [];

    return config.filters
        .filter(filter => includePrimary || !filter.primary)
        .map(filter => ({
            id: filter.id,
            label: filter.label,
            value: getCleanFilterValue(filter)
        }))
        .filter(item => item.value);
}

function getCleanSecondaryFilterCount(grupo) {
    return getCleanSearchActiveItems(grupo, false).length;
}

function setCleanFilterDrawerOpen(grupo, isOpen) {
    const config = cleanSearchConfigs[grupo];
    if (!config) return;

    const drawer = document.getElementById(config.drawerId);
    const toggle = document.querySelector(config.toggleSelector);
    const count = getCleanSecondaryFilterCount(grupo);

    if (drawer) drawer.classList.toggle("hidden", !isOpen);
    if (toggle) {
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.textContent = count ? `Filtros (${count})` : "Filtros";
    }
}

function resetCleanFilterValue(filter) {
    const element = document.getElementById(filter.id);
    if (!element) return;

    const value = filter.defaultValue !== undefined ? String(filter.defaultValue) : "";
    if (element.tagName === "SELECT") {
        element.value = value;
        if (element.value !== value) element.selectedIndex = 0;
    } else {
        element.value = value;
    }
}

function limparFiltroConsulta(grupo, filterId) {
    const config = cleanSearchConfigs[grupo];
    if (!config) return;

    const filter = config.filters.find(item => item.id === filterId);
    if (!filter) return;

    resetCleanFilterValue(filter);
    resetarPaginaTabela(grupo);
    renderPorGrupo(grupo);
}

function atualizarInterfacePesquisaConsulta(grupo) {
    const config = cleanSearchConfigs[grupo];
    if (!config) return;

    const summary = document.getElementById(config.summaryId);
    const items = getCleanSearchActiveItems(grupo, true);

    if (summary) {
        summary.innerHTML = items.map(item => `
            <span class="${ASSET_ACTIVE_CHIP_CLASS}">
                <strong>${escapeHTML(item.label)}:</strong> ${escapeHTML(item.value)}
                <button type="button" class="${CHIP_REMOVE_BUTTON_CLASS}" data-clear-clean-filter-group="${escapeHTML(grupo)}" data-clear-clean-filter-id="${escapeHTML(item.id)}" aria-label="Remover filtro ${escapeHTML(item.label)}">×</button>
            </span>
        `).join("");

        summary.querySelectorAll("[data-clear-clean-filter-id]").forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                limparFiltroConsulta(button.dataset.clearCleanFilterGroup || grupo, button.dataset.clearCleanFilterId || "");
            });
        });
    }

    const shouldKeepOpen = document.querySelector(config.toggleSelector)?.getAttribute("aria-expanded") === "true";
    setCleanFilterDrawerOpen(grupo, shouldKeepOpen || getCleanSecondaryFilterCount(grupo) > 0);
}

function atualizarInterfacesPesquisaConsultas() {
    Object.keys(cleanSearchConfigs).forEach(atualizarInterfacePesquisaConsulta);
}

function ligarDrawersFiltrosConsultas() {
    Object.entries(cleanSearchConfigs).forEach(([grupo, config]) => {
        const toggle = document.querySelector(config.toggleSelector);
        if (!toggle || toggle.dataset.listenerAttached === "true") return;

        toggle.addEventListener("click", event => {
            event.preventDefault();
            const isOpen = toggle.getAttribute("aria-expanded") === "true";
            setCleanFilterDrawerOpen(grupo, !isOpen);
        });

        toggle.dataset.listenerAttached = "true";
    });
}

function ligarDrawerFiltrosAtivos() {
    const toggle = document.querySelector("[data-assets-filters-toggle]");
    if (!toggle || toggle.dataset.listenerAttached === "true") return;

    toggle.addEventListener("click", event => {
        event.preventDefault();
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        setAssetsFilterDrawerOpen(!isOpen);
    });

    toggle.dataset.listenerAttached = "true";
}

function carregarPreferenciasColunasAtivos() {
    try {
        const saved = JSON.parse(window.localStorage.getItem(ASSET_COLUMN_STORAGE_KEY) || "null");
        if (Array.isArray(saved) && saved.length) {
            assetVisibleColumnKeys = new Set(saved.map(String));
            assetColumnSelectionTouched = true;
        }
    } catch (error) {
        console.warn("[Dashboard] Não foi possível ler as preferências de colunas.", error);
    }

    garantirColunasObrigatoriasAtivos();
}

function guardarPreferenciasColunasAtivos() {
    try {
        garantirColunasObrigatoriasAtivos();
        window.localStorage.setItem(ASSET_COLUMN_STORAGE_KEY, JSON.stringify(Array.from(assetVisibleColumnKeys)));
    } catch (error) {
        console.warn("[Dashboard] Não foi possível guardar as preferências de colunas.", error);
    }
}

function garantirColunasObrigatoriasAtivos() {
    ASSET_REQUIRED_COLUMN_KEYS.forEach(key => assetVisibleColumnKeys.add(key));
}

function getAssetFeatureColumnKey(feature) {
    return `feature:${getFeatureId(feature)}`;
}

function sincronizarColunasDinamicasAtivos() {
    const currentCategoryId = getSelectedAssetCategoryFilterId() || "";

    if (lastAssetColumnCategoryId !== currentCategoryId) {
        lastAssetColumnCategoryId = currentCategoryId;
        assetColumnSelectionTouched = false;
    }

    if (!assetColumnSelectionTouched) {
        assetVisibleColumnKeys = new Set(ASSET_DEFAULT_COLUMN_KEYS);
        getFeaturesTabelaAtivos().forEach(feature => {
            const key = getAssetFeatureColumnKey(feature);
            if (key !== "feature:") assetVisibleColumnKeys.add(key);
        });
    }

    garantirColunasObrigatoriasAtivos();
}

function getAssetsTableBaseColumnDefinitions() {
    const selectedCategory = getSelectedAssetCategoryFilter();
    const categoryName = selectedCategory ? getCategoryName(selectedCategory) : "";

    const headers = selectedCategory
        ? {
            id: { label: "ID", sublabel: categoryName },
            asset: { label: `${categoryName} · ATIVO`, sublabel: "Código / nº série" },
            category: { label: "TIPO DE ATIVO", sublabel: categoryName },
            location: { label: "LOCAL", sublabel: `Sala do ${categoryName}` },
            status: { label: "ESTADO", sublabel: `Estado do ${categoryName}` },
            assignment: { label: "ATRIBUIÇÃO", sublabel: `Responsável pelo ${categoryName}` },
            registration: { label: "REGISTO", sublabel: `Data do ${categoryName}` }
        }
        : {
            id: { label: "ID", sublabel: "Identificador" },
            asset: { label: "ATIVO", sublabel: "Código / nº série" },
            category: { label: "TIPO", sublabel: "Categoria" },
            location: { label: "LOCAL", sublabel: "Sala" },
            status: { label: "ESTADO", sublabel: "Condição" },
            assignment: { label: "ATRIBUIÇÃO", sublabel: "Responsável" },
            registration: { label: "REGISTO", sublabel: "Data" }
        };

    return [
        { key: "id", label: "ID", required: true, header: headers.id, tdClass: "px-4 py-3", render: renderAssetIdCell },
        { key: "asset", label: "Ativo / código", header: headers.asset, tdClass: "px-4 py-3", render: renderAssetIdentityCell },
        { key: "category", label: "Categoria / tipo", required: true, header: headers.category, tdClass: "px-4 py-3", render: renderAssetCategoryCell },
        { key: "location", label: "Sala / local", header: headers.location, tdClass: "px-4 py-3", render: renderAssetLocationCell },
        { key: "status", label: "Estado", header: headers.status, tdClass: "px-4 py-3", render: asset => statusBadge(getAssetStatus(asset)) },
        { key: "assignment", label: "Atribuição", header: headers.assignment, tdClass: "px-4 py-3", render: renderAssetAssignmentCell },
        { key: "registration", label: "Data de registo", header: headers.registration, tdClass: "px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-700", render: asset => escapeHTML(formatarData(getAssetRegistrationDate(asset))) }
    ];
}

function getAssetsTableDynamicColumnDefinitions() {
    const selectedCategory = getSelectedAssetCategoryFilter();
    const categoryName = selectedCategory ? getCategoryName(selectedCategory) : "";

    return getFeaturesTabelaAtivos().map(feature => ({
        key: getAssetFeatureColumnKey(feature),
        label: getFeatureName(feature),
        header: {
            label: getFeatureName(feature),
            sublabel: categoryName || "Característica"
        },
        tdClass: "px-4 py-3",
        render: asset => formatSpecValueForTable(feature, getAssetSpecRawValue(asset, feature))
    }));
}

function getAllAssetColumnDefinitions() {
    return [
        ...getAssetsTableBaseColumnDefinitions(),
        ...getAssetsTableDynamicColumnDefinitions()
    ];
}

function getVisibleAssetColumnDefinitions() {
    sincronizarColunasDinamicasAtivos();
    const definitions = getAllAssetColumnDefinitions();
    const visible = definitions.filter(column => column.required || assetVisibleColumnKeys.has(column.key));

    if (!visible.some(column => column.key === "id")) {
        const idColumn = definitions.find(column => column.key === "id");
        if (idColumn) visible.unshift(idColumn);
    }

    if (!visible.some(column => column.key === "category")) {
        const categoryColumn = definitions.find(column => column.key === "category");
        if (categoryColumn) visible.splice(Math.min(1, visible.length), 0, categoryColumn);
    }

    return visible;
}

function updateAssetsColumnToggleText() {
    const toggle = document.querySelector("[data-assets-columns-toggle]");
    if (!toggle) return;

    const count = getVisibleAssetColumnDefinitions().length;
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    toggle.textContent = `Colunas (${count})`;
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

function renderAssetsColumnPicker() {
    const picker = document.getElementById("assetsColumnPicker");
    if (!picker) return;

    const selectedCategory = getSelectedAssetCategoryFilter();

    if (!selectedCategory) {
        picker.innerHTML = "";
        picker.classList.add("hidden");
        updateAssetsColumnToggleText();
        return;
    }

    picker.classList.remove("hidden");

    const baseColumns = getAssetsTableBaseColumnDefinitions();
    const featureColumns = getAssetsTableDynamicColumnDefinitions();
    const requiredColumns = baseColumns.filter(column => column.required);
    const generalColumns = baseColumns.filter(column => !column.required);
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
                    ${requiredColumns.map(column => renderOption(column)).join("")}
                </div>
            </section>

            <section class="asset-column-section">
                <div class="asset-column-section-title">Dados gerais</div>
                <div class="asset-column-list asset-column-list-compact">
                    ${generalColumns.map(column => renderOption(column)).join("")}
                </div>
            </section>

            <section class="asset-column-section asset-column-section-features">
                <div class="asset-column-section-title">Características de ${escapeHTML(categoryName)}</div>
                ${featureColumns.length ? `
                    <div class="asset-column-list asset-column-list-features">
                        ${featureColumns.map(column => renderOption(column, "asset-column-option-feature")).join("")}
                    </div>
                ` : `<p class="asset-column-empty">Esta categoria ainda não tem características configuradas.</p>`}
            </section>
        </div>
    `;

    picker.querySelectorAll("[data-asset-column-key]").forEach(input => {
        input.addEventListener("change", () => {
            const key = input.dataset.assetColumnKey || "";
            if (ASSET_REQUIRED_COLUMN_KEYS.has(key)) return;

            assetColumnSelectionTouched = true;
            if (input.checked) {
                assetVisibleColumnKeys.add(key);
            } else {
                assetVisibleColumnKeys.delete(key);
            }
            guardarPreferenciasColunasAtivos();
            renderAssetsTable();
        });
    });

    picker.querySelectorAll("[data-asset-columns-preset]").forEach(button => {
        button.addEventListener("click", () => {
            const preset = button.dataset.assetColumnsPreset;
            const allColumns = [...baseColumns, ...featureColumns];
            assetColumnSelectionTouched = true;

            if (preset === "identity") {
                assetVisibleColumnKeys = new Set(["id", "category"]);
            } else if (preset === "all") {
                assetVisibleColumnKeys = new Set(allColumns.map(column => column.key));
            } else {
                assetVisibleColumnKeys = new Set(ASSET_DEFAULT_COLUMN_KEYS);
            }

            garantirColunasObrigatoriasAtivos();
            guardarPreferenciasColunasAtivos();
            renderAssetsTable();
        });
    });

    updateAssetsColumnToggleText();
}

function ligarPainelColunasAtivos() {
    const toggle = document.querySelector("[data-assets-columns-toggle]");
    if (!toggle || toggle.dataset.listenerAttached === "true") return;

    toggle.addEventListener("click", event => {
        event.preventDefault();
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        setAssetsColumnPickerOpen(!isOpen);
    });

    toggle.dataset.listenerAttached = "true";
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

    const visibleColumns = getVisibleAssetColumnDefinitions();

    thead.innerHTML = `
        <tr>
            ${visibleColumns.map(column => renderAssetsHeaderCell(column.header)).join("")}
            ${renderAssetsHeaderCell({ label: "AÇÕES" }, "right", TABLE_ACTION_HEADER_CLASS)}
        </tr>
    `;

    renderAssetsColumnPicker();
}

function getAssetSpecRawValue(asset, feature) {
    const featureId = String(getFeatureId(feature));
    const details = getAssetSpecsDetails(asset);
    const detail = details.find(item => String(getFeatureId(item)) === featureId);

    if (detail) {
        return primeiroValor(detail, ["content", "spec_value", "value", "valor"], "");
    }

    const specs = asset && asset.specs && typeof asset.specs === "object" ? asset.specs : {};
    const matchingKey = Object.keys(specs).find(key =>
        String(key) === featureId ||
        normalizarTexto(key) === normalizarTexto(getFeatureName(feature)) ||
        normalizarTexto(key) === normalizarTexto(getFeatureRawName(feature))
    );

    return matchingKey ? specs[matchingKey] : "";
}

function formatSpecValueForTable(feature, rawValue) {
    const values = decodeSpecValue(rawValue)
        .filter(value => value !== undefined && value !== null && String(value).trim() !== "");

    if (!values.length) {
        return `<span class="text-xs font-semibold text-gray-400">—</span>`;
    }

    const formattedValues = values.map(value => formatBooleanSpecValue(value));

    if (formattedValues.length === 1) {
        return `<span class="block max-w-44 truncate text-sm font-semibold text-gray-900" title="${escapeHTML(formattedValues[0])}">${escapeHTML(formattedValues[0])}</span>`;
    }

    const visibleValues = formattedValues.slice(0, 3);
    const remainingCount = formattedValues.length - visibleValues.length;

    return `
        <div class="flex max-w-56 flex-wrap gap-1">
            ${visibleValues.map(value => `<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800" title="${escapeHTML(value)}">${escapeHTML(value)}</span>`).join("")}
            ${remainingCount > 0 ? `<span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-900">+${remainingCount}</span>` : ""}
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
            <div class="font-bold text-gray-900">${escapeHTML(getAssetCategory(asset))}</div>
            <div class="mt-1 text-xs text-gray-500">${detailsCount} característica${detailsCount === 1 ? "" : "s"} preenchida${detailsCount === 1 ? "" : "s"}</div>
        </div>
    `;
}

function renderAssetLocationCell(asset) {
    return `
        <div class="min-w-36">
            <div class="font-semibold text-gray-900">${escapeHTML(getAssetLocation(asset))}</div>
            <div class="text-xs text-gray-500">Local #${escapeHTML(getAssetLocationId(asset) || "-")}</div>
        </div>
    `;
}

function renderAssetAssignmentCell(asset) {
    const assigned = getAssetAssigned(asset);
    const isAssigned = assigned && assigned !== "-";
    return `
        <div class="min-w-40">
            <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${isAssigned ? "bg-blue-50 text-blue-900 ring-1 ring-blue-100" : "bg-gray-100 text-gray-500"}">
                ${escapeHTML(isAssigned ? assigned : "Sem atribuição")}
            </span>
            ${isAssigned ? `<div class="mt-1 text-xs text-gray-500">${escapeHTML(formatarData(getAssetAssignedAt(asset)))}</div>` : ""}
        </div>
    `;
}

function renderAssetActionsCell(asset) {
    const assetId = getAssetId(asset);
    return renderTableActions([
        { label: "Ver", variant: "primary", title: "Ver detalhes do ativo", attrs: { "data-asset-action": "view", "data-asset-id": assetId } },
        { label: "Editar", variant: "secondary", title: "Editar ativo", attrs: { "data-asset-action": "edit", "data-asset-id": assetId } },
        { label: "Remover", variant: "danger", title: "Remover ativo", attrs: { "data-asset-action": "remove", "data-asset-id": assetId } }
    ]);
}

function renderAssetTableRow(asset) {
    const visibleColumns = getVisibleAssetColumnDefinitions();

    return `
        <tr class="align-top transition hover:bg-blue-50/40 cursor-pointer" data-asset-row-id="${escapeHTML(getAssetId(asset))}" title="Clicar para ver detalhes do ativo">
            ${visibleColumns.map(column => `<td class="${column.tdClass || "px-4 py-3"}">${column.render(asset)}</td>`).join("")}
            <td class="${TABLE_ACTION_CELL_CLASS}">${renderAssetActionsCell(asset)}</td>
        </tr>
    `;
}

async function renderAssetsTable() {
    const tbody = document.getElementById("assetsTableBody");
    if (!tbody) return;

    renderAssetsTableHead();
    atualizarPainelFeaturesCategoriaAtivos();
    atualizarInterfacePesquisaAtivos();

    const requestId = ++ativosSearchRequestId;
    const colspan = getAssetsTableColspan();
    tbody.innerHTML = `
        <tr>
            <td colspan="${colspan}" class="px-4 py-6 text-center text-sm text-gray-500">
                A pesquisar ativos...
            </td>
        </tr>
    `;

    try {
        const json = await fetchJSON(construirEndpointPesquisaAtivos());
        if (requestId !== ativosSearchRequestId) return;

        const data = json.data || {};
        const assets = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
        const pagination = paginationFromApi(data.pagination, assets.length);

        atualizarContador("assetsResultCount", pagination.total, cacheAtivos.length || pagination.total);
        renderPagination("assets", pagination);

        if (!assets.length) {
            renderEmptyRow(tbody, getAssetsTableColspan(), "Nenhum ativo encontrado.");
            return;
        }

        tbody.innerHTML = assets.map(renderAssetTableRow).join("");
    } catch (error) {
        console.warn("[API] Pesquisa de ativos falhou:", error);
        atualizarContador("assetsResultCount", 0, cacheAtivos.length);
        renderPagination("assets", {
            total: 0,
            totalPages: 1,
            currentPage: 1,
            startIndex: 0,
            endIndex: 0
        });
        renderEmptyRow(tbody, getAssetsTableColspan(), error.message || "Não foi possível pesquisar ativos.");
    }
}


function renderCategoriesTable() {
    const tbody = document.getElementById("categoriesTableBody");
    if (!tbody) return;

    let categories = [...cacheCategorias];
    const termo = getInputValue("categories-search");

    categories = categories.filter(c => textoIncluiTermo([
        getCategoryId(c),
        getCategoryName(c),
        getCategoryFeaturesText(c)
    ], termo));

    categories = ordenarRegistos(categories, getInputValue("categories-sort"), {
        "name-asc": { accessor: getCategoryName, dir: 1, type: "text" },
        "name-desc": { accessor: getCategoryName, dir: -1, type: "text" },
        "id-asc": { accessor: getCategoryId, dir: 1, type: "text" },
        "id-desc": { accessor: getCategoryId, dir: -1, type: "text" },
        "features-asc": { accessor: c => getCategoryFeatures(c).length, dir: 1, type: "text" },
        "features-desc": { accessor: c => getCategoryFeatures(c).length, dir: -1, type: "text" }
    });

    atualizarContador("categoriesResultCount", categories.length, cacheCategorias.length);

    const pagination = obterPaginaTabela("categories", categories);
    renderPagination("categories", pagination);
    categories = pagination.items;

    if (!categories.length) {
        renderEmptyRow(tbody, 4, "Nenhuma categoria encontrada.");
        return;
    }

    tbody.innerHTML = categories.map(c => `
                <tr class="align-top transition hover:bg-blue-50/40">
                    <td class="${TABLE_ID_CELL_CLASS}">#${escapeHTML(getCategoryId(c))}</td>
                    <td>
                        <div class="${TABLE_TITLE_CLASS}">${escapeHTML(getCategoryName(c))}</div>
                        <div class="${TABLE_SUBTITLE_CLASS}">${getCategoryFeatures(c).length} característica${getCategoryFeatures(c).length === 1 ? "" : "s"}</div>
                    </td>
                    <td>${renderCategoryFeatures(getCategoryFeatures(c))}</td>
                    <td class="${TABLE_ACTION_CELL_CLASS}">
                        ${renderTableActions([
                            { label: "Ativos", variant: "primary", title: "Listar ativos desta categoria", attrs: { "data-category-action": "assets", "data-category-id": getCategoryId(c) } },
                            { label: "Editar", variant: "secondary", title: "Editar categoria", attrs: { "data-category-action": "edit", "data-category-id": getCategoryId(c) } },
                            { label: "Remover", variant: "danger", title: "Remover categoria", attrs: { "data-category-action": "remove", "data-category-id": getCategoryId(c) } }
                        ])}
                    </td>
                </tr>
            `).join("");
}

function renderLogsTable() {
    const tbody = document.getElementById("logsTableBody");
    if (!tbody) return;

    let logs = [...cacheRegistos];
    const termo = getInputValue("logs-search");
    const utilizador = getInputValue("logs-user");
    const acao = getInputValue("logs-action");
    const tabela = getInputValue("logs-table");

    logs = logs.filter(log => {
        const matchesSearch = textoIncluiTermo([
            getLogDate(log),
            getLogUser(log),
            getLogAction(log),
            getLogActionLabel(log),
            getLogTable(log),
            getLogTableLabel(log),
            getLogDetails(log),
            auditDisplayText(log.old_value_display),
            auditDisplayText(log.new_value_display)
        ], termo);

        const matchesUser = !utilizador || normalizarTexto(getLogUser(log)) === normalizarTexto(utilizador);
        const matchesAction = !acao || normalizarTexto(getLogActionLabel(log)) === normalizarTexto(acao);
        const matchesTable = !tabela || normalizarTexto(getLogTableLabel(log)) === normalizarTexto(tabela);

        return matchesSearch && matchesUser && matchesAction && matchesTable;
    });

    logs = ordenarRegistos(logs, getInputValue("logs-sort"), {
        "date-desc": { accessor: getLogDate, dir: -1, type: "date" },
        "date-asc": { accessor: getLogDate, dir: 1, type: "date" },
        "user-asc": { accessor: getLogUser, dir: 1, type: "text" },
        "action-asc": { accessor: getLogActionLabel, dir: 1, type: "text" }
    });

    atualizarContador("logsResultCount", logs.length, cacheRegistos.length);

    const pagination = obterPaginaTabela("logs", logs);
    renderPagination("logs", pagination);
    logs = pagination.items;

    if (!logs.length) {
        renderEmptyRow(tbody, 5, "Nenhum registo encontrado.");
        return;
    }

    tbody.innerHTML = logs.map(log => `
                <tr class="align-top transition hover:bg-blue-50/40 cursor-pointer" data-log-id="${escapeHTML(getLogId(log))}">
                    <td class="whitespace-nowrap">${escapeHTML(formatarData(getLogDate(log)))}</td>
                    <td>${escapeHTML(getLogUser(log))}</td>
                    <td><span class="${TABLE_TITLE_CLASS}">${escapeHTML(getLogActionLabel(log))}</span></td>
                    <td>${escapeHTML(getLogTableLabel(log))}</td>
                    <td>
                        <div class="font-semibold text-gray-900">${escapeHTML(getLogDetails(log))}</div>
                        <div class="mt-2">${renderTableActions([{ label: "Detalhe", variant: "secondary", title: "Ver detalhe do registo", attrs: { "data-log-action": "view", "data-log-id": getLogId(log) } }])}</div>
                    </td>
                </tr>
            `).join("");
}


function obterPaginaTabela(grupo, items) {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
    const currentPage = Math.min(Math.max(Number(tablePaginationState[grupo]) || 1, 1), totalPages);
    const start = (currentPage - 1) * TABLE_PAGE_SIZE;
    const end = Math.min(start + TABLE_PAGE_SIZE, total);

    tablePaginationState[grupo] = currentPage;

    return {
        items: items.slice(start, end),
        total,
        totalPages,
        currentPage,
        startIndex: total ? start + 1 : 0,
        endIndex: end
    };
}

function renderPagination(grupo, pagination) {
    const container = document.getElementById(`${grupo}Pagination`);
    if (!container) return;

    const isFirstPage = pagination.currentPage <= 1;
    const isLastPage = pagination.currentPage >= pagination.totalPages;
    const info = pagination.total
        ? `A mostrar ${pagination.startIndex}-${pagination.endIndex} de ${pagination.total} · Página ${pagination.currentPage} de ${pagination.totalPages}`
        : "0 resultados";

    container.innerHTML = `
                <span class="text-sm font-bold text-gray-500">${escapeHTML(info)}</span>
                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" class="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-900 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-blue-900 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white" data-pagination-group="${escapeHTML(grupo)}" data-pagination-direction="prev" ${isFirstPage ? "disabled" : ""}>Anterior</button>
                    <button type="button" class="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-900 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-blue-900 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-white" data-pagination-group="${escapeHTML(grupo)}" data-pagination-direction="next" ${isLastPage ? "disabled" : ""}>Seguinte</button>
                </div>
            `;
}

function resetarPaginaTabela(grupo) {
    if (Object.prototype.hasOwnProperty.call(tablePaginationState, grupo)) {
        tablePaginationState[grupo] = 1;
    }
}

function mudarPaginaTabela(grupo, direction) {
    if (!Object.prototype.hasOwnProperty.call(tablePaginationState, grupo)) return;

    const delta = direction === "next" ? 1 : -1;
    tablePaginationState[grupo] = Math.max(1, (Number(tablePaginationState[grupo]) || 1) + delta);
    renderPorGrupo(grupo);
}

function filtrarUtilizadores(prefixo) {
    let users = [...cacheUtilizadores];
    const termo = getInputValue(`${prefixo}-search`);
    const cargo = getInputValue(`${prefixo}-role`);
    const estado = getInputValue(`${prefixo}-status`);

    users = users.filter(u => {
        const matchesSearch = textoIncluiTermo([
            getUserId(u),
            getUserEmail(u),
            getUserRole(u),
            getUserStatus(u)
        ], termo);

        const matchesRole = !cargo || normalizarTexto(getUserRole(u)) === normalizarTexto(cargo);
        const matchesStatus = !estado || normalizarTexto(getUserStatus(u)) === normalizarTexto(estado);

        return matchesSearch && matchesRole && matchesStatus;
    });

    return ordenarRegistos(users, getInputValue(`${prefixo}-sort`), {
        "email-asc": { accessor: getUserEmail, dir: 1, type: "text" },
        "email-desc": { accessor: getUserEmail, dir: -1, type: "text" },
        "role-asc": { accessor: getUserRole, dir: 1, type: "text" },
        "role-desc": { accessor: getUserRole, dir: -1, type: "text" },
        "id-asc": { accessor: getUserId, dir: 1, type: "text" },
        "id-desc": { accessor: getUserId, dir: -1, type: "text" }
    });
}

function limparFiltros(grupo) {
    resetarPaginaTabela(grupo);
    const ids = filterGroups[grupo] || [];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        if (el.tagName === "SELECT") {
            el.selectedIndex = 0;
        } else {
            el.value = "";
        }
    });

    if (grupo === "assets") {
        const specFilters = document.getElementById("assetSpecFiltersRows");
        if (specFilters) {
            specFilters.innerHTML = `<p class="asset-spec-filter-empty ${ASSET_SPEC_FILTER_EMPTY_CLASS}">Sem filtros avançados ativos.</p>`;
        }
        setAssetsFilterDrawerOpen(false);
        setAssetsColumnPickerOpen(false);
        atualizarInterfacePesquisaAtivos();
        atualizarFeaturesCategoriaPesquisaAtivos().finally(() => renderAssetsTable());
        return;
    }

    renderPorGrupo(grupo);
    if (cleanSearchConfigs[grupo]) {
        setCleanFilterDrawerOpen(grupo, false);
        atualizarInterfacePesquisaConsulta(grupo);
    }
}

function ligarFiltros() {
    ligarGrupo("dashboardUsers", renderDashboardUsersTable);
    ligarGrupo("users", renderUsersTable);
    ligarGrupo("locations", renderLocationsTable);
    ligarGrupo("assets", renderAssetsTable);
    ligarGrupo("categories", renderCategoriesTable);
    ligarGrupo("logs", renderLogsTable);
}

function ligarFiltrosSpecsAtivos() {
    const addButton = document.getElementById("btnAdicionarFiltroSpecAtivo");
    if (addButton && addButton.dataset.listenerAttached !== "true") {
        addButton.addEventListener("click", event => {
            event.preventDefault();
            adicionarFiltroSpecAtivo();
            atualizarInterfacePesquisaAtivos();
            resetarPaginaTabela("assets");
            agendarRenderAssetsTable();
        });
        addButton.dataset.listenerAttached = "true";
    }
}

function ligarGrupo(grupo, callback) {
    const ids = filterGroups[grupo] || [];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.dataset.listenerAttached === "true") return;

        const eventName = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(eventName, () => {
            resetarPaginaTabela(grupo);
            if (grupo === "assets") {
                if (id === "assets-category") {
                    atualizarFeaturesCategoriaPesquisaAtivos().finally(() => renderAssetsTable());
                    return;
                }

                agendarRenderAssetsTable();
                return;
            }
            callback();
            atualizarInterfacePesquisaConsulta(grupo);
        });
        el.dataset.listenerAttached = "true";
    });
}

function renderPorGrupo(grupo) {
    const callbacks = {
        dashboardUsers: renderDashboardUsersTable,
        users: renderUsersTable,
        locations: renderLocationsTable,
        assets: renderAssetsTable,
        categories: renderCategoriesTable,
        logs: renderLogsTable
    };

    if (callbacks[grupo]) callbacks[grupo]();
    atualizarInterfacePesquisaConsulta(grupo);
}

function derivarLocaisDosAtivos(assets) {
    const mapa = new Map();

    assets.forEach(a => {
        const id = primeiroValor(a, ["location_id", "local_id", "id_location", "id_local"], "");
        const nome = getAssetLocation(a);

        if (!id && !nome) return;

        const chave = String(id || nome);
        if (!mapa.has(chave)) {
            mapa.set(chave, {
                location_id: id || chave,
                location_name: nome || `Sala ${chave}`,
                status: primeiroValor(a, ["location_status", "local_status"], "Operacional")
            });
        }
    });

    return Array.from(mapa.values());
}

function derivarCategoriasDosAtivos(assets) {
    const mapa = new Map();

    assets.forEach(a => {
        const nome = getAssetCategory(a);
        const id = primeiroValor(a, ["category_id", "categoria_id", "id_category", "id_categoria"], nome);

        if (!nome) return;

        const chave = String(id || nome);
        if (!mapa.has(chave)) {
            mapa.set(chave, {
                category_id: id || chave,
                category_name: nome
            });
        }
    });

    return Array.from(mapa.values());
}

function getLogChartPeriod() {
    const period = getInputValue("logs-chart-period") || LOG_CHART_DEFAULT_PERIOD;
    return Object.prototype.hasOwnProperty.call(LOG_CHART_PERIOD_LABELS, period)
        ? period
        : LOG_CHART_DEFAULT_PERIOD;
}

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function getDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getDayLabelFromKey(key) {
    const [year, month, day] = String(key).split("-").map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);

    return date.toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "short"
    });
}

function getDayRangeKeys(startDate, endDate) {
    const keys = [];
    const cursor = startOfDay(startDate);
    const end = startOfDay(endDate);

    while (cursor <= end) {
        keys.push(getDayKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return keys;
}

function getMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabelFromKey(key) {
    const [year, month] = String(key).split("-").map(Number);
    const date = new Date(year, (month || 1) - 1, 1);

    return date.toLocaleDateString("pt-PT", {
        month: "short",
        year: "numeric"
    });
}

function getMonthRangeKeys(startDate, endDate, maxMonths = null) {
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const keys = [];
    const cursor = new Date(start);

    while (cursor <= end) {
        keys.push(getMonthKey(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return Number.isInteger(maxMonths) && maxMonths > 0 ? keys.slice(-maxMonths) : keys;
}

function getYearKey(date) {
    return String(date.getFullYear());
}

function getYearRangeKeys(startDate, endDate) {
    const keys = [];
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    for (let year = startYear; year <= endYear; year += 1) {
        keys.push(String(year));
    }

    return keys;
}

function getMonthDistance(startDate, endDate) {
    return ((endDate.getFullYear() - startDate.getFullYear()) * 12) + (endDate.getMonth() - startDate.getMonth()) + 1;
}

function countDatesByKey(dates, keyGetter) {
    const counts = new Map();

    dates.forEach(date => {
        const key = keyGetter(date);
        counts.set(key, (counts.get(key) || 0) + 1);
    });

    return counts;
}

function buildLogChartData({ period, keys, labels, counts }) {
    const values = keys.map(key => counts.get(key) || 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const periodLabel = LOG_CHART_PERIOD_LABELS[period] || LOG_CHART_PERIOD_LABELS[LOG_CHART_DEFAULT_PERIOD];
    const unitLabel = total === 1 ? "registo" : "registos";

    return {
        labels,
        values,
        description: `${periodLabel} · ${total} ${unitLabel}`
    };
}

function criarDadosRegistosMensais() {
    const period = getLogChartPeriod();
    const datasValidas = cacheRegistos
        .map(log => new Date(getLogDate(log)))
        .filter(data => !Number.isNaN(data.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

    if (!datasValidas.length) {
        return {
            labels: ["Sem dados"],
            values: [0],
            description: "Sem registos para apresentar."
        };
    }

    const today = new Date();
    const endDate = endOfDay(today);

    if (period === "month") {
        const startDate = startOfDay(addDays(today, -29));
        const keys = getDayRangeKeys(startDate, today);
        const counts = countDatesByKey(
            datasValidas.filter(data => data >= startDate && data <= endDate),
            getDayKey
        );

        return buildLogChartData({
            period,
            keys,
            labels: keys.map(getDayLabelFromKey),
            counts
        });
    }

    if (period === "year") {
        const startDate = new Date(today.getFullYear(), today.getMonth() - 11, 1);
        const keys = getMonthRangeKeys(startDate, today, 12);
        const counts = countDatesByKey(
            datasValidas.filter(data => data >= startDate && data <= endDate),
            getMonthKey
        );

        return buildLogChartData({
            period,
            keys,
            labels: keys.map(getMonthLabelFromKey),
            counts
        });
    }

    const firstDate = datasValidas[0];
    const lastDate = datasValidas[datasValidas.length - 1];
    const shouldGroupByYear = getMonthDistance(firstDate, lastDate) > 24;
    const keys = shouldGroupByYear
        ? getYearRangeKeys(firstDate, lastDate)
        : getMonthRangeKeys(firstDate, lastDate);
    const counts = countDatesByKey(datasValidas, shouldGroupByYear ? getYearKey : getMonthKey);

    return buildLogChartData({
        period,
        keys,
        labels: shouldGroupByYear ? keys : keys.map(getMonthLabelFromKey),
        counts
    });
}

function atualizarResumoGraficoRegistos(dadosRegistos) {
    const subtitle = document.getElementById("chartRegistosSubtitle");
    if (!subtitle) return;

    subtitle.textContent = dadosRegistos?.description || LOG_CHART_PERIOD_LABELS[getLogChartPeriod()] || "Registos";
}

function criarDadosAtividadePorEstado() {
    if (!cacheAtivos.length) {
        return {
            labels: ["Sem dados"],
            values: [0]
        };
    }

    const estados = new Map();

    cacheAtivos.forEach(a => {
        const estado = getAssetStatus(a) || "Sem estado";
        estados.set(estado, (estados.get(estado) || 0) + 1);
    });

    const dados = {
        labels: Array.from(estados.keys()),
        values: Array.from(estados.values())
    };

    return DashboardCommon.sortCountData(dados, [
        "Bom Estado",
        "Necessita Manutenção",
        "Avariado",
        "Para Abate"
    ]);
}

function inicializarGraficos() {
    if (typeof Chart === "undefined") {
        console.warn("[Dashboard] Chart.js nao esta carregado; os graficos foram ignorados.");
        return;
    }

    const canvasRegistos = document.getElementById("chartRegistos");
    const dadosRegistos = criarDadosRegistosMensais();
    atualizarResumoGraficoRegistos(dadosRegistos);

    if (canvasRegistos) {
        DashboardCommon.safeDestroyChart(meuGraficoRegistos);
        meuGraficoRegistos = DashboardCommon.createLineCountChart(canvasRegistos, {
            labels: dadosRegistos.labels,
            values: dadosRegistos.values,
            label: "Registos"
        });
    }

    const canvasAtividade = document.getElementById("chartAtividade");
    const dadosAtividade = criarDadosAtividadePorEstado();

    if (canvasAtividade) {
        DashboardCommon.safeDestroyChart(meuGraficoAtividade);
        meuGraficoAtividade = DashboardCommon.createDoughnutCountChart(canvasAtividade, {
            labels: dadosAtividade.labels,
            values: dadosAtividade.values,
            label: "Ativos"
        });
    }
}

function popularSelect(selectId, valores, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const valorAtual = select.value;
    const opcoes = valores
        .filter(v => v !== undefined && v !== null && String(v).trim() !== "")
        .sort((a, b) => String(a).localeCompare(String(b), "pt", { sensitivity: "base", numeric: true }));

    const placeholderOnly = shouldRenderAsPlaceholderOnly(placeholder);
    select.innerHTML = renderSelectEmptyOption(placeholder, { asPlaceholder: placeholderOnly, selected: !valorAtual }) + opcoes
        .map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`)
        .join("");

    if (opcoes.some(v => String(v) === String(valorAtual))) {
        select.value = valorAtual;
    } else {
        select.value = "";
    }
}

function popularSelectFromRecords(selectId, items, getValue, getLabel, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const valorAtual = select.value;
    const records = (items || [])
        .map(item => ({ value: getValue(item), label: getLabel(item) }))
        .filter(item => item.value !== undefined && item.value !== null && String(item.value).trim() !== "")
        .sort((a, b) => String(a.label).localeCompare(String(b.label), "pt", { sensitivity: "base", numeric: true }));

    const placeholderOnly = shouldRenderAsPlaceholderOnly(placeholder);
    select.innerHTML = renderSelectEmptyOption(placeholder, { asPlaceholder: placeholderOnly, selected: !valorAtual }) + records
        .map(item => `<option value="${escapeHTML(item.value)}">${escapeHTML(item.label)}</option>`)
        .join("");

    if (records.some(item => String(item.value) === String(valorAtual))) {
        select.value = valorAtual;
    } else {
        select.value = "";
    }
}

function valoresUnicos(valores) {
    const mapa = new Map();

    valores.forEach(valor => {
        const texto = String(valor ?? "").trim();
        if (!texto) return;
        mapa.set(normalizarTexto(texto), texto);
    });

    return Array.from(mapa.values());
}

function ordenarRegistos(registos, sortValue, sortMap) {
    const config = sortMap[sortValue];
    if (!config) return registos;

    return [...registos].sort((a, b) => {
        const valorA = config.accessor(a);
        const valorB = config.accessor(b);

        return compararValores(valorA, valorB, config.type) * config.dir;
    });
}

function compararValores(a, b, type = "text") {
    if (type === "date") {
        const dataA = new Date(a).getTime() || 0;
        const dataB = new Date(b).getTime() || 0;
        return dataA - dataB;
    }

    return String(a ?? "").localeCompare(String(b ?? ""), "pt", {
        sensitivity: "base",
        numeric: true
    });
}

function textoIncluiTermo(valores, termo) {
    const filtro = normalizarTexto(termo);
    if (!filtro) return true;

    return valores.some(valor => normalizarTexto(valor).includes(filtro));
}

function normalizarTexto(valor) {
    return String(valor ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
}

function primeiroValor(obj, keys, fallback = "") {
    for (const key of keys) {
        if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
            return obj[key];
        }
    }

    return fallback;
}

function getLocationId(l) {
    return primeiroValor(l, ["location_id", "id", "local_id", "id_location", "id_local"], "-");
}

function getLocationName(l) {
    return primeiroValor(l, ["location_name", "name", "designacao", "designation", "sala", "room_name"], "Sem designação");
}

function getLocationStatus(l) {
    return primeiroValor(l, ["status", "estado", "state"], "Operacional");
}

function getAssetId(a) {
    return primeiroValor(a, ["asset_id", "id", "id_asset"], "-");
}

function getAssetSerial(a) {
    return primeiroValor(a, ["serial_number", "serial", "numero_serie", "n_serie"], "");
}

function getAssetCode(a) {
    return getAssetSerial(a) || `INV-${getAssetId(a)}`;
}

function getAssetCategoryId(a) {
    return primeiroValor(a, ["category_id", "categoria_id", "id_category", "id_categoria"], "");
}

function getAssetLocationId(a) {
    return primeiroValor(a, ["location_id", "local_id", "id_location", "id_local"], "");
}

function getAssetCategory(a) {
    return primeiroValor(a, ["category_name", "category", "categoria", "nome_categoria"], "Equipamento");
}

function getAssetLocation(a) {
    return primeiroValor(a, ["location_name", "location", "local", "sala", "room_name"], "Sem Sala");
}

function getAssetStatus(a) {
    return primeiroValor(a, ["status", "estado", "state"], "Bom");
}


function getAssetAssigned(a) {
    return primeiroValor(a, [
        "assigned_to_name",
        "assigned_to",
        "assigned_user_name",
        "assigned_user",
        "user_name",
        "user_email",
        "responsavel",
        "atribuido_a",
        "atribuicao"
    ], "-");
}

function getAssetRegistrationDate(a) {
    return primeiroValor(a, [
        "created_at",
        "registered_at",
        "registration_date",
        "data_registo",
        "date_created",
        "created_on"
    ], "");
}

function getAssetMaintenancePeriod(a) {
    return primeiroValor(a, ["maintenance_period_months", "periodo_manutencao", "maintenance_period"], "");
}

function getAssetLastMaintenance(a) {
    return primeiroValor(a, ["last_maintenance", "ultima_manutencao", "lastMaintenance"], "");
}

function getAssetAssignedAt(a) {
    return primeiroValor(a, ["assigned_at", "atribuido_em", "assignedAt"], "");
}

function formatDateForInput(value) {
    if (!value) return "";

    const data = new Date(value);
    if (Number.isNaN(data.getTime())) return String(value).slice(0, 10);

    return data.toISOString().slice(0, 10);
}

function getTodayInputValue() {
    return new Date().toISOString().slice(0, 10);
}

function getAssetSpecsDetails(a) {
    if (a && Array.isArray(a.specs_details)) return a.specs_details;
    if (a && Array.isArray(a.specifications)) return a.specifications;
    return [];
}

function getCategoryId(c) {
    return primeiroValor(c, ["category_id", "id", "categoria_id", "id_category", "id_categoria"], "-");
}

function getCategoryName(c) {
    return primeiroValor(c, ["category_name", "name", "nome", "categoria", "nome_categoria"], "Sem nome");
}

function getCategoryFeaturesText(category) {
    return getCategoryFeatures(category)
        .map(feature => `${getFeatureName(feature)} ${getFeatureTypeLabel(feature)}`)
        .join(" ");
}

function getFeatureTypeLabel(feature) {
    const type = String(getFeatureType(feature)).toLowerCase();
    return FEATURE_TYPE_LABELS[type] || type || "Texto";
}

function renderCategoryFeatures(features) {
    if (!features.length) {
        return `<span class="text-sm text-gray-400">Sem features</span>`;
    }

    return `
                <div class="flex flex-wrap gap-2">
                    ${features.map(feature => `
                        <span class="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900 border border-blue-100">
                            ${escapeHTML(getFeatureName(feature))}
                        </span>
                    `).join("")}
                </div>
            `;
}

function getLogId(log) {
    return primeiroValor(log, ["log_id", "id", "audit_log_id"], "");
}

function getLogDate(log) {
    return primeiroValor(log, ["created_at", "timestamp", "date", "data_hora", "data", "datetime"], "");
}

function getLogUser(log) {
    return primeiroValor(log, ["user_email", "email", "user", "utilizador", "username"], "Sistema");
}

function getLogAction(log) {
    return primeiroValor(log, ["action", "acao", "type", "tipo"], "Ação");
}

function getLogActionLabel(log) {
    return primeiroValor(log, ["action_label", "acao_label", "action_name"], getLogAction(log));
}

function getLogTable(log) {
    return primeiroValor(log, ["table_name", "table", "tabela"], "Registo");
}

function getLogTableLabel(log) {
    return primeiroValor(log, ["table_label", "tabela_label", "table_name_label"], getLogTable(log));
}

function getLogDetails(log) {
    return primeiroValor(log, ["details", "detalhes", "description", "descricao", "message"], "");
}

function formatarData(valor) {
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return valor || "-";

    return data.toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function statusBadge(status) {
    const texto = String(status || "-");
    const normalizado = normalizarTexto(texto);

    let classes = "bg-blue-100 text-blue-800";

    if (["ativo", "ativa", "operacional", "bom", "bom estado", "disponivel", "disponível", "ok"].includes(normalizado)) {
        classes = "bg-green-100 text-green-800";
    } else if (["inativo", "inativa", "removido", "removida", "danificado", "danificada", "avariado", "avariada", "para abate", "erro"].includes(normalizado)) {
        classes = "bg-red-100 text-red-800";
    } else if (["necessita manutencao", "necessita manutenção", "manutencao", "manutenção", "pendente", "reservado", "reservada"].includes(normalizado)) {
        classes = "bg-yellow-100 text-yellow-800";
    }

    return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${classes}">${escapeHTML(texto)}</span>`;
}

function renderEmptyRow(tbody, colspan, mensagem) {
    tbody.innerHTML = `
                <tr>
                    <td colspan="${colspan}" class="px-4 py-6 text-center text-sm text-gray-500">
                        ${escapeHTML(mensagem)}
                    </td>
                </tr>
            `;
}

function atualizarContador(elementId, filtrados, total) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.innerText = `${filtrados} de ${total} resultados`;
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



async function requestJSON(endpoint, method = "GET", payload = null) {
    const result = await apiRequest(endpoint, {
        method,
        body: payload !== null ? JSON.stringify(payload) : undefined
    });

    if (!result.success) {
        throw new Error(result.error || result.message || "Não foi possível guardar os dados.");
    }

    return {
        success: result.success,
        data: result.data,
        message: result.message,
        status: result.status
    };
}

async function postJSON(endpoint, payload) {
    return requestJSON(endpoint, "POST", payload);
}

async function putJSON(endpoint, payload) {
    return requestJSON(endpoint, "PUT", payload);
}

async function deleteJSON(endpoint) {
    return requestJSON(endpoint, "DELETE");
}

function mostrarToast(message, isError = false) {
    const toast = document.getElementById("toastMessage");
    if (!toast) return;

    toast.textContent = message;
    toast.className = `fixed right-6 top-6 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${isError ? "bg-red-100 text-red-800 border border-red-200" : "bg-green-100 text-green-800 border border-green-200"}`;

    setTimeout(() => {
        toast.classList.add("hidden");
    }, 3500);
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.warn(`[Dashboard] Modal nao encontrado: ${modalId}`);
        return;
    }

    modal.classList.remove("hidden");
    modal.classList.add("flex");
    modal.setAttribute("aria-hidden", "false");
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add("hidden");
    modal.classList.remove("flex");
    modal.setAttribute("aria-hidden", "true");
}

function preencherSelectModal(selectId, items, getValue, getLabel, placeholder) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const placeholderOnly = shouldRenderAsPlaceholderOnly(placeholder);
    select.innerHTML = renderSelectEmptyOption(placeholder, { asPlaceholder: placeholderOnly, selected: true }) + items.map(item => {
        const value = getValue(item);
        const label = getLabel(item);
        return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
    }).join("");
}

function preencherSelectMultiploModal(selectId, items, getValue, getLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = items.map(item => {
        const value = getValue(item);
        const label = getLabel(item);
        return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
    }).join("");
}

function getSelectedSelectValues(select) {
    if (!select) return [];
    return Array.from(select.selectedOptions || [])
        .map(option => option.value)
        .filter(value => value !== undefined && value !== null && String(value).trim() !== "");
}

function selecionarValoresSelectMultiplo(select, values) {
    if (!select) return;
    const selectedValues = new Set((values || []).map(String));
    Array.from(select.options || []).forEach(option => {
        option.selected = selectedValues.has(String(option.value));
    });
}

function getCategoryFeatures(categoryOrId) {
    const category = typeof categoryOrId === "object" && categoryOrId !== null
        ? categoryOrId
        : cacheCategorias.find(c => String(getCategoryId(c)) === String(categoryOrId || ""));

    const id = category ? String(getCategoryId(category)) : String(categoryOrId || "");
    if (!id) return [];

    if (category && Array.isArray(category.features)) return category.features;

    return cacheFeaturesPorCategoria[id] || [];
}

async function carregarFeaturesCategoria(categoryId) {
    const id = String(categoryId || "");
    if (!id) return [];

    const localFeatures = getCategoryFeatures(id);
    if (localFeatures.length) return localFeatures;

    const features = await fetchArray(`/categories/${id}/features`);
    cacheFeaturesPorCategoria[id] = features;
    return features;
}

function getFeatureId(feature) {
    return primeiroValor(feature, ["feature_id", "id", "id_feature"], "");
}

function getFeatureRawName(feature) {
    return primeiroValor(feature, ["feature_name", "name", "nome"], "");
}

function limparNomeFeature(name) {
    return String(name || "")
        .replace(/\[\]$/g, "")
        .replace(/\s*\(m[uú]ltiplo\)\s*$/i, "")
        .trim();
}

function getFeatureName(feature) {
    return limparNomeFeature(getFeatureRawName(feature)) || "Característica";
}

function isFeatureRepeatable(feature) {
    if (!feature) return false;

    const explicitValue = primeiroValor(feature, ["is_repeatable", "repeatable", "multipla", "multiple"], null);
    if (explicitValue !== null && explicitValue !== "") {
        if (typeof explicitValue === "boolean") return explicitValue;
        return ["true", "1", "sim", "yes", "on"].includes(String(explicitValue).trim().toLowerCase());
    }

    const rawName = String(getFeatureRawName(feature) || "").trim();
    return rawName.endsWith(REPEATABLE_FEATURE_SUFFIX) || /\(m[uú]ltiplo\)$/i.test(rawName);
}

function isFeatureActive(feature) {
    if (!feature) return true;
    const explicitValue = primeiroValor(feature, ["feature_is_active", "is_active", "active"], null);
    if (explicitValue === null || explicitValue === "") return true;
    if (typeof explicitValue === "boolean") return explicitValue;
    return ["true", "1", "sim", "yes", "on", "ativa", "ativo"].includes(String(explicitValue).trim().toLowerCase());
}

function buildFeatureNameForSave(name) {
    return limparNomeFeature(name);
}

function getFeatureType(feature) {
    return primeiroValor(feature, ["feature_type", "type", "tipo"], "text");
}

function inputTypeForFeature(featureType) {
    const type = String(featureType || "text").toLowerCase();
    if (type === "number") return "number";
    if (type === "date") return "date";
    return "text";
}

function renderFeatureInputControl(feature, value = "", extraClass = "asset-spec-value-input") {
    const id = getFeatureId(feature);
    const type = String(getFeatureType(feature)).toLowerCase();
    const safeValue = String(value ?? "");

    if (type === "boolean") {
        const normalized = safeValue.toLowerCase();
        const valueAttr = ["true", "1", "sim", "yes"].includes(normalized)
            ? "true"
            : (["false", "0", "nao", "não", "no"].includes(normalized) ? "false" : "");

        return `
                    <select data-feature-id="${escapeHTML(id)}" class="${extraClass} w-full rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20">
                        ${renderSelectEmptyOption("Selecionar valor", { asPlaceholder: true, selected: !valueAttr })}
                        <option value="true" ${valueAttr === "true" ? "selected" : ""}>Sim</option>
                        <option value="false" ${valueAttr === "false" ? "selected" : ""}>Não</option>
                    </select>
                `;
    }

    return `
                <input data-feature-id="${escapeHTML(id)}" type="${inputTypeForFeature(type)}" value="${escapeHTML(safeValue)}" class="${extraClass} w-full rounded-lg border-2 border-blue-900 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-900/20" placeholder="Valor">
            `;
}

function renderSpecValueRow(feature, value = "", allowRemove = true) {
    return `
                <div class="flex items-center gap-2">
                    ${renderFeatureInputControl(feature, value)}
                    ${allowRemove ? `<button type="button" data-spec-action="remove" class="rounded-lg border-2 border-red-600 px-3 py-2 text-xs font-bold uppercase text-red-600 hover:bg-red-50">Remover</button>` : ""}
                </div>
            `;
}

function renderAssetSpecsFields(features) {
    const container = document.getElementById("assetSpecsFields");
    if (!container) return;

    if (!features.length) {
        container.innerHTML = `<p class="md:col-span-2 text-sm text-gray-500">Esta categoria ainda não tem características associadas.</p>`;
        return;
    }

    container.innerHTML = features.map(feature => {
        const id = getFeatureId(feature);
        const name = getFeatureName(feature);
        const repeatable = isFeatureRepeatable(feature);

        return `
                    <div class="md:col-span-2 rounded-lg border border-blue-100 bg-white p-3" data-spec-feature-id="${escapeHTML(id)}" data-spec-feature-type="${escapeHTML(getFeatureType(feature))}" data-spec-repeatable="${repeatable ? "true" : "false"}">
                        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <label class="block text-xs font-extrabold uppercase text-blue-900">${escapeHTML(name)}</label>
                
                            </div>
                            ${repeatable ? `<button type="button" data-spec-action="add" data-feature-id="${escapeHTML(id)}" class="rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-xs font-bold uppercase text-blue-900 hover:bg-gray-100">+ Valor</button>` : ""}
                        </div>
                        <div class="asset-spec-values space-y-2">
                            ${renderSpecValueRow(feature, "", repeatable)}
                        </div>
                    </div>
                `;
    }).join("");
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
            } catch (error) {
                return [rawValue];
            }
        }
    }

    return [rawValue];
}

function adicionarValorFeature(featureId, value = "") {
    const group = Array.from(document.querySelectorAll("[data-spec-feature-id]"))
        .find(item => String(item.dataset.specFeatureId) === String(featureId));
    if (!group) return;

    const categoryId = document.getElementById("new-asset-category")?.value;
    const feature = getCategoryFeatures(categoryId).find(f => String(getFeatureId(f)) === String(featureId));
    if (!feature) return;

    const valuesContainer = group.querySelector(".asset-spec-values");
    if (!valuesContainer) return;

    valuesContainer.insertAdjacentHTML("beforeend", renderSpecValueRow(feature, value));
}

function recolherValorControl(input) {
    return input ? input.value : "";
}

function recolherSpecsAtivo() {
    const specs = {};

    document.querySelectorAll("[data-spec-feature-id]").forEach(group => {
        const featureId = group.dataset.specFeatureId;
        const values = Array.from(group.querySelectorAll(".asset-spec-value-input"))
            .map(recolherValorControl)
            .filter(value => value !== undefined && String(value).trim() !== "");

        if (!featureId || !values.length) return;

        const isRepeatable = group.dataset.specRepeatable === "true";
        specs[featureId] = isRepeatable ? values : values[0];
    });

    return specs;
}

async function atualizarCamposSpecsDoAtivo() {
    const categoryId = document.getElementById("new-asset-category")?.value;

    if (!categoryId) {
        renderAssetSpecsFields([]);
        return;
    }

    const features = await carregarFeaturesCategoria(categoryId);
    renderAssetSpecsFields(features);
}

function adicionarLinhaFeatureCategoria(feature = {}) {
    const container = document.getElementById("categoryFeaturesRows");
    if (!container) return;

    const row = document.createElement("div");
    const featureId = getFeatureId(feature);
    row.dataset.featureId = featureId || "";
    row.className = CATEGORY_FEATURE_ROW_CLASS;
    row.innerHTML = `
                <div class="${CATEGORY_FEATURE_FIELD_CLASS}">
                    <label class="text-xs font-black uppercase tracking-wide text-blue-900">Nome da feature</label>
                    <input type="text" data-category-feature-name value="${escapeHTML(getFeatureName(feature) === "Característica" && !getFeatureRawName(feature) ? "" : getFeatureName(feature))}" class="w-full min-w-0 rounded-lg border-2 border-blue-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-900/20" placeholder="Ex.: CPU, RAM, Licença">
                </div>
                <div class="${CATEGORY_FEATURE_FIELD_CLASS}">
                    <label class="text-xs font-black uppercase tracking-wide text-blue-900">Formato</label>
                    <select data-category-feature-type class="w-full min-w-0 rounded-lg border-2 border-blue-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-900/20">
                        <option value="text">Texto</option>
                        <option value="number">Número</option>
                        <option value="boolean">Sim/Não</option>
                        <option value="date">Data</option>
                    </select>
                </div>
                <label class="${CATEGORY_FEATURE_REPEATABLE_CLASS}" title="Permitir vários valores para esta característica">
                    <input type="checkbox" data-category-feature-repeatable class="h-4 w-4 rounded border-blue-200 text-blue-900 focus:ring-blue-900">
                    <span>Múltipla</span>
                </label>
                <button type="button" class="${CATEGORY_FEATURE_REMOVE_CLASS}" title="Remover feature" aria-label="Remover feature">×</button>
            `;

    const select = row.querySelector("[data-category-feature-type]");
    if (select) select.value = feature.feature_type || feature.type || "text";

    const repeatableCheckbox = row.querySelector("[data-category-feature-repeatable]");
    if (repeatableCheckbox) repeatableCheckbox.checked = isFeatureRepeatable(feature);

    const removeBtn = row.querySelector("button");
    if (removeBtn) removeBtn.addEventListener("click", () => row.remove());

    container.appendChild(row);
}

function preencherFeaturesCategoriaModal(features = []) {
    const container = document.getElementById("categoryFeaturesRows");
    if (!container) return;

    container.innerHTML = "";

    if (features.length) {
        features.forEach(feature => adicionarLinhaFeatureCategoria(feature));
    } else {
        adicionarLinhaFeatureCategoria();
    }
}

function limparFeaturesCategoriaModal() {
    preencherFeaturesCategoriaModal([]);
}

function recolherFeaturesCategoria() {
    const rows = Array.from(document.querySelectorAll("#categoryFeaturesRows > div"));
    return rows.map(row => {
        const name = buildFeatureNameForSave(row.querySelector("[data-category-feature-name]")?.value || "");
        const featureType = row.querySelector("[data-category-feature-type]")?.value || "text";
        const isRepeatable = Boolean(row.querySelector("[data-category-feature-repeatable]")?.checked);
        const featureId = row.dataset.featureId || "";
        const payload = { feature_name: name, feature_type: featureType, is_repeatable: isRepeatable };

        if (featureId) payload.feature_id = Number(featureId);

        return payload;
    }).filter(feature => feature.feature_name);
}

function atualizarSelectsDosModais() {
    preencherSelectModal("new-location-manager", cacheUtilizadores, getUserId, user => `${getUserEmail(user)} (${getUserRole(user)})`, "Sem gestor associado");
    preencherSelectModal("new-asset-location", cacheLocais, getLocationId, getLocationName, "Selecionar local");
    preencherSelectModal("new-asset-category", cacheCategorias, getCategoryId, getCategoryName, "Selecionar categoria");
}

function definirModoModalAtivo(asset = null) {
    const editingIdInput = document.getElementById("editing-asset-id");
    const title = document.getElementById("modalAtivoTitulo");
    const submitButton = document.getElementById("modalAtivoSubmit");
    const serialInput = document.getElementById("new-asset-serial");
    const serialHelp = document.getElementById("assetSerialHelp");

    if (editingIdInput) editingIdInput.value = asset ? String(getAssetId(asset)) : "";
    if (title) title.innerText = asset ? "Editar Ativo" : "Novo Ativo";
    if (submitButton) submitButton.innerText = asset ? "Atualizar" : "Guardar";

    if (serialInput) {
        serialInput.readOnly = Boolean(asset);
        serialInput.classList.toggle("bg-gray-100", Boolean(asset));
        serialInput.classList.toggle("cursor-not-allowed", Boolean(asset));
    }

    if (serialHelp) {
        serialHelp.classList.toggle("hidden", !asset);
    }
}

function definirValorControl(input, rawValue) {
    if (!input) return;

    if (input.tagName === "SELECT") {
        const normalized = String(rawValue).toLowerCase();
        input.value = ["true", "1", "sim", "yes"].includes(normalized)
            ? "true"
            : (["false", "0", "nao", "não", "no"].includes(normalized) ? "false" : "");
    } else {
        input.value = rawValue ?? "";
    }
}

function preencherSpecsAtivo(asset) {
    const specsByFeatureId = {};
    const details = getAssetSpecsDetails(asset);

    details.forEach(detail => {
        const featureId = getFeatureId(detail);
        const value = primeiroValor(detail, ["spec_value", "value", "valor"], "");
        if (featureId) specsByFeatureId[String(featureId)] = value;
    });

    const specs = asset && asset.specs && typeof asset.specs === "object" ? asset.specs : {};
    const features = getCategoryFeatures(getAssetCategoryId(asset));
    Object.entries(specs).forEach(([key, value]) => {
        const feature = features.find(f => String(getFeatureName(f)) === String(key) || String(getFeatureRawName(f)) === String(key) || String(getFeatureId(f)) === String(key));
        if (feature) specsByFeatureId[String(getFeatureId(feature))] = value;
    });

    document.querySelectorAll("[data-spec-feature-id]").forEach(group => {
        const featureId = group.dataset.specFeatureId;
        if (!featureId || !Object.prototype.hasOwnProperty.call(specsByFeatureId, featureId)) return;

        const categoryId = getAssetCategoryId(asset);
        const feature = getCategoryFeatures(categoryId).find(f => String(getFeatureId(f)) === String(featureId));
        const valuesContainer = group.querySelector(".asset-spec-values");
        if (!feature || !valuesContainer) return;

        const values = decodeSpecValue(specsByFeatureId[featureId]);
        valuesContainer.innerHTML = "";

        const repeatable = isFeatureRepeatable(feature);
        const valuesToRender = repeatable ? values : values.slice(0, 1);

        if (valuesToRender.length) {
            valuesToRender.forEach(value => {
                valuesContainer.insertAdjacentHTML("beforeend", renderSpecValueRow(feature, value, repeatable));
            });
        } else {
            valuesContainer.insertAdjacentHTML("beforeend", renderSpecValueRow(feature, "", repeatable));
        }
    });
}

async function abrirModalAtivo(asset = null) {
    atualizarSelectsDosModais();
    const form = document.getElementById("formAtivo");
    if (form) form.reset();

    definirModoModalAtivo(asset);
    renderAssetSpecsFields([]);

    if (asset) {
        const serialInput = document.getElementById("new-asset-serial");
        const categorySelect = document.getElementById("new-asset-category");
        const locationSelect = document.getElementById("new-asset-location");
        const stateSelect = document.getElementById("new-asset-state");
        const assignedInput = document.getElementById("new-asset-assigned");
        const maintenanceInput = document.getElementById("new-asset-maintenance");
        const lastMaintenanceInput = document.getElementById("new-asset-last-maintenance");
        const categoryId = getAssetCategoryId(asset);

        if (serialInput) serialInput.value = getAssetSerial(asset);
        if (categorySelect) categorySelect.value = String(categoryId || "");
        if (locationSelect) locationSelect.value = String(getAssetLocationId(asset) || "");
        if (stateSelect) stateSelect.value = getAssetStatus(asset);
        if (assignedInput) assignedInput.value = getAssetAssigned(asset) === "-" ? "" : getAssetAssigned(asset);
        if (maintenanceInput) maintenanceInput.value = getAssetMaintenancePeriod(asset);
        if (lastMaintenanceInput) lastMaintenanceInput.value = formatDateForInput(getAssetLastMaintenance(asset));

        if (categoryId) {
            try {
                const features = await carregarFeaturesCategoria(categoryId);
                renderAssetSpecsFields(features);
                preencherSpecsAtivo(asset);
            } catch (error) {
                console.warn("[Dashboard] Não foi possível carregar as características do ativo:", error);
                mostrarToast("Não foi possível carregar as características do ativo.", true);
            }
        }
    }

    abrirModal("modalAtivo");
}

function editarAtivo(assetId) {
    const asset = cacheAtivos.find(a => String(getAssetId(a)) === String(assetId));
    if (!asset) {
        mostrarToast("Ativo não encontrado.", true);
        return;
    }

    abrirModalAtivo(asset);
}

async function removerAtivo(assetId) {
    const asset = cacheAtivos.find(a => String(getAssetId(a)) === String(assetId));
    const assetLabel = asset ? `${getAssetCategory(asset)} #${getAssetId(asset)}` : `#${assetId}`;

    if (!confirm(`Tens a certeza que queres remover o ativo "${assetLabel}"?`)) return;

    try {
        await deleteJSON(`/assets/${assetId}`);
        mostrarToast("Ativo removido com sucesso.");
        await carregarDados();
    } catch (error) {
        mostrarToast(error.message, true);
    }
}

function renderDetailField(label, value) {
    const finalValue = value === undefined || value === null || String(value).trim() === "" ? "-" : value;
    return `
                <div class="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p class="text-xs font-extrabold uppercase text-blue-900">${escapeHTML(label)}</p>
                    <p class="mt-1 break-words text-sm font-semibold text-gray-900">${escapeHTML(finalValue)}</p>
                </div>
            `;
}

function formatSpecValueForDetail(feature, rawValue) {
    const values = decodeSpecValue(rawValue);
    const cleanValues = values.filter(value => value !== undefined && value !== null && String(value).trim() !== "");

    if (!cleanValues.length) return `<span class="text-gray-400">-</span>`;

    if (cleanValues.length > 1) {
        return `
                    <ul class="list-disc space-y-1 pl-5 text-sm text-gray-900">
                        ${cleanValues.map(value => `<li>${escapeHTML(formatBooleanSpecValue(value))}</li>`).join("")}
                    </ul>
                `;
    }

    return `<span class="text-sm font-semibold text-gray-900">${escapeHTML(formatBooleanSpecValue(cleanValues[0]))}</span>`;
}

function formatBooleanSpecValue(value) {
    const normalized = String(value).toLowerCase();
    if (["true", "1", "sim", "yes"].includes(normalized)) return "Sim";
    if (["false", "0", "nao", "não", "no"].includes(normalized)) return "Não";
    return value;
}

function renderAssetSpecsDetail(asset) {
    const details = getAssetSpecsDetails(asset);
    const activeFeatures = getCategoryFeatures(getAssetCategoryId(asset));
    const specsByFeatureId = {};
    const featureMap = new Map();

    activeFeatures.forEach(feature => {
        const featureId = String(getFeatureId(feature));
        if (featureId) featureMap.set(featureId, feature);
    });

    details.forEach(detail => {
        const featureId = String(getFeatureId(detail));
        if (!featureId) return;

        specsByFeatureId[featureId] = primeiroValor(detail, ["content", "spec_value", "value", "valor"], "");

        if (!featureMap.has(featureId)) {
            featureMap.set(featureId, {
                feature_id: featureId,
                feature_name: getFeatureName(detail),
                feature_type: getFeatureType(detail),
                is_multiple: isFeatureRepeatable(detail),
                is_repeatable: isFeatureRepeatable(detail),
                feature_is_active: primeiroValor(detail, ["feature_is_active", "is_active", "active"], false),
                is_active: primeiroValor(detail, ["feature_is_active", "is_active", "active"], false)
            });
        }
    });

    const specs = asset && asset.specs && typeof asset.specs === "object" ? asset.specs : {};
    Object.entries(specs).forEach(([key, value]) => {
        const feature = Array.from(featureMap.values()).find(f =>
            String(getFeatureName(f)) === String(key) ||
            String(getFeatureRawName(f)) === String(key) ||
            String(getFeatureId(f)) === String(key)
        );
        if (feature) specsByFeatureId[String(getFeatureId(feature))] = value;
    });

    const features = Array.from(featureMap.values());

    if (!features.length) {
        return `<p class="text-sm text-gray-500">Este ativo não tem características registadas.</p>`;
    }

    return `
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    ${features.map(feature => {
        const featureId = String(getFeatureId(feature));
        const rawValue = specsByFeatureId[featureId];
        const values = decodeSpecValue(rawValue);
        const hasMultipleValues = values.filter(value => value !== undefined && value !== null && String(value).trim() !== "").length > 1;
        const repeatable = isFeatureRepeatable(feature);
        return `
                            <div class="rounded-xl border border-gray-100 bg-gray-50 p-3 ${(hasMultipleValues || repeatable) ? "md:col-span-2" : ""}">
                                <div class="mb-1 flex flex-wrap items-center gap-2">
                                    <p class="text-xs font-extrabold uppercase text-blue-900">${escapeHTML(getFeatureName(feature))}</p>
                                </div>
                                ${formatSpecValueForDetail(feature, rawValue)}
                            </div>
                        `;
    }).join("")}
                </div>
            `;
}


function renderAssetDetail(asset) {
    const content = document.getElementById("assetDetailContent");
    const editButton = document.getElementById("assetDetailEditButton");
    if (!content) return;

    if (editButton) {
        editButton.dataset.assetId = getAssetId(asset);
        editButton.onclick = () => {
            fecharModal("modalDetalheAtivo");
            editarAtivo(getAssetId(asset));
        };
    }

    content.innerHTML = `
                <section>
                    <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Dados principais</h3>
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                        ${renderDetailField("Código interno", getAssetCode(asset))}
                        ${renderDetailField("ID técnico", `#${getAssetId(asset)}`)}
                        ${renderDetailField("Categoria", getAssetCategory(asset))}
                        ${renderDetailField("Local", getAssetLocation(asset))}
                        ${renderDetailField("Estado", getAssetStatus(asset))}
                        ${renderDetailField("Atribuído a", getAssetAssigned(asset))}
                        ${renderDetailField("Data de atribuição", formatarData(getAssetAssignedAt(asset)))}
                        ${renderDetailField("Data de registo", formatarData(getAssetRegistrationDate(asset)))}
                        ${renderDetailField("Última manutenção", formatarData(getAssetLastMaintenance(asset)))}
                        ${renderDetailField("Período manutenção", getAssetMaintenancePeriod(asset) ? `${getAssetMaintenancePeriod(asset)} meses` : "-")}
                    </div>
                </section>
                <section>
                    <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Características</h3>
                    ${renderAssetSpecsDetail(asset)}
                </section>
            `;
}

function auditDisplayText(items) {
    if (!Array.isArray(items)) return "";
    return items
        .map(item => `${item?.label || ""} ${item?.value || ""}`.trim())
        .filter(Boolean)
        .join(" ");
}

const AUDIT_HIDDEN_KEYS = new Set(["is_active", "active", "feature_is_active", "is_multiple", "is_repeatable", "repeatable", "multipla", "multiple"]);

function isAuditKeyHidden(key) {
    return AUDIT_HIDDEN_KEYS.has(String(key || "").trim().toLowerCase());
}

function formatAuditFallbackValue(value) {
    if (value === undefined || value === null || value === "") return "-";
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    if (Array.isArray(value)) {
        if (!value.length) return "-";
        return value.map(formatAuditFallbackValue).join(", ");
    }
    if (typeof value === "object") {
        return Object.entries(value)
            .filter(([key]) => !isAuditKeyHidden(key))
            .map(([key, nestedValue]) => `${humanizeAuditKey(key)}: ${formatAuditFallbackValue(nestedValue)}`)
            .join(" · ") || "-";
    }
    return String(value);
}

function humanizeAuditKey(key) {
    const labels = {
        asset_count: "N.º de ativos",
        asset_id: "ID do ativo",
        asset_state: "Estado",
        assigned_at: "Data de atribuição",
        assigned_to: "Atribuído a",
        category_id: "ID da categoria",
        category_name: "Categoria",
        content: "Conteúdo",
        created_at: "Criado em",
        email: "Email",
        feature_id: "ID da feature",
        feature_name: "Feature",
        feature_type: "Tipo",
        features: "Features",
        is_multiple: "Permite múltiplos valores",
        last_maintenance: "Última manutenção",
        location_id: "ID do local",
        location_manager_id: "ID do gestor",
        location_name: "Local",
        maintenance_period_months: "Período de manutenção",
        manager_email: "Email do gestor",
        manager_id: "ID do gestor",
        name: "Nome",
        registered_at: "Data de registo",
        registration_status: "Estado do registo",
        role: "Cargo",
        serial_number: "Número de série",
        specs: "Características",
        status: "Estado",
        user_id: "ID do utilizador"
    };

    return labels[key] || String(key || "Campo").replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}

function buildAuditItemsFromRawValue(rawValue) {
    if (!rawValue) return [];
    if (typeof rawValue !== "object" || Array.isArray(rawValue)) {
        return [{ label: "Valor", value: formatAuditFallbackValue(rawValue) }];
    }

    const items = [];
    Object.entries(rawValue).forEach(([key, value]) => {
        if (key === "specs_details" || isAuditKeyHidden(key)) return;

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

function isAuditDisplayItemHidden(item) {
    const key = item?.key || item?.field || item?.field_name || item?.name || "";
    if (isAuditKeyHidden(key)) return true;

    const label = normalizarTexto(item?.label || "");
    return ["ativo", "permite multiplos valores", "permite múltiplos valores", "multipla", "múltipla"].includes(label);
}

function getAuditItems(log, displayKey, rawKey) {
    const displayItems = log && Array.isArray(log[displayKey]) ? log[displayKey].filter(item => !isAuditDisplayItemHidden(item)) : [];
    if (displayItems.length) return displayItems;
    return buildAuditItemsFromRawValue(log ? log[rawKey] : null);
}

function renderAuditItemList(items, emptyText) {
    if (!items.length) {
        return `<p class="text-sm text-gray-500">${escapeHTML(emptyText)}</p>`;
    }

    return `
                <div class="grid grid-cols-1 gap-2">
                    ${items.map(item => `
                        <div class="rounded-lg border border-gray-100 bg-white px-3 py-2">
                            <p class="text-[11px] font-extrabold uppercase text-blue-900">${escapeHTML(item.label || "Campo")}</p>
                            <p class="mt-1 break-words text-sm font-semibold text-gray-900">${escapeHTML(item.value ?? "-")}</p>
                        </div>
                    `).join("")}
                </div>
            `;
}

function renderAuditChanges(log) {
    const changes = Array.isArray(log?.changes) ? log.changes.filter(change => !isAuditDisplayItemHidden(change)) : [];
    if (!changes.length) {
        return `<p class="text-sm text-gray-500">Sem diferenças diretas para comparar.</p>`;
    }

    return `
                <div class="space-y-2">
                    ${changes.map(change => `
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

function renderLogDetail(log) {
    const content = document.getElementById("logDetailContent");
    if (!content) return;

    const oldItems = getAuditItems(log, "old_value_display", "old_value");
    const newItems = getAuditItems(log, "new_value_display", "new_value");

    content.innerHTML = `
                <section>
                    <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Resumo</h3>
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
                        ${renderDetailField("Data/hora", formatarData(getLogDate(log)))}
                        ${renderDetailField("Utilizador", getLogUser(log))}
                        ${renderDetailField("Ação", getLogActionLabel(log))}
                        ${renderDetailField("Área", getLogTableLabel(log))}
                    </div>
                </section>
                <section>
                    <h3 class="mb-3 text-sm font-black uppercase text-blue-900">O que mudou</h3>
                    ${renderAuditChanges(log)}
                </section>
                <section class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div class="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Antes</h3>
                        ${renderAuditItemList(oldItems, "Sem valor anterior. Normalmente acontece quando o registo foi criado.")}
                    </div>
                    <div class="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Depois</h3>
                        ${renderAuditItemList(newItems, "Sem valor novo. Normalmente acontece quando o registo foi removido.")}
                    </div>
                </section>
            `;
}

async function verDetalheRegisto(logId) {
    let log = cacheRegistos.find(item => String(getLogId(item)) === String(logId));

    try {
        const response = await requestJSON(`/logs/${logId}`);
        if (response && response.data) log = response.data;
    } catch (error) {
        console.warn("[Dashboard] Não foi possível carregar detalhe do registo pela API; vou usar a cache.", error);
    }

    if (!log) {
        mostrarToast("Registo não encontrado.", true);
        return;
    }

    renderLogDetail(log);
    abrirModal("modalDetalheRegisto");
}

async function verDetalheAtivo(assetId) {
    let asset = cacheAtivos.find(a => String(getAssetId(a)) === String(assetId));

    try {
        const response = await requestJSON(`/assets/${assetId}`);
        if (response && response.data) asset = response.data;
    } catch (error) {
        console.warn("[Dashboard] Não foi possível carregar detalhe do ativo pela API; vou usar a cache.", error);
    }

    if (!asset) {
        mostrarToast("Ativo não encontrado.", true);
        return;
    }

    const categoryId = getAssetCategoryId(asset);
    if (categoryId) {
        try {
            await carregarFeaturesCategoria(categoryId);
        } catch (error) {
            console.warn("[Dashboard] Não foi possível carregar características da categoria.", error);
        }
    }

    renderAssetDetail(asset);
    abrirModal("modalDetalheAtivo");
}

function abrirModalCategoria() {
    const form = document.getElementById("formCategoria");
    if (form) form.reset();

    const editingIdInput = document.getElementById("editing-category-id");
    const title = document.getElementById("modalCategoriaTitulo");
    const submitButton = document.getElementById("modalCategoriaSubmit");

    if (editingIdInput) editingIdInput.value = "";
    if (title) title.innerText = "Nova Categoria";
    if (submitButton) submitButton.innerText = "Guardar";

    limparFeaturesCategoriaModal();
    abrirModal("modalCategoria");
}

async function editarCategoria(categoryId) {
    const category = cacheCategorias.find(c => String(getCategoryId(c)) === String(categoryId));
    if (!category) {
        mostrarToast("Categoria não encontrada.", true);
        return;
    }

    const form = document.getElementById("formCategoria");
    if (form) form.reset();

    const editingIdInput = document.getElementById("editing-category-id");
    const title = document.getElementById("modalCategoriaTitulo");
    const submitButton = document.getElementById("modalCategoriaSubmit");
    const nameInput = document.getElementById("new-category-name");

    if (editingIdInput) editingIdInput.value = String(categoryId);
    if (title) title.innerText = "Editar Categoria";
    if (submitButton) submitButton.innerText = "Atualizar";
    if (nameInput) nameInput.value = getCategoryName(category);

    let features = getCategoryFeatures(category);
    preencherFeaturesCategoriaModal(features);
    abrirModal("modalCategoria");

    if (!features.length) {
        try {
            features = await carregarFeaturesCategoria(categoryId);
            preencherFeaturesCategoriaModal(features);
        } catch (error) {
            console.warn("[Dashboard] Nao foi possivel carregar as features da categoria:", error);
            mostrarToast("Nao foi possivel carregar as features desta categoria.", true);
        }
    }
}

async function removerCategoria(categoryId) {
    const category = cacheCategorias.find(c => String(getCategoryId(c)) === String(categoryId));
    const categoryName = category ? getCategoryName(category) : `#${categoryId}`;

    if (!confirm(`Tens a certeza que queres remover a categoria "${categoryName}"?`)) {
        return;
    }

    try {
        await deleteJSON(`/categories/${categoryId}`);
        mostrarToast("Categoria removida com sucesso.");
        await carregarDados();
    } catch (error) {
        mostrarToast(error.message, true);
    }
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

async function listarAtivosCategoria(categoryId) {
    if (!categoryId) return;

    showView("ativos");
    setAssetFilterValue("assets-category", String(categoryId));
    resetarPaginaTabela("assets");
    setAssetsFilterDrawerOpen(false);

    try {
        await atualizarFeaturesCategoriaPesquisaAtivos();
        await renderAssetsTable();
    } finally {
        scrollParaTabelaAtivos();
    }
}

async function listarAtivosLocal(locationId) {
    if (!locationId) return;

    showView("ativos");
    setAssetFilterValue("assets-location", String(locationId));
    resetarPaginaTabela("assets");
    setAssetsFilterDrawerOpen(false);

    try {
        await renderAssetsTable();
    } finally {
        scrollParaTabelaAtivos();
    }
}

function ligarBotaoModal(buttonId, handler) {
    const button = document.getElementById(buttonId);
    if (!button || button.dataset.modalListenerAttached === "true") return;

    button.addEventListener("click", event => {
        event.preventDefault();
        handler();
    });
    button.dataset.modalListenerAttached = "true";
}

function ligarPeriodoGraficoRegistos() {
    const select = document.getElementById("logs-chart-period");
    if (!select || select.dataset.listenerAttached === "true") return;

    select.addEventListener("change", () => {
        inicializarGraficos();
    });

    select.dataset.listenerAttached = "true";
}

function ligarBotoesDosModais() {
    ligarBotaoModal("btnNovoUtilizador", abrirModalUtilizador);
    ligarBotaoModal("btnNovoLocal", abrirModalLocal);
    ligarBotaoModal("btnNovoAtivo", abrirModalAtivo);
    ligarBotaoModal("btnNovaCategoria", abrirModalCategoria);
    ligarBotaoModal("btnAdicionarSalaUtilizador", () => {
        const row = adicionarLinhaSalaUtilizador();
        garantirLinhaSalaUtilizador();
        row?.querySelector("[data-user-location-select]")?.focus();
    });
}

function ligarAcoesPaginacao() {
    if (document.body.dataset.paginationListenerAttached === "true") return;

    document.body.addEventListener("click", event => {
        const button = event.target.closest("[data-pagination-group][data-pagination-direction]");
        if (!button || button.disabled) return;

        event.preventDefault();
        mudarPaginaTabela(button.dataset.paginationGroup, button.dataset.paginationDirection);
    });

    document.body.dataset.paginationListenerAttached = "true";
}

function ligarAcoesSpecsRepetiveis() {
    if (document.body.dataset.repeatableSpecsListenerAttached === "true") return;

    document.body.addEventListener("click", event => {
        const button = event.target.closest("[data-spec-action]");
        if (!button) return;

        event.preventDefault();

        if (button.dataset.specAction === "add") {
            adicionarValorFeature(button.dataset.featureId);
        }

        if (button.dataset.specAction === "remove") {
            const row = button.closest(".asset-spec-value-row");
            const valuesContainer = button.closest(".asset-spec-values");
            if (!row || !valuesContainer) return;

            if (valuesContainer.querySelectorAll(".asset-spec-value-row").length <= 1) {
                row.querySelectorAll("input, select").forEach(input => input.value = "");
            } else {
                row.remove();
            }
        }
    });

    document.body.dataset.repeatableSpecsListenerAttached = "true";
}

function ligarAcoesGerais() {
    if (document.body.dataset.adminActionListenerAttached === "true") return;

    document.body.addEventListener("click", event => {
        const closeButton = event.target.closest("[data-close-modal]");
        if (closeButton) {
            event.preventDefault();
            fecharModal(closeButton.dataset.closeModal);
            return;
        }

        const clearFilterButton = event.target.closest("[data-clear-filter]");
        if (clearFilterButton) {
            event.preventDefault();
            limparFiltros(clearFilterButton.dataset.clearFilter);
            return;
        }

        const actionButton = event.target.closest("[data-admin-action]");
        if (!actionButton) return;

        event.preventDefault();
        const action = actionButton.dataset.adminAction;

        if (action === "not-implemented") {
            const label = actionButton.dataset.adminActionLabel || "Esta ação";
            mostrarToast(`${label} ainda não está implementado nesta área.`, true);
        }
    });

    document.body.dataset.adminActionListenerAttached = "true";
}

function ligarAcoesAtivos() {
    const tbody = document.getElementById("assetsTableBody");
    if (!tbody || tbody.dataset.assetActionsListenerAttached === "true") return;

    tbody.addEventListener("click", event => {
        const button = event.target.closest("[data-asset-action]");

        if (button) {
            event.preventDefault();
            event.stopPropagation();
            const assetId = button.dataset.assetId;
            if (!assetId) return;

            if (button.dataset.assetAction === "view") {
                verDetalheAtivo(assetId);
            }

            if (button.dataset.assetAction === "edit") {
                editarAtivo(assetId);
            }

            if (button.dataset.assetAction === "remove") {
                removerAtivo(assetId);
            }

            return;
        }

        const row = event.target.closest("[data-asset-row-id]");
        if (row?.dataset.assetRowId) {
            verDetalheAtivo(row.dataset.assetRowId);
        }
    });

    tbody.dataset.assetActionsListenerAttached = "true";
}

function ligarAcoesCategorias() {
    const tbody = document.getElementById("categoriesTableBody");
    if (!tbody || tbody.dataset.listenerAttached === "true") return;

    tbody.addEventListener("click", event => {
        const button = event.target.closest("[data-category-action]");
        if (!button) return;

        const categoryId = button.dataset.categoryId;
        if (!categoryId) return;

        if (button.dataset.categoryAction === "assets") {
            listarAtivosCategoria(categoryId);
        }

        if (button.dataset.categoryAction === "edit") {
            editarCategoria(categoryId);
        }

        if (button.dataset.categoryAction === "remove") {
            removerCategoria(categoryId);
        }
    });

    tbody.dataset.listenerAttached = "true";
}

function ligarAcoesRegistos() {
    const tbody = document.getElementById("logsTableBody");
    if (!tbody || tbody.dataset.logActionsListenerAttached === "true") return;

    tbody.addEventListener("click", event => {
        const row = event.target.closest("[data-log-id]");
        if (!row) return;

        event.preventDefault();
        verDetalheRegisto(row.dataset.logId);
    });

    tbody.dataset.logActionsListenerAttached = "true";
}

function ligarModais() {
    const categorySelect = document.getElementById("new-asset-category");
    if (categorySelect && categorySelect.dataset.listenerAttached !== "true") {
        categorySelect.addEventListener("change", atualizarCamposSpecsDoAtivo);
        categorySelect.dataset.listenerAttached = "true";
    }

    const assetStateSelect = document.getElementById("new-asset-state");
    if (assetStateSelect && assetStateSelect.dataset.listenerAttached !== "true") {
        assetStateSelect.addEventListener("change", () => {
            const lastMaintenanceInput = document.getElementById("new-asset-last-maintenance");
            if (assetStateSelect.value === "Bom Estado" && lastMaintenanceInput) {
                lastMaintenanceInput.value = getTodayInputValue();
            }
        });
        assetStateSelect.dataset.listenerAttached = "true";
    }

    const formAtivo = document.getElementById("formAtivo");
    if (formAtivo && formAtivo.dataset.listenerAttached !== "true") {
        formAtivo.addEventListener("submit", async event => {
            event.preventDefault();
            const editingAssetId = document.getElementById("editing-asset-id")?.value || "";
            const payload = {
                serial_number: document.getElementById("new-asset-serial").value.trim(),
                category_id: Number(document.getElementById("new-asset-category").value),
                location_id: Number(document.getElementById("new-asset-location").value),
                asset_state: document.getElementById("new-asset-state").value,
                assigned_to: document.getElementById("new-asset-assigned").value.trim(),
                maintenance_period_months: document.getElementById("new-asset-maintenance").value || null,
                last_maintenance: document.getElementById("new-asset-last-maintenance")?.value || null,
                specs: recolherSpecsAtivo()
            };

            try {
                if (editingAssetId) {
                    await putJSON(`/assets/${editingAssetId}`, payload);
                } else {
                    await postJSON("/assets/", payload);
                }

                fecharModal("modalAtivo");
                mostrarToast(editingAssetId ? "Ativo atualizado com sucesso." : "Ativo criado com sucesso.");
                await carregarDados();
            } catch (error) {
                mostrarToast(error.message, true);
            }
        });
        formAtivo.dataset.listenerAttached = "true";
    }

    const formCategoria = document.getElementById("formCategoria");
    if (formCategoria && formCategoria.dataset.listenerAttached !== "true") {
        formCategoria.addEventListener("submit", async event => {
            event.preventDefault();

            const editingCategoryId = document.getElementById("editing-category-id")?.value || "";
            const payload = {
                category_name: document.getElementById("new-category-name").value.trim(),
                features: recolherFeaturesCategoria()
            };

            try {
                if (editingCategoryId) {
                    await putJSON(`/categories/${editingCategoryId}`, payload);
                } else {
                    await postJSON("/categories/", payload);
                }

                fecharModal("modalCategoria");
                mostrarToast(editingCategoryId ? "Categoria atualizada com sucesso." : "Categoria criada com sucesso.");
                await carregarDados();
            } catch (error) {
                mostrarToast(error.message, true);
            }
        });
        formCategoria.dataset.listenerAttached = "true";
    }
}

function exporFuncoesGlobais() {
    Object.assign(window, {
        showView,
        renderDashboardUsersTable,
        renderUsersTable,
        renderLocationsTable,
        renderAssetsTable,
        adicionarFiltroSpecAtivo,
        renderCategoriesTable,
        renderLogsTable,
        verDetalheRegisto,
        mudarPaginaTabela,
        limparFiltros,
        abrirModalUtilizador,
        abrirModalTransferenciaAdmin,
        abrirModalLocal,
        abrirModalAtivo,
        abrirModalCategoria,
        editarUtilizador,
        removerUtilizador,
        editarLocal,
        removerLocal,
        editarAtivo,
        removerAtivo,
        verDetalheAtivo,
        adicionarValorFeature,
        editarCategoria,
        removerCategoria,
        listarAtivosCategoria,
        listarAtivosLocal,
        fecharModal,
        adicionarLinhaFeatureCategoria,
        logout: window.logout
    });
}

async function inicializarPagina() {
    if (paginaInicializada) return;
    paginaInicializada = true;

    exporFuncoesGlobais();
    carregarPreferenciasColunasAtivos();
    aplicarEstilosTailwindDashboard();
    iniciarObservadorTailwindDashboard();
    ligarBotoesDosModais();
    ligarPeriodoGraficoRegistos();
    ligarFiltros();
    ligarFiltrosSpecsAtivos();
    ligarDrawerFiltrosAtivos();
    ligarDrawersFiltrosConsultas();
    ligarPainelColunasAtivos();
    ligarFormularioUtilizador();
    ligarFormularioLocal();
    ligarModais();
    ligarAcoesUtilizadores();
    ligarAcoesLocais();
    ligarAcoesAtivos();
    ligarAcoesCategorias();
    ligarAcoesRegistos();
    ligarAcoesPaginacao();
    ligarAcoesSpecsRepetiveis();
    ligarAcoesGerais();
    ligarAcoesTransferenciaAdmin();
    await recarregarDados();
}

exporFuncoesGlobais();

async function executarInicializacaoAdmin() {
    await window.InvUBILayout?.mountDashboardLayout({
        role: "admin",
        title: "DASHBOARD",
        activeView: "dashboard",
        avatarText: "AD"
    });

    const user = await initDashboard({
        expectedRole: "Administrador",
        avatarText: "AD",
        emailElementIds: ["userEmail", "adminEmail"]
    });

    if (!user) return;

    inserirBotaoTransferenciaAdmin();
    await inicializarPagina();
}

function initAdminDashboard() {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", executarInicializacaoAdmin, { once: true });
    } else {
        executarInicializacaoAdmin();
    }
}

window.initAdminDashboard = initAdminDashboard;
initAdminDashboard();
