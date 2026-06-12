(function () {
    const INVALID_CONFIRMATION_MESSAGE = "Credenciais de confirmação inválidas.";
    const INVALID_STEP_MESSAGE = "Confirmação inválida ou expirada.";
    let initialized = false;

    function modalTemplate() {
        return `
<div id="passwordChangeModal" data-dashboard-modal
    class="dashboard-modal fixed inset-0 z-[1000] hidden items-center justify-center overflow-y-auto bg-black/40 p-4"
    aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="passwordChangeTitle">
    <div class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
        <div class="mb-5 flex items-start justify-between gap-4">
            <div>
                <h2 id="passwordChangeTitle" class="text-xl font-black text-blue-900">Alterar palavra-passe</h2>
                <p class="mt-1 text-xs text-gray-500">Confirme primeiro a sua identidade.</p>
            </div>
            <button type="button" class="text-2xl font-bold text-gray-500 hover:text-gray-900"
                data-password-change-close aria-label="Fechar">×</button>
        </div>

        <form id="passwordChangeConfirmForm" class="space-y-4" novalidate>
            <p id="passwordChangeConfirmFeedback"
                class="hidden rounded-xl border px-4 py-3 text-center text-sm font-semibold"></p>
            <div>
                <label for="passwordChangeCurrentPassword"
                    class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Password atual</label>
                <input id="passwordChangeCurrentPassword" type="password" autocomplete="current-password" required
                    class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
            </div>
            <div>
                <label for="passwordChangeTotp"
                    class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Código do autenticador</label>
                <input id="passwordChangeTotp" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
                    autocomplete="one-time-code" placeholder="000000" required
                    class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-center text-lg font-semibold tracking-widest text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
            </div>
            <div class="flex justify-end gap-3 pt-2">
                <button type="button" data-password-change-close
                    class="rounded-lg border-2 border-blue-900 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-gray-100">
                    Cancelar
                </button>
                <button id="passwordChangeConfirmSubmit" type="submit"
                    class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                    Confirmar identidade
                </button>
            </div>
        </form>

        <form id="passwordChangeCompleteForm" class="hidden space-y-4" novalidate>
            <p class="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                Utilize pelo menos 8 caracteres, incluindo uma letra e um número.
            </p>
            <p id="passwordChangeCompleteFeedback"
                class="hidden rounded-xl border px-4 py-3 text-center text-sm font-semibold"></p>
            <div>
                <label for="passwordChangeNewPassword"
                    class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Nova password</label>
                <input id="passwordChangeNewPassword" type="password" autocomplete="new-password" required
                    class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
            </div>
            <div>
                <label for="passwordChangeConfirmPassword"
                    class="mb-1 block text-xs font-extrabold uppercase text-blue-900">Confirmar nova password</label>
                <input id="passwordChangeConfirmPassword" type="password" autocomplete="new-password" required
                    class="min-h-10 w-full rounded-lg border-2 border-blue-900 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-900/20">
            </div>
            <div class="flex justify-end gap-3 pt-2">
                <button type="button" data-password-change-close
                    class="rounded-lg border-2 border-blue-900 px-4 py-2 text-sm font-bold text-blue-900 hover:bg-gray-100">
                    Cancelar
                </button>
                <button id="passwordChangeCompleteSubmit" type="submit"
                    class="rounded-lg bg-blue-900 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                    Alterar password
                </button>
            </div>
        </form>
    </div>
</div>`;
    }

    function setFeedback(element, message, isError = true) {
        if (!element) return;
        element.textContent = message;
        element.classList.remove(
            "hidden",
            "border-red-200",
            "bg-red-50",
            "text-red-700",
            "border-green-200",
            "bg-green-50",
            "text-green-700"
        );
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

    function validatePassword(password) {
        return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
    }

    function init() {
        if (initialized) return;

        const menuRoot = document.querySelector("[data-profile-menu-root]");
        const menuToggle = document.querySelector("[data-profile-menu-toggle]");
        const menu = document.querySelector("[data-profile-menu]");
        const openButton = document.querySelector("[data-password-change-open]");
        if (!menuRoot || !menuToggle || !menu || !openButton) return;

        document.body.insertAdjacentHTML("beforeend", modalTemplate());

        const modal = document.getElementById("passwordChangeModal");
        const confirmForm = document.getElementById("passwordChangeConfirmForm");
        const completeForm = document.getElementById("passwordChangeCompleteForm");
        const currentPassword = document.getElementById("passwordChangeCurrentPassword");
        const totpCode = document.getElementById("passwordChangeTotp");
        const newPassword = document.getElementById("passwordChangeNewPassword");
        const confirmPassword = document.getElementById("passwordChangeConfirmPassword");
        const confirmFeedback = document.getElementById("passwordChangeConfirmFeedback");
        const completeFeedback = document.getElementById("passwordChangeCompleteFeedback");
        const confirmSubmit = document.getElementById("passwordChangeConfirmSubmit");
        const completeSubmit = document.getElementById("passwordChangeCompleteSubmit");
        let confirmationTimer = null;

        function closeMenu() {
            menu.classList.add("hidden");
            menuToggle.setAttribute("aria-expanded", "false");
        }

        function resetFlow() {
            if (confirmationTimer) {
                window.clearTimeout(confirmationTimer);
                confirmationTimer = null;
            }
            confirmForm.reset();
            completeForm.reset();
            confirmForm.classList.remove("hidden");
            completeForm.classList.add("hidden");
            hideFeedback(confirmFeedback);
            hideFeedback(completeFeedback);
            confirmSubmit.disabled = false;
            confirmSubmit.textContent = "Confirmar identidade";
            completeSubmit.disabled = false;
            completeSubmit.textContent = "Alterar password";
        }

        function openModal() {
            closeMenu();
            resetFlow();
            modal.classList.remove("hidden");
            modal.classList.add("flex");
            modal.setAttribute("aria-hidden", "false");
            currentPassword.focus();
        }

        function closeModal() {
            resetFlow();
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            modal.setAttribute("aria-hidden", "true");
        }

        function rejectConfirmation(message = INVALID_CONFIRMATION_MESSAGE) {
            currentPassword.value = "";
            totpCode.value = "";
            setFeedback(confirmFeedback, message);
            currentPassword.focus();
        }

        menuToggle.addEventListener("click", (event) => {
            event.stopPropagation();
            const opening = menu.classList.contains("hidden");
            menu.classList.toggle("hidden", !opening);
            menuToggle.setAttribute("aria-expanded", String(opening));
        });

        openButton.addEventListener("click", openModal);
        document.querySelectorAll("[data-password-change-close]").forEach((button) => {
            button.addEventListener("click", closeModal);
        });

        document.addEventListener("click", (event) => {
            if (!menuRoot.contains(event.target)) closeMenu();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            if (!modal.classList.contains("hidden")) {
                closeModal();
                return;
            }
            closeMenu();
        });

        modal.addEventListener("click", (event) => {
            if (event.target === modal) closeModal();
        });

        totpCode.addEventListener("input", () => {
            totpCode.value = totpCode.value.replace(/\D/g, "").slice(0, 6);
            hideFeedback(confirmFeedback);
        });
        currentPassword.addEventListener("input", () => hideFeedback(confirmFeedback));
        newPassword.addEventListener("input", () => hideFeedback(completeFeedback));
        confirmPassword.addEventListener("input", () => hideFeedback(completeFeedback));

        confirmForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const password = currentPassword.value;
            const code = totpCode.value.trim();

            if (!password || !/^\d{6}$/.test(code)) {
                rejectConfirmation();
                return;
            }

            confirmSubmit.disabled = true;
            confirmSubmit.textContent = "A confirmar...";
            hideFeedback(confirmFeedback);

            const result = await api.post("/auth/password-change/confirm", {
                current_password: password,
                totp_code: code,
            });

            confirmSubmit.disabled = false;
            confirmSubmit.textContent = "Confirmar identidade";

            if (!result.success) {
                rejectConfirmation(
                    result.status === 429
                        ? "Demasiadas tentativas. Tente novamente mais tarde."
                        : (result.error || INVALID_CONFIRMATION_MESSAGE)
                );
                return;
            }

            currentPassword.value = "";
            totpCode.value = "";
            confirmForm.classList.add("hidden");
            completeForm.classList.remove("hidden");
            newPassword.focus();
            confirmationTimer = window.setTimeout(() => {
                resetFlow();
                setFeedback(confirmFeedback, INVALID_STEP_MESSAGE);
                currentPassword.focus();
            }, 5 * 60 * 1000);
        });

        completeForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const password = newPassword.value;
            const confirmation = confirmPassword.value;

            if (!validatePassword(password)) {
                setFeedback(
                    completeFeedback,
                    "A password deve ter pelo menos 8 caracteres, uma letra e um número."
                );
                return;
            }
            if (password !== confirmation) {
                setFeedback(completeFeedback, "As passwords não coincidem.");
                return;
            }

            completeSubmit.disabled = true;
            completeSubmit.textContent = "A alterar...";
            hideFeedback(completeFeedback);

            const result = await api.post("/auth/password-change/complete", {
                new_password: password,
            });

            completeSubmit.disabled = false;
            completeSubmit.textContent = "Alterar password";

            if (!result.success) {
                newPassword.value = "";
                confirmPassword.value = "";

                if (result.error === INVALID_STEP_MESSAGE) {
                    resetFlow();
                    setFeedback(confirmFeedback, result.error);
                    currentPassword.focus();
                    return;
                }

                setFeedback(
                    completeFeedback,
                    result.status === 429
                        ? "Demasiadas tentativas. Tente novamente mais tarde."
                        : (result.error || "Não foi possível alterar a password.")
                );
                newPassword.focus();
                return;
            }

            resetFlow();
            window.location.replace("/login?password=changed");
        });

        initialized = true;
    }

    window.ProfileSecurity = { init };
})();
