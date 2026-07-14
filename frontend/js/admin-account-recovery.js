(function () {
    const INVALID_CONFIRMATION_MESSAGE = "Credenciais de confirmação inválidas.";
    let initialized = false;
    let currentUser = null;
    let currentAction = null;

    function modalTemplate() {
        return `
<div id="adminAccountRecoveryModal" data-dashboard-modal
    class="dashboard-modal fixed inset-0 z-[1000] hidden items-center justify-center overflow-y-auto bg-black/40 p-4"
    aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="adminAccountRecoveryTitle">
    <div class="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
        <div class="mb-5 flex flex-shrink-0 items-start justify-between gap-4">
            <div>
                <h2 id="adminAccountRecoveryTitle" class="text-xl font-black text-blue-900">Recuperação de acesso</h2>
                <p class="mt-1 text-xs text-gray-500">Execute apenas a ação necessária para este utilizador.</p>
            </div>
            <button type="button" data-account-recovery-close
                class="text-2xl font-bold text-gray-500 hover:text-gray-900"
                aria-label="Fechar">×</button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            <section id="adminAccountRecoveryOverview" class="space-y-4">
                <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Confirme a identidade do gestor através de um canal externo antes de executar qualquer recuperação.
                </div>
                <p id="adminAccountRecoveryFeedback"
                    class="hidden rounded-xl border px-4 py-3 text-center text-sm font-semibold"></p>
                <div class="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-3">
                    <div>
                        <p class="text-xs font-extrabold uppercase text-gray-500">Email atual</p>
                        <p id="adminAccountRecoveryEmail" class="mt-1 break-words text-sm font-black text-gray-900"></p>
                    </div>
                    <div>
                        <p class="text-xs font-extrabold uppercase text-gray-500">Registo</p>
                        <p id="adminAccountRecoveryRegistration" class="mt-1 text-sm font-black text-gray-900"></p>
                    </div>
                    <div>
                        <p class="text-xs font-extrabold uppercase text-gray-500">MFA</p>
                        <p id="adminAccountRecoveryMfa" class="mt-1 text-sm font-black text-gray-900"></p>
                    </div>
                </div>
                <div class="grid gap-3 md:grid-cols-3">
                    <button type="button" data-account-recovery-action="email"
                        class="rounded-xl border-2 border-blue-100 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50">
                        <span class="block text-sm font-black text-blue-900">Alterar email</span>
                        <span class="mt-1 block text-xs text-gray-600">Atualiza o endereço de login e encerra as sessões.</span>
                    </button>
                    <button type="button" data-account-recovery-action="password"
                        class="rounded-xl border-2 border-blue-100 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50">
                        <span class="block text-sm font-black text-blue-900">Redefinir password</span>
                        <span class="mt-1 block text-xs text-gray-600">Envia um link de utilização única para o email atual.</span>
                    </button>
                    <button id="adminAccountRecoveryMfaAction" type="button" data-account-recovery-action="mfa"
                        class="rounded-xl border-2 border-blue-100 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
                        <span class="block text-sm font-black text-blue-900">Redefinir MFA</span>
                        <span class="mt-1 block text-xs text-gray-600">Desvincula o autenticador e encerra as sessões.</span>
                    </button>
                </div>
            </section>

            <form id="adminAccountRecoveryForm" class="hidden space-y-4" novalidate>
                <div>
                    <button type="button" data-account-recovery-back
                        class="text-sm font-bold text-blue-900">← Voltar às ações</button>
                    <h3 id="adminAccountRecoveryActionTitle" class="mt-3 text-lg font-black text-gray-900"></h3>
                    <p id="adminAccountRecoveryActionDescription" class="mt-1 text-sm text-gray-600"></p>
                </div>
                <p id="adminAccountRecoveryActionFeedback"
                    class="hidden rounded-xl border px-4 py-3 text-center text-sm font-semibold"></p>
                <div id="adminAccountRecoveryEmailFields" class="hidden space-y-4">
                    <div>
                        <label for="adminAccountRecoveryNewEmail"
                            class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Novo email</label>
                        <input id="adminAccountRecoveryNewEmail" type="email" autocomplete="off"
                            class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
                    </div>
                    <div>
                        <label for="adminAccountRecoveryConfirmEmail"
                            class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Confirmar novo email</label>
                        <input id="adminAccountRecoveryConfirmEmail" type="email" autocomplete="off"
                            class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
                    </div>
                </div>
                <div>
                    <label for="adminAccountRecoveryPassword"
                        class="mb-1 block text-xs font-extrabold uppercase text-blue-900">A sua password</label>
                    <input id="adminAccountRecoveryPassword" type="password" autocomplete="current-password" required
                        class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
                </div>
                <div>
                    <label for="adminAccountRecoveryTotp"
                        class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Código do seu autenticador</label>
                    <input id="adminAccountRecoveryTotp" type="text" inputmode="numeric" pattern="[0-9]*"
                        maxlength="6" autocomplete="one-time-code" placeholder="000000" required
                        class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-center text-lg font-semibold tracking-widest text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
                </div>
                <div class="flex flex-wrap justify-end gap-3 pt-2">
                    <button type="button" data-account-recovery-back
                        class="rounded-lg border-2 border-blue-900 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-gray-100">
                        Cancelar
                    </button>
                    <button id="adminAccountRecoverySubmit" type="submit"
                        class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                        Confirmar ação
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>`;
    }

    function setFeedback(element, message, isError) {
        if (!element) return;
        element.textContent = message;
        element.className = "rounded-xl border px-4 py-3 text-center text-sm font-semibold";
        element.classList.add(
            isError ? "border-red-200" : "border-green-200",
            isError ? "bg-red-50" : "bg-green-50",
            isError ? "text-red-700" : "text-green-700"
        );
    }

    function hideFeedback(element) {
        if (!element) return;
        element.textContent = "";
        element.classList.add("hidden");
    }

    function isCompleted(user) {
        return String(user?.registration_status || "").toLowerCase() === "concluído";
    }

    function init() {
        if (initialized) return;
        document.body.insertAdjacentHTML("beforeend", modalTemplate());

        const modal = document.getElementById("adminAccountRecoveryModal");
        const overview = document.getElementById("adminAccountRecoveryOverview");
        const form = document.getElementById("adminAccountRecoveryForm");
        const overviewFeedback = document.getElementById("adminAccountRecoveryFeedback");
        const actionFeedback = document.getElementById("adminAccountRecoveryActionFeedback");
        const emailText = document.getElementById("adminAccountRecoveryEmail");
        const registrationText = document.getElementById("adminAccountRecoveryRegistration");
        const mfaText = document.getElementById("adminAccountRecoveryMfa");
        const mfaAction = document.getElementById("adminAccountRecoveryMfaAction");
        const actionTitle = document.getElementById("adminAccountRecoveryActionTitle");
        const actionDescription = document.getElementById("adminAccountRecoveryActionDescription");
        const emailFields = document.getElementById("adminAccountRecoveryEmailFields");
        const newEmail = document.getElementById("adminAccountRecoveryNewEmail");
        const confirmEmail = document.getElementById("adminAccountRecoveryConfirmEmail");
        const password = document.getElementById("adminAccountRecoveryPassword");
        const totp = document.getElementById("adminAccountRecoveryTotp");
        const submit = document.getElementById("adminAccountRecoverySubmit");
        const closeButtons = Array.from(
            document.querySelectorAll("[data-account-recovery-close]")
        );
        const backButtons = Array.from(
            document.querySelectorAll("[data-account-recovery-back]")
        );
        let busy = false;

        const actions = {
            email: {
                title: "Alterar email",
                description: "O email anterior e o novo serão notificados. Todas as sessões do gestor serão encerradas.",
                endpoint: "email",
                submit: "Alterar email",
            },
            password: {
                title: "Enviar redefinição de password",
                description: "Será enviado um link de utilização única para o email atual. As sessões permanecem ativas até a password ser alterada.",
                endpoint: "password-reset",
                submit: "Enviar link",
            },
            mfa: {
                title: "Redefinir MFA",
                description: "O autenticador e o código de recuperação atuais serão invalidados. O gestor terá de configurar MFA no próximo login.",
                endpoint: "mfa-reset",
                submit: "Redefinir MFA",
            },
        };

        function clearCredentials() {
            password.value = "";
            totp.value = "";
        }

        function setBusy(value) {
            busy = value;
            submit.disabled = value;
            closeButtons.forEach((button) => {
                button.disabled = value;
            });
            backButtons.forEach((button) => {
                button.disabled = value;
            });
        }

        function updateSummary() {
            emailText.textContent = currentUser?.email || "";
            registrationText.textContent = currentUser?.registration_status || "";
            const mfaEnabled = currentUser?.mfa_enabled === true;
            mfaText.textContent = mfaEnabled ? "Configurado" : "Não configurado";
            mfaAction.disabled = !mfaEnabled;
        }

        function showOverview(message = "", isError = false) {
            clearCredentials();
            currentAction = null;
            form.reset();
            form.classList.add("hidden");
            overview.classList.remove("hidden");
            hideFeedback(actionFeedback);
            if (message) {
                setFeedback(overviewFeedback, message, isError);
            } else {
                hideFeedback(overviewFeedback);
            }
            updateSummary();
        }

        function showAction(actionName) {
            const action = actions[actionName];
            if (!action || (actionName === "mfa" && !currentUser?.mfa_enabled)) return;

            currentAction = actionName;
            form.reset();
            clearCredentials();
            hideFeedback(actionFeedback);
            hideFeedback(overviewFeedback);
            overview.classList.add("hidden");
            form.classList.remove("hidden");
            emailFields.classList.toggle("hidden", actionName !== "email");
            actionTitle.textContent = action.title;
            actionDescription.textContent = action.description;
            submit.textContent = action.submit;
            setBusy(false);
            if (actionName === "email") {
                newEmail.focus();
            } else {
                password.focus();
            }
        }

        function closeModal() {
            if (busy) return;
            clearCredentials();
            currentUser = null;
            currentAction = null;
            form.reset();
            hideFeedback(overviewFeedback);
            hideFeedback(actionFeedback);
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            modal.setAttribute("aria-hidden", "true");
        }

        function openModal(user) {
            if (!user || !isCompleted(user)) {
                mostrarToast("Utilizador inválido para recuperação.", true);
                return;
            }

            currentUser = { ...user };
            modal.classList.remove("hidden");
            modal.classList.add("flex");
            modal.setAttribute("aria-hidden", "false");
            showOverview();
        }

        function reject(message) {
            clearCredentials();
            setFeedback(actionFeedback, message, true);
            password.focus();
        }

        document.querySelectorAll("[data-account-recovery-action]").forEach((button) => {
            button.addEventListener("click", () => showAction(button.dataset.accountRecoveryAction));
        });
        backButtons.forEach((button) => {
            button.addEventListener("click", () => {
                if (!busy) showOverview();
            });
        });
        closeButtons.forEach((button) => {
            button.addEventListener("click", closeModal);
        });

        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal();
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !modal.classList.contains("hidden")) {
                closeModal();
            }
        });
        totp.addEventListener("input", () => {
            totp.value = totp.value.replace(/\D/g, "").slice(0, 6);
            hideFeedback(actionFeedback);
        });
        password.addEventListener("input", () => hideFeedback(actionFeedback));
        newEmail.addEventListener("input", () => hideFeedback(actionFeedback));
        confirmEmail.addEventListener("input", () => hideFeedback(actionFeedback));

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const action = actions[currentAction];
            if (!action || !currentUser) return;

            const submittedPassword = password.value;
            const submittedTotp = totp.value.trim();
            const payload = {
                password: submittedPassword,
                totp_code: submittedTotp,
            };

            if (currentAction === "email") {
                const submittedEmail = newEmail.value.trim().toLowerCase();
                const submittedConfirmation = confirmEmail.value.trim().toLowerCase();
                if (!submittedEmail || submittedEmail !== submittedConfirmation) {
                    reject(
                        !submittedEmail
                            ? "Indique o novo email."
                            : "A confirmação do email não coincide."
                    );
                    return;
                }
                payload.new_email = submittedEmail;
            }

            if (!submittedPassword || !/^\d{6}$/.test(submittedTotp)) {
                reject(INVALID_CONFIRMATION_MESSAGE);
                return;
            }

            setBusy(true);
            submit.textContent = "A processar...";
            hideFeedback(actionFeedback);

            const result = await api.post(
                `/users/${currentUser.user_id}/access-recovery/${action.endpoint}`,
                payload
            );

            setBusy(false);
            submit.textContent = action.submit;
            clearCredentials();

            if (!result.success) {
                reject(
                    result.status === 429
                        ? "Demasiadas tentativas. Tente novamente mais tarde."
                        : (result.error || "Não foi possível concluir a recuperação.")
                );
                return;
            }

            if (result.data) currentUser = { ...currentUser, ...result.data };
            await carregarDados();
            showOverview(result.message || "Operação concluída com sucesso.");
        });

        window.AdminAccountRecovery = { open: openModal };
        initialized = true;
    }

    window.AdminAccountRecovery = {
        open(user) {
            init();
            window.AdminAccountRecovery.open(user);
        },
    };
})();
