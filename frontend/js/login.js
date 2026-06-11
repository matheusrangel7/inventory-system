(async function () {
    if (await redirectIfAuthenticated()) return;

    const form = document.getElementById("loginForm");
    const loginHeader = document.getElementById("loginHeader");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const globalError = document.getElementById("globalError");
    const registerSuccess = document.getElementById("registerSuccess");
    const submitBtn = document.getElementById("submitBtn");
    const btnSpinner = document.getElementById("btnSpinner");
    const btnText = document.getElementById("btnText");

    const mfaSection = document.getElementById("mfaSection");
    const mfaCodeInput = document.getElementById("mfaCode");
    const mfaSubmitBtn = document.getElementById("mfaSubmitBtn");
    const mfaBackBtn = document.getElementById("mfaBackBtn");
    const mfaError = document.getElementById("mfaError");
    const showMfaRecoveryBtn = document.getElementById("showMfaRecoveryBtn");
    const mfaRecoverySection = document.getElementById("mfaRecoverySection");
    const mfaRecoveryCodeInput = document.getElementById("mfaRecoveryCode");
    const mfaRecoverySubmitBtn = document.getElementById("mfaRecoverySubmitBtn");
    const mfaRecoveryBackBtn = document.getElementById("mfaRecoveryBackBtn");
    const mfaRecoveryError = document.getElementById("mfaRecoveryError");
    const mfaRecoverySuccess = document.getElementById("mfaRecoverySuccess");

    function showError(message) {
        globalError.textContent =
            message || "E-mail ou palavra-passe incorretos.";
        globalError.classList.remove("hidden");
        [emailInput, passwordInput].forEach((el) => {
            el.classList.add("border-red-500");
            el.classList.remove("border-slate-300");
        });
    }

    function clearError() {
        globalError.classList.add("hidden");
        [emailInput, passwordInput].forEach((el) => {
            el.classList.remove("border-red-500");
            el.classList.add("border-slate-300");
        });
    }

    function showMfaError(message) {
        mfaError.textContent = message || "Código inválido.";
        mfaError.classList.remove("hidden");
    }

    function clearMfaError() {
        mfaError.classList.add("hidden");
    }

    function showMfaRecoveryError(message) {
        mfaRecoverySuccess.classList.add("hidden");
        mfaRecoveryError.textContent = message || "Código de recuperação inválido.";
        mfaRecoveryError.classList.remove("hidden");
    }

    function clearMfaRecoveryFeedback() {
        mfaRecoveryError.classList.add("hidden");
        mfaRecoverySuccess.classList.add("hidden");
    }

    function setLoading(loading) {
        submitBtn.disabled = loading;
        btnSpinner.classList.toggle("hidden", !loading);
        btnText.textContent = loading ? "A carregar..." : "Entrar";
    }

    function setMfaLoading(loading) {
        mfaSubmitBtn.disabled = loading;
        mfaSubmitBtn.textContent = loading ? "A verificar..." : "Verificar código";
    }

    function validateEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function validatePassword(value) {
        return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value);
    }

    function showMfaStep() {
        loginHeader?.classList.add("hidden");
        registerSuccess?.classList.add("hidden");
        form.classList.add("hidden");
        mfaSection.classList.remove("hidden");
        mfaCodeInput.focus();
    }

    async function handleLogin(email, password) {
        setLoading(true);
        clearError();

        const result = await api.post("/auth/login", { email, password }, { skipSessionExpiredRedirect: true });

        setLoading(false);

        if (!result.success) {
            showError(result.error);
            return;
        }

        if (result.data?.mfa_setup_required) {
            window.location.href = AUTH_PATHS.enrollMfa;
            return;
        }

        if (result.data?.mfa_required) {
            showMfaStep();
            return;
        }

        if (result.data?.user_id) {
            redirectAfterAuth(result.data);
            return;
        }

        showError("Resposta inesperada do servidor.");
    }

    async function handleVerifyMfa(code) {
        setMfaLoading(true);
        clearMfaError();

        const result = await api.post("/auth/verify-mfa", { code }, { skipSessionExpiredRedirect: true });

        setMfaLoading(false);

        if (!result.success) {
            showMfaError(result.error);
            return;
        }

        redirectAfterAuth(result.data);
    }

    function showMfaRecoveryStep() {
        clearMfaError();
        clearMfaRecoveryFeedback();
        mfaSection.classList.add("hidden");
        mfaRecoverySection.classList.remove("hidden");
        mfaRecoveryCodeInput.focus();
    }

    async function handleMfaRecovery() {
        clearMfaRecoveryFeedback();
        const recoveryCode = mfaRecoveryCodeInput.value.trim().toUpperCase();
        const normalized = recoveryCode.replace(/[\s-]/g, "");

        if (!/^[A-HJ-NP-Z2-9]{16}$/.test(normalized)) {
            showMfaRecoveryError("Introduza um código de recuperação válido.");
            return;
        }

        mfaRecoverySubmitBtn.disabled = true;
        mfaRecoverySubmitBtn.textContent = "A recuperar...";

        const result = await api.post(
            "/auth/recover-mfa",
            { recovery_code: recoveryCode },
            { skipSessionExpiredRedirect: true }
        );

        mfaRecoverySubmitBtn.disabled = false;
        mfaRecoverySubmitBtn.textContent = "Recuperar acesso";

        if (!result.success) {
            showMfaRecoveryError(result.error);
            return;
        }

        mfaRecoveryCodeInput.value = "";
        mfaRecoverySuccess.textContent =
            "Autenticador desvinculado. Inicie sessão novamente para configurar um novo.";
        mfaRecoverySuccess.classList.remove("hidden");
        setTimeout(() => redirectToLogin("?mfa=recovered"), 1500);
    }

    const params = new URLSearchParams(location.search);

    if (params.get("registered") === "1") {
        registerSuccess?.classList.remove("hidden");
    }

    if (params.get("session") === "expired") {
        showError("A tua sessão expirou. Inicia sessão novamente para continuar.");
    }

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (
            !email ||
            !password ||
            !validateEmail(email) ||
            !validatePassword(password)
        ) {
            showError(
                "Verifique o e-mail e a palavra-passe (mín. 8 caracteres, letra e número)."
            );
            return;
        }

        await handleLogin(email, password);
    });

    mfaSubmitBtn?.addEventListener("click", async () => {
        const code = mfaCodeInput.value.replace(/\D/g, "").slice(0, 6);
        if (!/^\d{6}$/.test(code)) {
            showMfaError("Introduza um código de 6 dígitos.");
            return;
        }
        await handleVerifyMfa(code);
    });

    mfaCodeInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            mfaSubmitBtn.click();
        }
    });

    mfaBackBtn?.addEventListener("click", () => {
        window.location.href = AUTH_PATHS.login;
    });

    showMfaRecoveryBtn?.addEventListener("click", showMfaRecoveryStep);
    mfaRecoverySubmitBtn?.addEventListener("click", handleMfaRecovery);
    mfaRecoveryBackBtn?.addEventListener("click", () => {
        clearMfaRecoveryFeedback();
        mfaRecoverySection.classList.add("hidden");
        mfaSection.classList.remove("hidden");
        mfaCodeInput.focus();
    });

    mfaRecoveryCodeInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleMfaRecovery();
        }
    });

    emailInput?.addEventListener("input", clearError);
    passwordInput?.addEventListener("input", clearError);
    mfaCodeInput?.addEventListener("input", clearMfaError);
    mfaRecoveryCodeInput?.addEventListener("input", clearMfaRecoveryFeedback);
})();
