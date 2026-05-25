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

        const TABLE_PAGE_SIZE = 10;
        const ASSET_SEARCH_DEBOUNCE_MS = 250;
        const tablePaginationState = {
            dashboardUsers: 1,
            users: 1,
            locations: 1,
            assets: 1,
            categories: 1,
            logs: 1
        };

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
            locations: ["locations-search", "locations-status", "locations-sort"],
            assets: ["assets-search", "assets-category", "assets-location", "assets-status", "assets-assignment", "assets-sort"],
            categories: ["categories-search", "categories-sort"],
            logs: ["logs-search", "logs-user", "logs-action", "logs-sort"]
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
        }

        function popularOpcoesDosFiltros() {
            popularSelect("dash-users-role", valoresUnicos(cacheUtilizadores.map(getUserRole)), "Todos");
            popularSelect("dash-users-status", valoresUnicos(cacheUtilizadores.map(getUserStatus)), "Todos");

            popularSelect("users-role", valoresUnicos(cacheUtilizadores.map(getUserRole)), "Todos");
            popularSelect("users-status", valoresUnicos(cacheUtilizadores.map(getUserStatus)), "Todos");

            popularSelect("locations-status", valoresUnicos(cacheLocais.map(getLocationStatus)), "Todos");

            popularSelectFromRecords("assets-category", cacheCategorias, getCategoryId, getCategoryName, "Todas");
            popularSelectFromRecords("assets-location", cacheLocais, getLocationId, getLocationName, "Todas");
            popularSelect("assets-status", valoresUnicos(cacheAtivos.map(getAssetStatus)), "Todos");
            popularOpcoesFeaturesSpecsAtivos();

            popularSelect("logs-user", valoresUnicos(cacheRegistos.map(getLogUser)), "Todos");
            popularSelect("logs-action", valoresUnicos(cacheRegistos.map(getLogAction)), "Todas");
        }

        function renderDashboardUsersTable() {
            const tbody = document.getElementById("usersTableBody");
            if (!tbody) return;

            const usersFiltrados = filtrarUtilizadores("dash-users");
            atualizarContador("dashUsersResultCount", usersFiltrados.length, cacheUtilizadores.length);

            const pagination = obterPaginaTabela("dashboardUsers", usersFiltrados);
            renderPagination("dashboardUsers", pagination);
            const users = pagination.items;

            if (!users.length) {
                renderEmptyRow(tbody, 4, "Nenhum utilizador encontrado.");
                return;
            }

            tbody.innerHTML = users.map(u => `
                <tr class="border-b">
                    <td class="px-4 py-3">${escapeHTML(getUserId(u))}</td>
                    <td class="px-4 py-3 font-semibold">${escapeHTML(getUserEmail(u))}</td>
                    <td class="px-4 py-3">${escapeHTML(getUserRole(u))}</td>
                    <td class="px-4 py-3">${statusBadge(getUserStatus(u))}</td>
                </tr>
            `).join("");
        }

        function renderUsersTable() {
            const tbody = document.getElementById("fullUsersTableBody");
            if (!tbody) return;

            const usersFiltrados = filtrarUtilizadores("users");
            atualizarContador("usersResultCount", usersFiltrados.length, cacheUtilizadores.length);

            const pagination = obterPaginaTabela("users", usersFiltrados);
            renderPagination("users", pagination);
            const users = pagination.items;

            if (!users.length) {
                renderEmptyRow(tbody, 5, "Nenhum utilizador encontrado.");
                return;
            }

            tbody.innerHTML = users.map(u => `
                <tr class="border-b">
                    <td class="px-4 py-3">${escapeHTML(getUserId(u))}</td>
                    <td class="px-4 py-3">${escapeHTML(getUserEmail(u))}</td>
                    <td class="px-4 py-3">${escapeHTML(getUserRole(u))}</td>
                    <td class="px-4 py-3">${statusBadge(getUserStatus(u))}</td>
                    <td class="px-4 py-3 text-right">
                        <button type="button" data-user-action="edit" data-user-id="${escapeHTML(getUserId(u))}" class="text-blue-600 hover:underline text-sm mr-2">Editar</button>
                        <button type="button" data-user-action="remove" data-user-id="${escapeHTML(getUserId(u))}" class="text-red-600 hover:underline text-sm">Remover</button>
                    </td>
                </tr>
            `).join("");
        }

        function renderLocationsTable() {
            const tbody = document.getElementById("locationsTableBody");
            if (!tbody) return;

            let locations = [...cacheLocais];
            const termo = getInputValue("locations-search");
            const estado = getInputValue("locations-status");

            locations = locations.filter(l => {
                const matchesSearch = textoIncluiTermo([
                    getLocationId(l),
                    getLocationName(l),
                    getLocationStatus(l)
                ], termo);

                const matchesStatus = !estado || normalizarTexto(getLocationStatus(l)) === normalizarTexto(estado);

                return matchesSearch && matchesStatus;
            });

            locations = ordenarRegistos(locations, getInputValue("locations-sort"), {
                "name-asc": { accessor: getLocationName, dir: 1, type: "text" },
                "name-desc": { accessor: getLocationName, dir: -1, type: "text" },
                "id-asc": { accessor: getLocationId, dir: 1, type: "text" },
                "id-desc": { accessor: getLocationId, dir: -1, type: "text" },
                "status-asc": { accessor: getLocationStatus, dir: 1, type: "text" }
            });

            atualizarContador("locationsResultCount", locations.length, cacheLocais.length);

            const pagination = obterPaginaTabela("locations", locations);
            renderPagination("locations", pagination);
            locations = pagination.items;

            if (!locations.length) {
                renderEmptyRow(tbody, 4, "Nenhum local encontrado.");
                return;
            }

            tbody.innerHTML = locations.map(l => `
                <tr class="border-b">
                    <td class="px-4 py-3">#${escapeHTML(getLocationId(l))}</td>
                    <td class="px-4 py-3 font-semibold">${escapeHTML(getLocationName(l))}</td>
                    <td class="px-4 py-3">${statusBadge(getLocationStatus(l))}</td>
                    <td class="px-4 py-3 text-right">
                        <button type="button" data-location-action="edit" data-location-id="${escapeHTML(getLocationId(l))}" class="text-blue-600 hover:underline text-sm mr-2">Editar</button>
                        <button type="button" data-location-action="remove" data-location-id="${escapeHTML(getLocationId(l))}" class="text-red-600 hover:underline text-sm">Remover</button>
                    </td>
                </tr>
            `).join("");
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

        function popularOpcoesFeaturesSpecsAtivos() {
            const selects = document.querySelectorAll("[data-asset-spec-filter-feature]");
            if (!selects.length) return;

            const features = getTodasFeaturesAtivas();

            selects.forEach(select => {
                const valorAtual = select.value;
                select.innerHTML = `<option value="">Selecionar característica</option>` + features.map(feature => {
                    const label = `${feature.category_name} · ${feature.feature_name} (${getFeatureTypeLabel(feature)})`;
                    return `<option value="${escapeHTML(feature.feature_id)}">${escapeHTML(label)}</option>`;
                }).join("");

                if (features.some(feature => String(feature.feature_id) === String(valorAtual))) {
                    select.value = valorAtual;
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

            const emptyMessage = container.querySelector(".asset-spec-filter-empty");
            if (emptyMessage) emptyMessage.remove();

            const row = document.createElement("div");
            row.className = "asset-spec-filter-row";
            row.dataset.assetSpecFilterRow = "true";
            row.innerHTML = `
                <div>
                    <label>Característica</label>
                    <select data-asset-spec-filter-feature></select>
                </div>
                <div>
                    <label>Operador</label>
                    <select data-asset-spec-filter-operator>
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
                <div>
                    <label>Valor</label>
                    <input type="text" data-asset-spec-filter-value placeholder="Ex.: 16GB, DDR4, 2026-12-31">
                </div>
                <button type="button" class="asset-spec-filter-remove" data-asset-spec-filter-remove>Remover</button>
            `;

            container.appendChild(row);
            popularOpcoesFeaturesSpecsAtivos();

            const featureSelect = row.querySelector("[data-asset-spec-filter-feature]");
            const operatorSelect = row.querySelector("[data-asset-spec-filter-operator]");
            const valueInput = row.querySelector("[data-asset-spec-filter-value]");

            if (featureSelect && filtro.feature_id) featureSelect.value = String(filtro.feature_id);
            if (operatorSelect && filtro.operator) operatorSelect.value = String(filtro.operator);
            if (valueInput && filtro.value !== undefined) valueInput.value = String(filtro.value);

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
                    resetarPaginaTabela("assets");
                    agendarRenderAssetsTable();
                });
            }
        }

        function garantirMensagemFiltrosSpecsAtivos() {
            const container = document.getElementById("assetSpecFiltersRows");
            if (!container) return;

            if (!container.querySelector("[data-asset-spec-filter-row]")) {
                container.innerHTML = `<p class="asset-spec-filter-empty">Sem filtros avançados ativos.</p>`;
            }
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

        async function renderAssetsTable() {
            const tbody = document.getElementById("assetsTableBody");
            if (!tbody) return;

            const requestId = ++ativosSearchRequestId;
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-4 py-6 text-center text-sm text-gray-500">
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
                    renderEmptyRow(tbody, 7, "Nenhum ativo encontrado.");
                    return;
                }

                tbody.innerHTML = assets.map(a => `
                    <tr class="border-b cursor-pointer hover:bg-blue-50/40" data-asset-row-id="${escapeHTML(getAssetId(a))}" title="Clicar para ver detalhes do ativo">
                        <td class="px-4 py-3">
                            <div class="font-semibold text-blue-900">${escapeHTML(getAssetCode(a))}</div>
                            <div class="text-xs text-gray-500">ID #${escapeHTML(getAssetId(a))}</div>
                        </td>
                        <td class="px-4 py-3 font-semibold">${escapeHTML(getAssetCategory(a))}</td>
                        <td class="px-4 py-3">${escapeHTML(getAssetLocation(a))}</td>
                        <td class="px-4 py-3">${statusBadge(getAssetStatus(a))}</td>
                        <td class="px-4 py-3 font-semibold">${escapeHTML(getAssetAssigned(a))}</td>
                        <td class="px-4 py-3">${escapeHTML(formatarData(getAssetRegistrationDate(a)))}</td>
                        <td class="px-4 py-3 text-right">
                            <button type="button" data-asset-action="view" data-asset-id="${escapeHTML(getAssetId(a))}" class="text-blue-900 hover:underline text-sm mr-2">Ver</button>
                            <button type="button" data-asset-action="edit" data-asset-id="${escapeHTML(getAssetId(a))}" class="text-blue-600 hover:underline text-sm mr-2">Editar</button>
                            <button type="button" data-asset-action="remove" data-asset-id="${escapeHTML(getAssetId(a))}" class="text-red-600 hover:underline text-sm">Remover</button>
                        </td>
                    </tr>
                `).join("");
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
                renderEmptyRow(tbody, 7, error.message || "Não foi possível pesquisar ativos.");
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
                <tr class="border-b">
                    <td class="px-4 py-3">#${escapeHTML(getCategoryId(c))}</td>
                    <td class="px-4 py-3 font-semibold">${escapeHTML(getCategoryName(c))}</td>
                    <td class="px-4 py-3">${renderCategoryFeatures(getCategoryFeatures(c))}</td>
                    <td class="px-4 py-3 text-right">
                        <button type="button" data-category-action="edit" data-category-id="${escapeHTML(getCategoryId(c))}" class="text-blue-600 hover:underline text-sm mr-2">Editar</button>
                        <button type="button" data-category-action="remove" data-category-id="${escapeHTML(getCategoryId(c))}" class="text-red-600 hover:underline text-sm">Remover</button>
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

            logs = logs.filter(log => {
                const matchesSearch = textoIncluiTermo([
                    getLogDate(log),
                    getLogUser(log),
                    getLogAction(log),
                    getLogDetails(log)
                ], termo);

                const matchesUser = !utilizador || normalizarTexto(getLogUser(log)) === normalizarTexto(utilizador);
                const matchesAction = !acao || normalizarTexto(getLogAction(log)) === normalizarTexto(acao);

                return matchesSearch && matchesUser && matchesAction;
            });

            logs = ordenarRegistos(logs, getInputValue("logs-sort"), {
                "date-desc": { accessor: getLogDate, dir: -1, type: "date" },
                "date-asc": { accessor: getLogDate, dir: 1, type: "date" },
                "user-asc": { accessor: getLogUser, dir: 1, type: "text" },
                "action-asc": { accessor: getLogAction, dir: 1, type: "text" }
            });

            atualizarContador("logsResultCount", logs.length, cacheRegistos.length);

            const pagination = obterPaginaTabela("logs", logs);
            renderPagination("logs", pagination);
            logs = pagination.items;

            if (!logs.length) {
                renderEmptyRow(tbody, 4, "Nenhum registo encontrado.");
                return;
            }

            tbody.innerHTML = logs.map(log => `
                <tr class="border-b">
                    <td class="px-4 py-3">${escapeHTML(formatarData(getLogDate(log)))}</td>
                    <td class="px-4 py-3">${escapeHTML(getLogUser(log))}</td>
                    <td class="px-4 py-3 font-semibold">${escapeHTML(getLogAction(log))}</td>
                    <td class="px-4 py-3">${escapeHTML(getLogDetails(log))}</td>
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
                <span class="table-pagination-info">${escapeHTML(info)}</span>
                <div class="table-pagination-actions">
                    <button type="button" class="table-pagination-button" data-pagination-group="${escapeHTML(grupo)}" data-pagination-direction="prev" ${isFirstPage ? "disabled" : ""}>Anterior</button>
                    <button type="button" class="table-pagination-button" data-pagination-group="${escapeHTML(grupo)}" data-pagination-direction="next" ${isLastPage ? "disabled" : ""}>Seguinte</button>
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
                    specFilters.innerHTML = `<p class="asset-spec-filter-empty">Sem filtros avançados ativos.</p>`;
                }
            }

            renderPorGrupo(grupo);
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
                        agendarRenderAssetsTable();
                        return;
                    }
                    callback();
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

        function criarDadosRegistosMensais() {
            if (!cacheRegistos.length) {
                return {
                    labels: ["Sem dados"],
                    values: [0]
                };
            }

            const meses = new Map();

            cacheRegistos.forEach(log => {
                const data = new Date(getLogDate(log));
                if (Number.isNaN(data.getTime())) return;

                const chave = data.toLocaleDateString("pt-PT", {
                    month: "short",
                    year: "numeric"
                });

                meses.set(chave, (meses.get(chave) || 0) + 1);
            });

            if (!meses.size) {
                return {
                    labels: ["Sem dados"],
                    values: [0]
                };
            }

            return {
                labels: Array.from(meses.keys()),
                values: Array.from(meses.values())
            };
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
                const estado = getAssetStatus(a);
                estados.set(estado, (estados.get(estado) || 0) + 1);
            });

            return {
                labels: Array.from(estados.keys()),
                values: Array.from(estados.values())
            };
        }

        function inicializarGraficos() {
            if (typeof Chart === "undefined") {
                console.warn("[Dashboard] Chart.js nao esta carregado; os graficos foram ignorados.");
                return;
            }

            const canvasRegistos = document.getElementById("chartRegistos");
            const dadosRegistos = criarDadosRegistosMensais();

            if (canvasRegistos) {
                if (meuGraficoRegistos) meuGraficoRegistos.destroy();

                meuGraficoRegistos = new Chart(canvasRegistos.getContext("2d"), {
                    type: "line",
                    data: {
                        labels: dadosRegistos.labels,
                        datasets: [{
                            label: "Registos",
                            data: dadosRegistos.values,
                            borderColor: "#1e3a8a",
                            tension: 0.2,
                            fill: false
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                });
            }

            const canvasAtividade = document.getElementById("chartAtividade");
            const dadosAtividade = criarDadosAtividadePorEstado();

            if (canvasAtividade) {
                if (meuGraficoAtividade) meuGraficoAtividade.destroy();

                meuGraficoAtividade = new Chart(canvasAtividade.getContext("2d"), {
                    type: "doughnut",
                    data: {
                        labels: dadosAtividade.labels,
                        datasets: [{
                            data: dadosAtividade.values,
                            backgroundColor: ["#1e3a8a", "#3b82f6", "#93c5fd", "#f59e0b", "#ef4444", "#10b981"]
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
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

            select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` + opcoes
                .map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`)
                .join("");

            if (opcoes.some(v => String(v) === String(valorAtual))) {
                select.value = valorAtual;
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

            select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` + records
                .map(item => `<option value="${escapeHTML(item.value)}">${escapeHTML(item.label)}</option>`)
                .join("");

            if (records.some(item => String(item.value) === String(valorAtual))) {
                select.value = valorAtual;
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

        function getUserId(u) {
            return primeiroValor(u, ["user_id", "id", "id_user"], "-");
        }

        function getUserEmail(u) {
            return primeiroValor(u, ["email", "user_email", "username"], "Sem email");
        }

        function getUserRole(u) {
            return primeiroValor(u, ["role", "cargo", "tipo", "user_role"], "Utilizador");
        }

        function getUserStatus(u) {
            const status = primeiroValor(u, ["status", "estado"], "");
            if (status) return status;

            if (u && (u.is_active === false || u.active === false)) return "Inativo";
            return "Ativo";
        }

        function getUserLocationIds(u) {
            if (!u) return [];

            const directValues = [u.location_ids, u.managed_location_ids, u.local_ids, u.locations_ids];
            for (const value of directValues) {
                if (Array.isArray(value)) return value.map(String);
            }

            const singleLocationId = primeiroValor(u, ["location_id", "local_id", "id_location", "id_local"], "");
            if (singleLocationId) return [String(singleLocationId)];

            const userId = String(getUserId(u));
            return cacheLocais
                .filter(location => String(getLocationManagerId(location)) === userId)
                .map(location => String(getLocationId(location)));
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

        function getLocationManagerId(l) {
            return primeiroValor(l, ["location_manager_id", "manager_id", "gestor_id", "user_id"], "");
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
                            <span class="font-normal text-blue-700">(${escapeHTML(getFeatureTypeLabel(feature))}${isFeatureRepeatable(feature) ? ", múltipla" : ""})</span>
                        </span>
                    `).join("")}
                </div>
            `;
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

            if (["ativo", "ativa", "operacional", "bom", "disponivel", "ok"].includes(normalizado)) {
                classes = "bg-green-100 text-green-800";
            } else if (["inativo", "inativa", "removido", "removida", "danificado", "danificada", "erro"].includes(normalizado)) {
                classes = "bg-red-100 text-red-800";
            } else if (["manutencao", "pendente", "reservado", "reservada"].includes(normalizado)) {
                classes = "bg-yellow-100 text-yellow-800";
            }

            return `<span class="px-2 py-1 rounded text-xs ${classes}">${escapeHTML(texto)}</span>`;
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
            modal.classList.add("admin-modal", "admin-modal-open", "flex");
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

        function fecharModal(modalId) {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            modal.classList.add("hidden");
            modal.classList.remove("admin-modal-open", "flex");
            modal.style.display = "none";
            modal.setAttribute("aria-hidden", "true");
        }

        function preencherSelectModal(selectId, items, getValue, getLabel, placeholder) {
            const select = document.getElementById(selectId);
            if (!select) return;

            select.innerHTML = `<option value="">${escapeHTML(placeholder)}</option>` + items.map(item => {
                const value = getValue(item);
                const label = getLabel(item);
                return `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
            }).join("");
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
                        <option value="">Selecionar</option>
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
                <div class="asset-spec-value-row">
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
                                <span class="text-[11px] font-semibold text-gray-500">${escapeHTML(getFeatureTypeLabel(feature))} · ${repeatable ? "permite múltiplos valores" : "valor único"}</span>
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
            row.className = "category-feature-row rounded-lg border border-blue-100 bg-white p-3";
            row.innerHTML = `
                <div class="category-feature-field">
                    <label>Nome da feature</label>
                    <input type="text" data-category-feature-name value="${escapeHTML(getFeatureName(feature) === "Característica" && !getFeatureRawName(feature) ? "" : getFeatureName(feature))}" class="rounded-lg border-2 border-blue-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-900/20" placeholder="Ex.: CPU, RAM, Licença, Expiração">
                </div>
                <div class="category-feature-field">
                    <label>Tipo</label>
                    <select data-category-feature-type class="rounded-lg border-2 border-blue-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-900/20">
                        <option value="text">Texto</option>
                        <option value="number">Número</option>
                        <option value="boolean">Sim/Não</option>
                        <option value="date">Data</option>
                    </select>
                </div>
                <label class="category-feature-repeatable">
                    <input type="checkbox" data-category-feature-repeatable>
                    <span>Múltipla</span>
                </label>
                <button type="button" class="category-feature-remove">Remover</button>
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
            preencherSelectModal("new-user-location", cacheLocais, getLocationId, getLocationName, "Sem sala associada");
            preencherSelectModal("new-location-manager", cacheUtilizadores, getUserId, user => `${getUserEmail(user)} (${getUserRole(user)})`, "Sem gestor associado");
            preencherSelectModal("new-asset-location", cacheLocais, getLocationId, getLocationName, "Selecionar local");
            preencherSelectModal("new-asset-category", cacheCategorias, getCategoryId, getCategoryName, "Selecionar categoria");
        }

        function definirModoModalUtilizador(user = null) {
            const editingIdInput = document.getElementById("editing-user-id");
            const title = document.getElementById("modalUtilizadorTitulo");
            const submitButton = document.getElementById("modalUtilizadorSubmit");

            if (editingIdInput) editingIdInput.value = user ? String(getUserId(user)) : "";
            if (title) title.innerText = user ? "Editar Utilizador" : "Novo Utilizador";
            if (submitButton) submitButton.innerText = user ? "Atualizar" : "Guardar";
        }

        function abrirModalUtilizador(user = null) {
            atualizarSelectsDosModais();
            const form = document.getElementById("formUtilizador");
            if (form) form.reset();

            definirModoModalUtilizador(user);

            if (user) {
                const emailInput = document.getElementById("new-user-email");
                const roleSelect = document.getElementById("new-user-role");
                const locationSelect = document.getElementById("new-user-location");
                const locationIds = getUserLocationIds(user);

                if (emailInput) emailInput.value = getUserEmail(user);
                if (roleSelect) roleSelect.value = getUserRole(user);
                if (locationSelect) locationSelect.value = locationIds[0] || "";
            }

            abrirModal("modalUtilizador");
        }

        function editarUtilizador(userId) {
            const user = cacheUtilizadores.find(u => String(getUserId(u)) === String(userId));
            if (!user) {
                mostrarToast("Utilizador não encontrado.", true);
                return;
            }

            abrirModalUtilizador(user);
        }

        async function removerUtilizador(userId) {
            const user = cacheUtilizadores.find(u => String(getUserId(u)) === String(userId));
            const userLabel = user ? getUserEmail(user) : `#${userId}`;

            if (!confirm(`Tens a certeza que queres remover o utilizador "${userLabel}"?`)) return;

            try {
                await deleteJSON(`/users/${userId}`);
                mostrarToast("Utilizador removido com sucesso.");
                await carregarDados();
            } catch (error) {
                mostrarToast(error.message, true);
            }
        }

        function definirModoModalLocal(location = null) {
            const editingIdInput = document.getElementById("editing-location-id");
            const title = document.getElementById("modalLocalTitulo");
            const submitButton = document.getElementById("modalLocalSubmit");

            if (editingIdInput) editingIdInput.value = location ? String(getLocationId(location)) : "";
            if (title) title.innerText = location ? "Editar Local" : "Adicionar Local";
            if (submitButton) submitButton.innerText = location ? "Atualizar" : "Guardar";
        }

        function abrirModalLocal(location = null) {
            atualizarSelectsDosModais();
            const form = document.getElementById("formLocal");
            if (form) form.reset();

            definirModoModalLocal(location);

            if (location) {
                const nameInput = document.getElementById("new-location-name");
                const managerSelect = document.getElementById("new-location-manager");

                if (nameInput) nameInput.value = getLocationName(location);
                if (managerSelect) managerSelect.value = String(getLocationManagerId(location) || "");
            }

            abrirModal("modalLocal");
        }

        function editarLocal(locationId) {
            const location = cacheLocais.find(l => String(getLocationId(l)) === String(locationId));
            if (!location) {
                mostrarToast("Local não encontrado.", true);
                return;
            }

            abrirModalLocal(location);
        }

        async function removerLocal(locationId) {
            const location = cacheLocais.find(l => String(getLocationId(l)) === String(locationId));
            const locationLabel = location ? getLocationName(location) : `#${locationId}`;

            if (!confirm(`Tens a certeza que queres remover o local "${locationLabel}"?`)) return;

            try {
                await deleteJSON(`/locations/${locationId}`);
                mostrarToast("Local removido com sucesso.");
                await carregarDados();
            } catch (error) {
                mostrarToast(error.message, true);
            }
        }

        function definirModoModalAtivo(asset = null) {
            const editingIdInput = document.getElementById("editing-asset-id");
            const title = document.getElementById("modalAtivoTitulo");
            const submitButton = document.getElementById("modalAtivoSubmit");

            if (editingIdInput) editingIdInput.value = asset ? String(getAssetId(asset)) : "";
            if (title) title.innerText = asset ? "Editar Ativo" : "Novo Ativo";
            if (submitButton) submitButton.innerText = asset ? "Atualizar" : "Guardar";
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
                const categoryId = getAssetCategoryId(asset);

                if (serialInput) serialInput.value = getAssetSerial(asset);
                if (categorySelect) categorySelect.value = String(categoryId || "");
                if (locationSelect) locationSelect.value = String(getAssetLocationId(asset) || "");
                if (stateSelect) stateSelect.value = getAssetStatus(asset);
                if (assignedInput) assignedInput.value = getAssetAssigned(asset) === "-" ? "" : getAssetAssigned(asset);
                if (maintenanceInput) maintenanceInput.value = getAssetMaintenancePeriod(asset);

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
            const features = getCategoryFeatures(getAssetCategoryId(asset));
            const specsByFeatureId = {};

            details.forEach(detail => {
                const featureId = getFeatureId(detail);
                if (featureId) specsByFeatureId[String(featureId)] = primeiroValor(detail, ["spec_value", "value", "valor"], "");
            });

            const specs = asset && asset.specs && typeof asset.specs === "object" ? asset.specs : {};
            Object.entries(specs).forEach(([key, value]) => {
                const feature = features.find(f => String(getFeatureName(f)) === String(key) || String(getFeatureRawName(f)) === String(key) || String(getFeatureId(f)) === String(key));
                if (feature) specsByFeatureId[String(getFeatureId(feature))] = value;
            });

            if (!features.length) {
                return `<p class="text-sm text-gray-500">Esta categoria ainda não tem características configuradas.</p>`;
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
                                    ${repeatable ? `<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-900">Múltipla</span>` : ""}
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
                        ${renderDetailField("Data de registo", formatarData(getAssetRegistrationDate(asset)))}
                        ${renderDetailField("Manutenção", getAssetMaintenancePeriod(asset) ? `${getAssetMaintenancePeriod(asset)} meses` : "-")}
                    </div>
                </section>
                <section>
                    <h3 class="mb-3 text-sm font-black uppercase text-blue-900">Características</h3>
                    ${renderAssetSpecsDetail(asset)}
                </section>
            `;
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

        function ligarBotaoModal(buttonId, handler) {
            const button = document.getElementById(buttonId);
            if (!button || button.dataset.modalListenerAttached === "true") return;

            button.addEventListener("click", event => {
                event.preventDefault();
                handler();
            });
            button.dataset.modalListenerAttached = "true";
        }

        function ligarBotoesDosModais() {
            ligarBotaoModal("btnNovoUtilizador", abrirModalUtilizador);
            ligarBotaoModal("btnNovoLocal", abrirModalLocal);
            ligarBotaoModal("btnNovoAtivo", abrirModalAtivo);
            ligarBotaoModal("btnNovaCategoria", abrirModalCategoria);
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

        function ligarAcoesUtilizadores() {
            const tbody = document.getElementById("fullUsersTableBody");
            if (!tbody || tbody.dataset.userActionsListenerAttached === "true") return;

            tbody.addEventListener("click", event => {
                const button = event.target.closest("[data-user-action]");
                if (!button) return;

                event.preventDefault();
                const userId = button.dataset.userId;
                if (!userId) return;

                if (button.dataset.userAction === "edit") {
                    editarUtilizador(userId);
                }

                if (button.dataset.userAction === "remove") {
                    removerUtilizador(userId);
                }
            });

            tbody.dataset.userActionsListenerAttached = "true";
        }

        function ligarAcoesLocais() {
            const tbody = document.getElementById("locationsTableBody");
            if (!tbody || tbody.dataset.locationActionsListenerAttached === "true") return;

            tbody.addEventListener("click", event => {
                const button = event.target.closest("[data-location-action]");
                if (!button) return;

                event.preventDefault();
                const locationId = button.dataset.locationId;
                if (!locationId) return;

                if (button.dataset.locationAction === "edit") {
                    editarLocal(locationId);
                }

                if (button.dataset.locationAction === "remove") {
                    removerLocal(locationId);
                }
            });

            tbody.dataset.locationActionsListenerAttached = "true";
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

                if (button.dataset.categoryAction === "edit") {
                    editarCategoria(categoryId);
                }

                if (button.dataset.categoryAction === "remove") {
                    removerCategoria(categoryId);
                }
            });

            tbody.dataset.listenerAttached = "true";
        }

        function ligarModais() {
            const formUtilizador = document.getElementById("formUtilizador");
            if (formUtilizador && formUtilizador.dataset.listenerAttached !== "true") {
                formUtilizador.addEventListener("submit", async event => {
                    event.preventDefault();
                    const locationId = document.getElementById("new-user-location").value;
                    const editingUserId = document.getElementById("editing-user-id")?.value || "";
                    const payload = {
                        email: document.getElementById("new-user-email").value.trim(),
                        role: document.getElementById("new-user-role").value,
                        location_ids: locationId ? [Number(locationId)] : []
                    };

                    try {
                        if (editingUserId) {
                            await putJSON(`/users/${editingUserId}`, payload);
                        } else {
                            await postJSON("/users/", payload);
                        }

                        fecharModal("modalUtilizador");
                        mostrarToast(editingUserId ? "Utilizador atualizado com sucesso." : "Utilizador criado com sucesso.");
                        await carregarDados();
                    } catch (error) {
                        mostrarToast(error.message, true);
                    }
                });
                formUtilizador.dataset.listenerAttached = "true";
            }

            const formLocal = document.getElementById("formLocal");
            if (formLocal && formLocal.dataset.listenerAttached !== "true") {
                formLocal.addEventListener("submit", async event => {
                    event.preventDefault();
                    const editingLocationId = document.getElementById("editing-location-id")?.value || "";
                    const managerId = document.getElementById("new-location-manager")?.value || "";
                    const payload = {
                        location_name: document.getElementById("new-location-name").value.trim(),
                        location_manager_id: managerId ? Number(managerId) : null
                    };

                    try {
                        if (editingLocationId) {
                            await putJSON(`/locations/${editingLocationId}`, payload);
                        } else {
                            await postJSON("/locations/", payload);
                        }

                        fecharModal("modalLocal");
                        mostrarToast(editingLocationId ? "Local atualizado com sucesso." : "Local criado com sucesso.");
                        await carregarDados();
                    } catch (error) {
                        mostrarToast(error.message, true);
                    }
                });
                formLocal.dataset.listenerAttached = "true";
            }

            const categorySelect = document.getElementById("new-asset-category");
            if (categorySelect && categorySelect.dataset.listenerAttached !== "true") {
                categorySelect.addEventListener("change", atualizarCamposSpecsDoAtivo);
                categorySelect.dataset.listenerAttached = "true";
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
                mudarPaginaTabela,
                limparFiltros,
                abrirModalUtilizador,
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
                fecharModal,
                adicionarLinhaFeatureCategoria,
                logout: window.logout
            });
        }

        async function inicializarPagina() {
            if (paginaInicializada) return;
            paginaInicializada = true;

            exporFuncoesGlobais();
            ligarBotoesDosModais();
            ligarFiltros();
            ligarFiltrosSpecsAtivos();
            ligarModais();
            ligarAcoesUtilizadores();
            ligarAcoesLocais();
            ligarAcoesAtivos();
            ligarAcoesCategorias();
            ligarAcoesPaginacao();
            ligarAcoesSpecsRepetiveis();
            ligarAcoesGerais();
            await recarregarDados();
        }

        exporFuncoesGlobais();

        async function executarInicializacaoAdmin() {
            const user = await initDashboard({
                expectedRole: "Administrador",
                avatarText: "AD",
                emailElementIds: ["userEmail", "adminEmail"]
            });

            if (!user) return;

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