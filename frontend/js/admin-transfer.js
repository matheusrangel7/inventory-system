let adminTransferPending = null;
let adminTransferEligibleManagers = [];
let adminTransferMode = "existing";
let adminTransferBusy = false;

function getAdminTransferContent() {
    return document.getElementById("adminTransferContent");
}

function renderAdminTransferLoading() {
    const content = getAdminTransferContent();
    if (!content) return;

    content.innerHTML = `
        <div class="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm font-semibold text-blue-900">
            A carregar estado da transferência...
        </div>
    `;
}

function renderAdminTransferError(message) {
    const content = getAdminTransferContent();
    if (!content) return;

    content.innerHTML = `
        <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            ${escapeHTML(message || "Não foi possível carregar a transferência.")}
        </div>
        <div class="flex flex-wrap justify-end gap-3">
            <button type="button" data-close-modal="modalTransferenciaAdmin" class="rounded-lg border-2 border-blue-900 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-gray-100">Fechar</button>
            <button type="button" data-transfer-action="refresh" class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800">Tentar novamente</button>
        </div>
    `;
}

function renderAdminTransferMessage(message, isError = false) {
    const messageEl = document.getElementById("adminTransferMessage");
    if (!messageEl) return;

    if (!message) {
        messageEl.className = "hidden";
        messageEl.textContent = "";
        return;
    }

    messageEl.textContent = message;
    messageEl.className = `rounded-xl px-3 py-2 text-sm font-semibold ${isError ? "border border-red-200 bg-red-50 text-red-800" : "border border-green-200 bg-green-50 text-green-800"}`;
}

function renderAdminTransferPending() {
    const content = getAdminTransferContent();
    if (!content) return;

    const expiresAt = adminTransferPending?.expires_at ? formatarData(adminTransferPending.expires_at) : "-";
    const createdAt = adminTransferPending?.created_at ? formatarData(adminTransferPending.created_at) : "-";

    content.innerHTML = `
        <div class="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <div class="text-xs font-black uppercase tracking-wide text-yellow-900">Transferência pendente</div>
            <div class="mt-2 text-lg font-black text-gray-900">${escapeHTML(adminTransferPending?.target_email || "-")}</div>
            <div class="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <div>
                    <div class="text-xs font-black uppercase text-gray-500">Criada em</div>
                    <div class="font-semibold text-gray-900">${escapeHTML(createdAt)}</div>
                </div>
                <div>
                    <div class="text-xs font-black uppercase text-gray-500">Expira em</div>
                    <div class="font-semibold text-gray-900">${escapeHTML(expiresAt)}</div>
                </div>
            </div>
        </div>
        <div id="adminTransferMessage" class="hidden"></div>
        <div class="flex flex-wrap justify-end gap-3">
            <button type="button" data-close-modal="modalTransferenciaAdmin" class="rounded-lg border-2 border-blue-900 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-gray-100">Fechar</button>
            <button type="button" data-transfer-action="cancel-pending" class="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:border-red-600 hover:bg-red-50">Cancelar transferência</button>
            <button type="button" data-transfer-action="resend-pending" class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800">Reenviar email</button>
        </div>
    `;
}

function renderAdminTransferModeButton(mode, label) {
    const isActive = adminTransferMode === mode;
    const activeClass = "border-blue-900 bg-blue-900 text-white";
    const inactiveClass = "border-blue-100 bg-white text-blue-900 hover:bg-blue-50";

    return `
        <button type="button" data-transfer-mode="${mode}" class="min-h-10 flex-1 rounded-xl border px-3 py-2 text-sm font-black transition ${isActive ? activeClass : inactiveClass}">
            ${escapeHTML(label)}
        </button>
    `;
}

function renderAdminTransferManagerOptions() {
    if (!adminTransferEligibleManagers.length) {
        return `<option value="">Nenhum gestor elegível disponível</option>`;
    }

    return `<option value="">Selecionar gestor</option>` + adminTransferEligibleManagers.map(user => (
        `<option value="${escapeHTML(getUserId(user))}">${escapeHTML(getUserEmail(user))}</option>`
    )).join("");
}

function renderAdminTransferFormFields() {
    if (adminTransferMode === "new") {
        return `
            <div class="space-y-1">
                <label for="admin-transfer-new-email" class="text-xs font-black uppercase tracking-wide text-blue-900">Email do novo administrador</label>
                <input id="admin-transfer-new-email" type="email" autocomplete="email" class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-blue-900/20" placeholder="novo.admin@ubi.pt">
            </div>
            <div class="space-y-1">
                <label for="admin-transfer-password" class="text-xs font-black uppercase tracking-wide text-blue-900">Senha atual</label>
                <input id="admin-transfer-password" type="password" autocomplete="current-password" class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-blue-900/20" placeholder="Confirma a tua senha">
            </div>
        `;
    }

    return `
        <div class="space-y-1">
            <label for="admin-transfer-target-user" class="text-xs font-black uppercase tracking-wide text-blue-900">Gestor elegível</label>
            <select id="admin-transfer-target-user" class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:ring-2 focus:ring-blue-900/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500" ${adminTransferEligibleManagers.length ? "" : "disabled"}>
                ${renderAdminTransferManagerOptions()}
            </select>
        </div>
        <div class="space-y-1">
            <label for="admin-transfer-password" class="text-xs font-black uppercase tracking-wide text-blue-900">Senha atual</label>
            <input id="admin-transfer-password" type="password" autocomplete="current-password" class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-2 focus:ring-blue-900/20" placeholder="Confirma a tua senha">
        </div>
    `;
}

function renderAdminTransferSelection() {
    const content = getAdminTransferContent();
    if (!content) return;

    const noManagersNotice = adminTransferMode === "existing" && !adminTransferEligibleManagers.length
        ? `<div class="rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm font-semibold text-yellow-900">Não há gestores concluídos com MFA ativo para transferência imediata.</div>`
        : "";
    const submitLabel = adminTransferMode === "existing" ? "Transferir agora" : "Enviar convite";
    const submitDisabled = adminTransferMode === "existing" && !adminTransferEligibleManagers.length ? " disabled" : "";

    content.innerHTML = `
        <div class="flex flex-col gap-2 rounded-xl border border-blue-100 bg-slate-50 p-3 sm:flex-row">
            ${renderAdminTransferModeButton("existing", "Gestor existente")}
            ${renderAdminTransferModeButton("new", "Novo email")}
        </div>
        <div id="adminTransferMessage" class="hidden"></div>
        ${noManagersNotice}
        <form data-admin-transfer-form class="space-y-4">
            ${renderAdminTransferFormFields()}
            <div class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                Esta ação altera quem tem a função de administrador. Confirma os dados antes de continuar.
            </div>
            <div class="flex flex-wrap justify-end gap-3">
                <button type="button" data-close-modal="modalTransferenciaAdmin" class="rounded-lg border-2 border-blue-900 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-gray-100">Cancelar</button>
                <button type="submit" data-transfer-submit class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-400"${submitDisabled}>${submitLabel}</button>
            </div>
        </form>
    `;
}

function setAdminTransferBusy(isBusy, label = "A processar...") {
    adminTransferBusy = isBusy;
    const modal = document.getElementById("modalTransferenciaAdmin");
    if (!modal) return;

    modal.querySelectorAll("input, select, button[data-transfer-mode], button[data-transfer-action], button[data-transfer-submit]").forEach(element => {
        if (isBusy) {
            if (!element.disabled) {
                element.dataset.transferBusyDisabled = "true";
                element.disabled = true;
            }
            return;
        }

        if (element.dataset.transferBusyDisabled === "true") {
            element.disabled = false;
            delete element.dataset.transferBusyDisabled;
        }
    });

    const submitButton = modal.querySelector("[data-transfer-submit]");
    if (!submitButton) return;

    if (!submitButton.dataset.defaultText) {
        submitButton.dataset.defaultText = submitButton.textContent;
    }

    submitButton.textContent = isBusy ? label : submitButton.dataset.defaultText;
}

async function carregarEstadoTransferenciaAdmin() {
    renderAdminTransferLoading();

    try {
        const pendingResult = await fetchJSON("/admin-transfer/pending");
        adminTransferPending = pendingResult.data || null;

        if (adminTransferPending) {
            adminTransferEligibleManagers = [];
            renderAdminTransferPending();
            return;
        }

        const managersResult = await fetchJSON("/admin-transfer/eligible-managers");
        adminTransferEligibleManagers = Array.isArray(managersResult.data) ? managersResult.data : [];
        adminTransferMode = "existing";
        renderAdminTransferSelection();
    } catch (error) {
        renderAdminTransferError(error.message);
    }
}

async function abrirModalTransferenciaAdmin() {
    abrirModal("modalTransferenciaAdmin");
    await carregarEstadoTransferenciaAdmin();
}

function validarEmailTransferenciaAdmin(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function validarFormularioTransferenciaAdmin() {
    const password = document.getElementById("admin-transfer-password")?.value || "";

    if (adminTransferMode === "existing") {
        const targetUserId = document.getElementById("admin-transfer-target-user")?.value || "";
        if (!targetUserId) return "Seleciona um gestor elegível.";
        if (!password) return "Senha atual obrigatória.";
        return "";
    }

    const email = document.getElementById("admin-transfer-new-email")?.value.trim() || "";
    if (!email) return "Email obrigatório.";
    if (!validarEmailTransferenciaAdmin(email)) return "Email inválido.";
    if (!password) return "Senha atual obrigatória.";
    return "";
}

async function executarTransferenciaAdmin() {
    if (adminTransferBusy) return;

    const validationMessage = validarFormularioTransferenciaAdmin();
    if (validationMessage) {
        renderAdminTransferMessage(validationMessage, true);
        return;
    }

    const password = document.getElementById("admin-transfer-password")?.value || "";
    setAdminTransferBusy(true);
    renderAdminTransferMessage("");

    try {
        if (adminTransferMode === "existing") {
            const targetUserId = document.getElementById("admin-transfer-target-user")?.value || "";
            await postJSON("/admin-transfer/existing", {
                target_user_id: Number(targetUserId),
                password
            });
            mostrarToast("Administração transferida com sucesso.");
            renderAdminTransferMessage("Administração transferida. A sessão atual será encerrada.", false);
            setTimeout(() => {
                window.location.href = "/login";
            }, 1200);
            return;
        }

        const email = document.getElementById("admin-transfer-new-email")?.value.trim() || "";
        await postJSON("/admin-transfer/new", {
            email,
            password
        });
        mostrarToast("Transferência iniciada com sucesso.");
        await carregarDados();
        await carregarEstadoTransferenciaAdmin();
    } catch (error) {
        renderAdminTransferMessage(error.message, true);
    } finally {
        if (adminTransferMode !== "existing" || !document.getElementById("adminTransferMessage")?.textContent.includes("transferida")) {
            setAdminTransferBusy(false);
        }
    }
}

async function reenviarTransferenciaAdminPendente() {
    if (adminTransferBusy) return;

    setAdminTransferBusy(true, "A reenviar...");
    renderAdminTransferMessage("");

    try {
        await postJSON("/admin-transfer/pending/resend");
        mostrarToast("Email de transferência reenviado com sucesso.");
        await carregarEstadoTransferenciaAdmin();
    } catch (error) {
        renderAdminTransferMessage(error.message, true);
    } finally {
        setAdminTransferBusy(false);
    }
}

async function cancelarTransferenciaAdminPendente() {
    if (adminTransferBusy) return;
    if (!confirm("Tens a certeza que queres cancelar esta transferência de administração?")) return;

    setAdminTransferBusy(true, "A cancelar...");
    renderAdminTransferMessage("");

    try {
        await postJSON("/admin-transfer/pending/cancel");
        mostrarToast("Transferência cancelada com sucesso.");
        await carregarDados();
        await carregarEstadoTransferenciaAdmin();
    } catch (error) {
        renderAdminTransferMessage(error.message, true);
    } finally {
        setAdminTransferBusy(false);
    }
}

function inserirBotaoTransferenciaAdmin() {
    if (document.getElementById("btnTransferirAdministracao")) return;

    const headerActions = document.querySelector("[data-dashboard-header-root] > div");
    if (!headerActions) return;

    headerActions.classList.add("flex-wrap", "justify-end");
    headerActions.insertAdjacentHTML("afterbegin", `
        <button id="btnTransferirAdministracao" type="button" data-admin-transfer-open class="inline-flex min-h-9 items-center justify-center rounded-lg border border-blue-900 bg-white px-3 py-2 text-[11px] font-black uppercase leading-tight tracking-wide text-blue-900 transition hover:bg-blue-50">
            Transferir Administração
        </button>
    `);
}

function ligarAcoesTransferenciaAdmin() {
    if (document.body.dataset.adminTransferListenerAttached === "true") return;

    document.body.addEventListener("click", event => {
        const openButton = event.target.closest("[data-admin-transfer-open]");
        if (!openButton) return;

        event.preventDefault();
        abrirModalTransferenciaAdmin();
    });

    const modal = document.getElementById("modalTransferenciaAdmin");
    if (modal && modal.dataset.transferListenerAttached !== "true") {
        modal.addEventListener("click", event => {
            const modeButton = event.target.closest("[data-transfer-mode]");
            if (modeButton) {
                event.preventDefault();
                adminTransferMode = modeButton.dataset.transferMode || "existing";
                renderAdminTransferSelection();
                return;
            }

            const actionButton = event.target.closest("[data-transfer-action]");
            if (!actionButton) return;

            event.preventDefault();
            const action = actionButton.dataset.transferAction;

            if (action === "refresh") {
                carregarEstadoTransferenciaAdmin();
            }

            if (action === "resend-pending") {
                reenviarTransferenciaAdminPendente();
            }

            if (action === "cancel-pending") {
                cancelarTransferenciaAdminPendente();
            }
        });

        modal.addEventListener("submit", event => {
            if (!event.target.closest("[data-admin-transfer-form]")) return;

            event.preventDefault();
            executarTransferenciaAdmin();
        });

        modal.dataset.transferListenerAttached = "true";
    }

    document.body.dataset.adminTransferListenerAttached = "true";
}
