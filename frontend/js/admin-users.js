function renderDashboardUsersTable() {
    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;

    const usersFiltrados = filtrarUtilizadores("dash-users");
    atualizarContador("dashUsersResultCount", usersFiltrados.length, cacheUtilizadores.length);

    const pagination = obterPaginaTabela("dashboardUsers", usersFiltrados);
    renderPagination("dashboardUsers", pagination);
    const users = pagination.items;

    if (!users.length) {
        renderEmptyRow(tbody, 5, "Nenhum utilizador encontrado.");
        return;
    }

    tbody.innerHTML = users.map(u => `
<tr class="align-top transition hover:bg-blue-50/40">
    <td class="${TABLE_ID_CELL_CLASS}">#${escapeHTML(getUserId(u))}</td>
    <td>
        <div class="${TABLE_TITLE_CLASS}">${escapeHTML(getUserEmail(u))}</div>
        <div class="${TABLE_SUBTITLE_CLASS}">Utilizador #${escapeHTML(getUserId(u))}</div>
    </td>
    <td>${escapeHTML(getUserRole(u))}</td>
    <td>${renderUserLocationsCell(u)}</td>
    <td>${statusBadge(getUserStatus(u))}</td>
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
        renderEmptyRow(tbody, 6, "Nenhum utilizador encontrado.");
        return;
    }

    tbody.innerHTML = users.map(u => `
                <tr class="align-top transition hover:bg-blue-50/40">
                    <td class="${TABLE_ID_CELL_CLASS}">#${escapeHTML(getUserId(u))}</td>
                    <td>
                        <div class="${TABLE_TITLE_CLASS}">${escapeHTML(getUserEmail(u))}</div>
                        <div class="${TABLE_SUBTITLE_CLASS}">Utilizador #${escapeHTML(getUserId(u))}</div>
                    </td>
                    <td>${escapeHTML(getUserRole(u))}</td>
                    <td>${renderUserLocationsCell(u)}</td>
                    <td>${statusBadge(getUserStatus(u))}</td>
                    <td class="${TABLE_ACTION_CELL_CLASS}">
                        ${renderUserTableActions(u)}
                    </td>
                </tr>
            `).join("");
}

function renderUserTableActions(user) {
    const userId = getUserId(user);
    const actions = [
        { label: "Editar", variant: "secondary", title: "Editar utilizador", attrs: { "data-user-action": "edit", "data-user-id": userId } }
    ];

    if (isPendingUser(user)) {
        actions.push({
            label: "Reenviar email",
            variant: "secondary",
            title: "Reenviar email de registo",
            attrs: { "data-user-action": "resend-registration", "data-user-id": userId }
        });
    }

    actions.push({ label: "Remover", variant: "danger", title: "Remover utilizador", attrs: { "data-user-action": "remove", "data-user-id": userId } });
    return renderTableActions(actions);
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
    return primeiroValor(u, ["registration_status", "registrationStatus", "estado_registo", "status", "estado"], "Concluído");
}

function isPendingUser(user) {
    return normalizarTexto(getUserStatus(user)) === "pendente";
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

function getUserLocationNames(u) {
    const ids = new Set(getUserLocationIds(u).map(String));
    if (!ids.size) return [];

    return cacheLocais
        .filter(location => ids.has(String(getLocationId(location))))
        .map(getLocationName);
}

function renderUserLocationsCell(user) {
    const locationNames = getUserLocationNames(user);

    if (!locationNames.length) {
        return `<span class="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-2 py-0.5 text-xs font-bold text-yellow-800">Sem salas</span>`;
    }

    const visible = locationNames.slice(0, 2);
    const remaining = locationNames.length - visible.length;

    return `
        <div class="flex max-w-56 flex-wrap gap-1">
            ${visible.map(name => `<span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-900 ring-1 ring-blue-100" title="${escapeHTML(name)}">${escapeHTML(name)}</span>`).join("")}
            ${remaining > 0 ? `<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">+${remaining}</span>` : ""}
        </div>
    `;
}

function getSelectedUserLocationValues(exceptSelect = null) {
    return new Set(Array.from(document.querySelectorAll("[data-user-location-select]"))
        .filter(select => select !== exceptSelect)
        .map(select => String(select.value || ""))
        .filter(Boolean));
}

function renderUserLocationOptions(selectedValue = "", selectedValues = new Set()) {
    const selected = String(selectedValue || "");
    const options = cacheLocais
        .map(location => {
            const value = String(getLocationId(location));
            const label = getLocationName(location);
            const disabled = selectedValues.has(value) && value !== selected;
            return `<option value="${escapeHTML(value)}" ${value === selected ? "selected" : ""} ${disabled ? "disabled" : ""}>${escapeHTML(label)}${disabled ? " — já adicionada" : ""}</option>`;
        })
        .join("");

    return `${renderSelectEmptyOption("Selecionar sala/local", { asPlaceholder: true, selected: !selected })}${options}`;
}

function renderUserLocationSummary() {
    const summary = document.getElementById("userLocationSummary");
    if (!summary) return;

    const selectedIds = recolherLocationIdsUtilizador().map(String);
    if (!selectedIds.length) {
        summary.innerHTML = `<span class="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-500 ring-1 ring-gray-200">Sem salas associadas</span>`;
        return;
    }

    const labels = selectedIds.map(id => {
        const location = cacheLocais.find(item => String(getLocationId(item)) === id);
        return location ? getLocationName(location) : `Sala #${id}`;
    });

    summary.innerHTML = labels.map(label => `
        <span class="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-900 ring-1 ring-blue-100">
            ${escapeHTML(label)}
        </span>
    `).join("");
}

function atualizarOpcoesLinhasSalasUtilizador() {
    const selects = Array.from(document.querySelectorAll("[data-user-location-select]"));

    selects.forEach(select => {
        const currentValue = String(select.value || "");
        const selectedValues = getSelectedUserLocationValues(select);
        select.innerHTML = renderUserLocationOptions(currentValue, selectedValues);
        select.value = currentValue;
    });

    renderUserLocationSummary();
}

function adicionarLinhaSalaUtilizador(selectedValue = "") {
    const container = document.getElementById("userLocationRows");
    if (!container) return null;

    const row = document.createElement("div");
    row.className = "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-blue-100 bg-white p-2 shadow-sm";
    row.dataset.userLocationRow = "true";
    row.innerHTML = `
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-900 ring-1 ring-blue-100" data-user-location-index></span>
        <select data-user-location-select class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:ring-2 focus:ring-blue-900/20">${renderUserLocationOptions(selectedValue, getSelectedUserLocationValues())}</select>
        <button type="button" data-user-location-remove class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-lg font-black leading-none text-red-700 transition hover:border-red-600 hover:bg-red-50" title="Remover sala" aria-label="Remover sala">×</button>
    `;

    const select = row.querySelector("[data-user-location-select]");
    if (select) {
        select.value = String(selectedValue || "");
        select.addEventListener("change", () => {
            atualizarOpcoesLinhasSalasUtilizador();
        });
    }

    const removeButton = row.querySelector("[data-user-location-remove]");
    if (removeButton) {
        removeButton.addEventListener("click", () => {
            row.remove();
            garantirLinhaSalaUtilizador();
            atualizarOpcoesLinhasSalasUtilizador();
        });
    }

    container.appendChild(row);
    garantirLinhaSalaUtilizador();
    atualizarOpcoesLinhasSalasUtilizador();
    return row;
}

function garantirLinhaSalaUtilizador() {
    const container = document.getElementById("userLocationRows");
    if (!container) return;

    if (!container.querySelector("[data-user-location-row]")) {
        adicionarLinhaSalaUtilizador();
        return;
    }

    const rows = Array.from(container.querySelectorAll("[data-user-location-row]"));
    rows.forEach((row, index) => {
        const indexBadge = row.querySelector("[data-user-location-index]");
        const removeButton = row.querySelector("[data-user-location-remove]");

        if (indexBadge) indexBadge.textContent = String(index + 1);
        if (removeButton) {
            removeButton.disabled = rows.length <= 1;
            removeButton.classList.toggle("cursor-not-allowed", rows.length <= 1);
            removeButton.classList.toggle("opacity-40", rows.length <= 1);
        }
    });
}

function preencherLinhasSalasUtilizador(values = []) {
    const container = document.getElementById("userLocationRows");
    if (!container) return;

    const cleanValues = Array.from(new Set((values || []).map(String).filter(Boolean)));
    container.innerHTML = "";

    if (cleanValues.length) {
        cleanValues.forEach(value => adicionarLinhaSalaUtilizador(value));
    } else {
        adicionarLinhaSalaUtilizador();
    }

    garantirLinhaSalaUtilizador();
    atualizarOpcoesLinhasSalasUtilizador();
}

function recolherLocationIdsUtilizador() {
    const ids = Array.from(document.querySelectorAll("[data-user-location-select]"))
        .map(select => Number(select.value))
        .filter(value => Number.isInteger(value));

    return Array.from(new Set(ids));
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

    const locationIds = user ? getUserLocationIds(user) : [];
    preencherLinhasSalasUtilizador(locationIds);

    const roleInput = document.getElementById("new-user-role");
    if (roleInput) roleInput.value = "Gestor";

    const emailInput = document.getElementById("new-user-email");
    if (emailInput) {
        emailInput.disabled = false;
        emailInput.classList.remove("cursor-not-allowed", "bg-gray-100", "text-gray-500");
    }

    if (user) {
        if (emailInput) {
            emailInput.value = getUserEmail(user);

            if (!isPendingUser(user)) {
                emailInput.disabled = true;
                emailInput.classList.add("cursor-not-allowed", "bg-gray-100", "text-gray-500");
            }
        }
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

async function reenviarEmailRegistoUtilizador(userId) {
    const user = cacheUtilizadores.find(u => String(getUserId(u)) === String(userId));

    if (user && !isPendingUser(user)) {
        mostrarToast("O registo deste utilizador já foi concluído.", true);
        return;
    }

    try {
        await postJSON(`/users/${userId}/resend-registration`);
        mostrarToast("Email de registo reenviado com sucesso.");
        await carregarDados();
    } catch (error) {
        mostrarToast(error.message, true);
    }
}

function validarFormularioUtilizador(email, locationIds, editingUserId) {
    if (!email) {
        return "Email é obrigatório.";
    }

    if (!editingUserId && !locationIds.length) {
        return "É necessário atribuir pelo menos uma sala ao gestor.";
    }

    return "";
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

        if (button.dataset.userAction === "resend-registration") {
            reenviarEmailRegistoUtilizador(userId);
        }
    });

    tbody.dataset.userActionsListenerAttached = "true";
}

function ligarFormularioUtilizador() {
    const formUtilizador = document.getElementById("formUtilizador");
    if (!formUtilizador || formUtilizador.dataset.listenerAttached === "true") return;

    formUtilizador.addEventListener("submit", async event => {
        event.preventDefault();
        const locationIds = recolherLocationIdsUtilizador();
        const editingUserId = document.getElementById("editing-user-id")?.value || "";
        const email = document.getElementById("new-user-email")?.value.trim() || "";
        const validationMessage = validarFormularioUtilizador(email, locationIds, editingUserId);

        if (validationMessage) {
            mostrarToast(validationMessage, true);
            return;
        }

        const payload = {
            email,
            role: "Gestor",
            location_ids: locationIds
        };

        try {
            let response;
            if (editingUserId) {
                response = await putJSON(`/users/${editingUserId}`, payload);
            } else {
                response = await postJSON("/users/", payload);
            }

            fecharModal("modalUtilizador");
            mostrarToast(
                response?.message
                || (editingUserId ? "Utilizador atualizado com sucesso." : "Utilizador criado com sucesso.")
            );
            await carregarDados();
        } catch (error) {
            mostrarToast(error.message, true);
        }
    });

    formUtilizador.dataset.listenerAttached = "true";
}
