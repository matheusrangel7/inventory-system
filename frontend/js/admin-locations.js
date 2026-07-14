function renderLocationsTable() {
    const tbody = document.getElementById("locationsTableBody");
    if (!tbody) return;

    let locations = [...cacheLocais];
    const termo = getInputValue("locations-search");
    locations = locations.filter(l => textoIncluiTermo([
        getLocationId(l),
        getLocationName(l),
        getLocationManagerEmail(l) || "sem gestor"
    ], termo));

    locations = ordenarRegistos(locations, getInputValue("locations-sort"), {
        "name-asc": { accessor: getLocationName, dir: 1, type: "text" },
        "name-desc": { accessor: getLocationName, dir: -1, type: "text" },
        "manager-asc": { accessor: getLocationManagerSortValue, dir: 1, type: "text" },
        "manager-desc": { accessor: getLocationManagerSortValue, dir: -1, type: "text" },
        "id-asc": { accessor: getLocationId, dir: 1, type: "text" },
        "id-desc": { accessor: getLocationId, dir: -1, type: "text" }
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
                <tr class="align-top transition hover:bg-blue-50/40">
                    <td class="${TABLE_ID_CELL_CLASS}">#${escapeHTML(getLocationId(l))}</td>
                    <td>
                        <div class="${TABLE_TITLE_CLASS}">${escapeHTML(getLocationName(l))}</div>
                        <div class="${TABLE_SUBTITLE_CLASS}">Sala/local do inventário</div>
                    </td>
                    <td>${renderLocationManagerCell(l)}</td>
                    <td class="${TABLE_ACTION_CELL_CLASS}">
                        ${renderTableActions([
                            { label: "Ativos", variant: "primary", title: "Listar ativos deste local", attrs: { "data-location-action": "assets", "data-location-id": getLocationId(l) } },
                            { label: "Editar", variant: "secondary", title: "Editar local", attrs: { "data-location-action": "edit", "data-location-id": getLocationId(l) } },
                            { label: "Remover", variant: "danger", title: "Remover local", attrs: { "data-location-action": "remove", "data-location-id": getLocationId(l) } }
                        ])}
                    </td>
                </tr>
            `).join("");
}

function renderLocationManagerCell(location) {
    const managerEmail = getLocationManagerEmail(location);
    if (managerEmail) {
        return `<span class="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-900">${escapeHTML(managerEmail)}</span>`;
    }

    return `<span class="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-2.5 py-1 text-xs font-bold text-yellow-800">Sem Gestor</span>`;
}

function getLocationManagerEmail(l) {
    return primeiroValor(l, ["manager_email", "location_manager_email", "gestor_email", "user_email"], "");
}

function getLocationManagerSortValue(l) {
    return getLocationManagerEmail(l) || "sem gestor";
}

function getLocationManagerId(l) {
    return primeiroValor(l, ["location_manager_id", "manager_id", "gestor_id", "user_id"], "");
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

function ligarAcoesLocais() {
    const tbody = document.getElementById("locationsTableBody");
    if (!tbody || tbody.dataset.locationActionsListenerAttached === "true") return;

    tbody.addEventListener("click", event => {
        const button = event.target.closest("[data-location-action]");
        if (!button) return;

        event.preventDefault();
        const locationId = button.dataset.locationId;
        if (!locationId) return;

        if (button.dataset.locationAction === "assets") {
            listarAtivosLocal(locationId);
        }

        if (button.dataset.locationAction === "edit") {
            editarLocal(locationId);
        }

        if (button.dataset.locationAction === "remove") {
            removerLocal(locationId);
        }
    });

    tbody.dataset.locationActionsListenerAttached = "true";
}

function ligarFormularioLocal() {
    const formLocal = document.getElementById("formLocal");
    if (!formLocal || formLocal.dataset.listenerAttached === "true") return;

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
