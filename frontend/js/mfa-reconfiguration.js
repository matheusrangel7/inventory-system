(function () {
    const INVALID_CONFIRMATION_MESSAGE = "Credenciais de confirmação inválidas.";
    const INVALID_STEP_MESSAGE = "Reconfiguração MFA inválida ou expirada.";
    let initialized = false;

    function modalTemplate() {
        return `
<div id="mfaReconfigurationModal" data-dashboard-modal
    class="dashboard-modal fixed inset-0 z-[1000] hidden items-center justify-center overflow-y-auto bg-black/40 p-4"
    aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="mfaReconfigurationTitle">
    <div class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
        <div class="mb-5 flex items-start justify-between gap-4">
            <div>
                <h2 id="mfaReconfigurationTitle" class="text-xl font-black text-blue-900">Reconfigurar autenticador</h2>
                <p class="mt-1 text-xs text-gray-500">O autenticador atual continuará ativo até confirmar o novo.</p>
            </div>
            <button type="button" class="text-2xl font-bold text-gray-500 hover:text-gray-900"
                data-mfa-reconfiguration-close aria-label="Fechar">×</button>
        </div>

        <form id="mfaReconfigurationConfirmForm" class="space-y-4" novalidate>
            <p id="mfaReconfigurationConfirmFeedback"
                class="hidden rounded-xl border px-4 py-3 text-center text-sm font-semibold"></p>
            <div>
                <label for="mfaReconfigurationPassword"
                    class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Password atual</label>
                <input id="mfaReconfigurationPassword" type="password" autocomplete="current-password" required
                    class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
            </div>
            <div>
                <label for="mfaReconfigurationCurrentTotp"
                    class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Código do autenticador atual</label>
                <input id="mfaReconfigurationCurrentTotp" type="text" inputmode="numeric" pattern="[0-9]*"
                    maxlength="6" autocomplete="one-time-code" placeholder="000000" required
                    class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-center text-lg font-semibold tracking-widest text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
            </div>
            <div class="flex justify-end gap-3 pt-2">
                <button type="button" data-mfa-reconfiguration-close
                    class="rounded-lg border-2 border-blue-900 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-gray-100">
                    Cancelar
                </button>
                <button id="mfaReconfigurationConfirmSubmit" type="submit"
                    class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                    Confirmar identidade
                </button>
            </div>
        </form>

        <form id="mfaReconfigurationSetupForm" class="hidden space-y-4" novalidate>
            <p class="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                Digitalize este QR code no novo dispositivo. O autenticador atual só será substituído após validar o código abaixo.
            </p>
            <p id="mfaReconfigurationSetupFeedback"
                class="hidden rounded-xl border px-4 py-3 text-center text-sm font-semibold"></p>
            <div class="flex justify-center">
                <img id="mfaReconfigurationQr" alt="QR Code do novo autenticador"
                    class="h-48 w-48 rounded-lg border border-gray-200">
            </div>
            <div>
                <label for="mfaReconfigurationNewTotp"
                    class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Código do novo autenticador</label>
                <input id="mfaReconfigurationNewTotp" type="text" inputmode="numeric" pattern="[0-9]*"
                    maxlength="6" autocomplete="one-time-code" placeholder="000000" required
                    class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-center text-lg font-semibold tracking-widest text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
            </div>
            <div class="flex justify-end gap-3 pt-2">
                <button type="button" data-mfa-reconfiguration-close
                    class="rounded-lg border-2 border-blue-900 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-gray-100">
                    Cancelar
                </button>
                <button id="mfaReconfigurationCompleteSubmit" type="submit"
                    class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                    Ativar novo autenticador
                </button>
            </div>
        </form>

        <section id="mfaReconfigurationRecovery" class="hidden space-y-5">
            <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p class="font-bold">Guarde o novo código de recuperação.</p>
                <p class="mt-1">O código anterior já foi invalidado e este será apresentado apenas uma vez.</p>
            </div>
            <div class="rounded-xl border-2 border-blue-900 bg-gray-50 p-4 text-center">
                <code id="mfaReconfigurationRecoveryCode"
                    class="text-xl font-black tracking-widest text-blue-900"></code>
            </div>
            <button type="button" id="mfaReconfigurationCopyCode"
                class="w-full rounded-lg border-2 border-blue-900 px-4 py-3 text-sm font-bold text-blue-900 hover:bg-blue-50">
                Copiar código
            </button>
            <button type="button" id="mfaReconfigurationAcknowledge"
                class="w-full rounded-lg bg-blue-900 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800">
                Já guardei o código
            </button>
        </section>
    </div>
</div>`;
    }

    function setFeedback(element, message) {
        if (!element) return;
        element.textContent = message;
        element.classList.remove("hidden");
        element.classList.add("border-red-200", "bg-red-50", "text-red-700");
    }

    function hideFeedback(element) {
        if (!element) return;
        element.textContent = "";
        element.classList.add("hidden");
        element.classList.remove("border-red-200", "bg-red-50", "text-red-700");
    }

    function init() {
        if (initialized) return;

        const openButton = document.querySelector("[data-mfa-reconfiguration-open]");
        const menu = document.querySelector("[data-profile-menu]");
        const menuToggle = document.querySelector("[data-profile-menu-toggle]");
        if (!openButton || !menu || !menuToggle) return;

        document.body.insertAdjacentHTML("beforeend", modalTemplate());

        const modal = document.getElementById("mfaReconfigurationModal");
        const confirmForm = document.getElementById("mfaReconfigurationConfirmForm");
        const setupForm = document.getElementById("mfaReconfigurationSetupForm");
        const recoverySection = document.getElementById("mfaReconfigurationRecovery");
        const currentPassword = document.getElementById("mfaReconfigurationPassword");
        const currentTotp = document.getElementById("mfaReconfigurationCurrentTotp");
        const newTotp = document.getElementById("mfaReconfigurationNewTotp");
        const qrImage = document.getElementById("mfaReconfigurationQr");
        const recoveryCode = document.getElementById("mfaReconfigurationRecoveryCode");
        const confirmFeedback = document.getElementById("mfaReconfigurationConfirmFeedback");
        const setupFeedback = document.getElementById("mfaReconfigurationSetupFeedback");
        const confirmSubmit = document.getElementById("mfaReconfigurationConfirmSubmit");
        const completeSubmit = document.getElementById("mfaReconfigurationCompleteSubmit");
        const copyButton = document.getElementById("mfaReconfigurationCopyCode");
        const acknowledgeButton = document.getElementById("mfaReconfigurationAcknowledge");
        const closeButtons = Array.from(
            document.querySelectorAll("[data-mfa-reconfiguration-close]")
        );

        let pendingStarted = false;
        let completed = false;
        let expirationTimer = null;
        let closing = false;
        let busy = false;

        function closeMenu() {
            menu.classList.add("hidden");
            menuToggle.setAttribute("aria-expanded", "false");
        }

        function clearTimer() {
            if (!expirationTimer) return;
            window.clearTimeout(expirationTimer);
            expirationTimer = null;
        }

        function resetFlow() {
            clearTimer();
            confirmForm.reset();
            setupForm.reset();
            qrImage.removeAttribute("src");
            recoveryCode.textContent = "";
            copyButton.textContent = "Copiar código";
            confirmForm.classList.remove("hidden");
            setupForm.classList.add("hidden");
            recoverySection.classList.add("hidden");
            closeButtons.forEach((button) => button.classList.remove("hidden"));
            hideFeedback(confirmFeedback);
            hideFeedback(setupFeedback);
            confirmSubmit.disabled = false;
            confirmSubmit.textContent = "Confirmar identidade";
            completeSubmit.disabled = false;
            completeSubmit.textContent = "Ativar novo autenticador";
            pendingStarted = false;
            completed = false;
            closing = false;
            busy = false;
            closeButtons.forEach((button) => {
                button.disabled = false;
            });
        }

        function setBusy(value) {
            busy = value;
            closeButtons.forEach((button) => {
                button.disabled = value;
            });
        }

        async function cancelPending() {
            if (!pendingStarted) return;
            pendingStarted = false;
            await api.post("/auth/mfa-reconfiguration/cancel");
        }

        function openModal() {
            closeMenu();
            resetFlow();
            modal.classList.remove("hidden");
            modal.classList.add("flex");
            modal.setAttribute("aria-hidden", "false");
            currentPassword.focus();
        }

        async function closeModal() {
            if (completed || closing || busy) return;
            closing = true;
            await cancelPending();
            resetFlow();
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            modal.setAttribute("aria-hidden", "true");
        }

        function rejectConfirmation(message = INVALID_CONFIRMATION_MESSAGE) {
            currentPassword.value = "";
            currentTotp.value = "";
            setFeedback(confirmFeedback, message);
            currentPassword.focus();
        }

        function normalizeTotp(input) {
            input.value = input.value.replace(/\D/g, "").slice(0, 6);
        }

        openButton.addEventListener("click", openModal);
        closeButtons.forEach((button) => {
            button.addEventListener("click", () => closeModal());
        });

        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal();
        });

        document.addEventListener("keydown", (event) => {
            if (
                event.key === "Escape"
                && !modal.classList.contains("hidden")
                && !completed
            ) {
                closeModal();
            }
        });

        currentPassword.addEventListener("input", () => hideFeedback(confirmFeedback));
        currentTotp.addEventListener("input", () => {
            normalizeTotp(currentTotp);
            hideFeedback(confirmFeedback);
        });
        newTotp.addEventListener("input", () => {
            normalizeTotp(newTotp);
            hideFeedback(setupFeedback);
        });

        confirmForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const password = currentPassword.value;
            const code = currentTotp.value.trim();

            if (!password || !/^\d{6}$/.test(code)) {
                rejectConfirmation();
                return;
            }

            confirmSubmit.disabled = true;
            confirmSubmit.textContent = "A confirmar...";
            setBusy(true);
            hideFeedback(confirmFeedback);

            const result = await api.post("/auth/mfa-reconfiguration/start", {
                current_password: password,
                totp_code: code,
            });

            confirmSubmit.disabled = false;
            confirmSubmit.textContent = "Confirmar identidade";
            setBusy(false);

            if (!result.success) {
                rejectConfirmation(
                    result.status === 429
                        ? "Demasiadas tentativas. Tente novamente mais tarde."
                        : (result.error || INVALID_CONFIRMATION_MESSAGE)
                );
                return;
            }

            if (!result.data?.qr_code) {
                pendingStarted = true;
                await cancelPending();
                rejectConfirmation("Não foi possível receber o QR code.");
                return;
            }

            currentPassword.value = "";
            currentTotp.value = "";
            pendingStarted = true;
            qrImage.src = result.data.qr_code;
            confirmForm.classList.add("hidden");
            setupForm.classList.remove("hidden");
            newTotp.focus();

            expirationTimer = window.setTimeout(async () => {
                await cancelPending();
                resetFlow();
                setFeedback(confirmFeedback, INVALID_STEP_MESSAGE);
                currentPassword.focus();
            }, 5 * 60 * 1000);
        });

        setupForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const code = newTotp.value.trim();
            if (!/^\d{6}$/.test(code)) {
                setFeedback(setupFeedback, "Introduza um código de 6 dígitos.");
                return;
            }

            completeSubmit.disabled = true;
            completeSubmit.textContent = "A ativar...";
            setBusy(true);
            hideFeedback(setupFeedback);

            const result = await api.post("/auth/mfa-reconfiguration/complete", {
                totp_code: code,
            });

            completeSubmit.disabled = false;
            completeSubmit.textContent = "Ativar novo autenticador";
            setBusy(false);

            if (!result.success) {
                newTotp.value = "";
                if (result.error === INVALID_STEP_MESSAGE) {
                    pendingStarted = false;
                    resetFlow();
                    setFeedback(confirmFeedback, result.error);
                    currentPassword.focus();
                    return;
                }
                setFeedback(
                    setupFeedback,
                    result.status === 429
                        ? "Demasiadas tentativas. Tente novamente mais tarde."
                        : (result.error || "Não foi possível validar o novo autenticador.")
                );
                newTotp.focus();
                return;
            }

            if (!result.data?.recovery_code) {
                setFeedback(
                    setupFeedback,
                    "O autenticador foi alterado, mas não foi possível apresentar o código de recuperação."
                );
                return;
            }

            clearTimer();
            pendingStarted = false;
            completed = true;
            newTotp.value = "";
            qrImage.removeAttribute("src");
            recoveryCode.textContent = result.data.recovery_code;
            setupForm.classList.add("hidden");
            recoverySection.classList.remove("hidden");
            closeButtons.forEach((button) => button.classList.add("hidden"));
        });

        copyButton.addEventListener("click", async () => {
            const value = recoveryCode.textContent.trim();
            if (!value) return;
            try {
                await navigator.clipboard.writeText(value);
                copyButton.textContent = "Código copiado";
            } catch {
                copyButton.textContent = "Selecione e copie o código";
            }
        });

        acknowledgeButton.addEventListener("click", () => {
            recoveryCode.textContent = "";
            resetFlow();
            window.location.replace("/login?mfa=reconfigured");
        });

        initialized = true;
    }

    window.MfaReconfiguration = { init };
})();
