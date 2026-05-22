(function () {
    const form = document.getElementById("firstAuthForm");
    const passwordInput = document.getElementById("password");
    const confirmInput = document.getElementById("confirmPassword");
    const globalError = document.getElementById("globalError");
    const submitBtn = form?.querySelector('button[type="submit"]');

    function getTokenFromUrl() {
        return new URLSearchParams(window.location.search).get("token")?.trim() || "";
    }

    function validatePassword(value) {
        return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
    }

    function showError(msg) {
        globalError.textContent = msg;
        globalError.classList.remove("hidden");
    }

    function hideError() {
        globalError.classList.add("hidden");
    }

    function setLoading(loading) {
        if (!submitBtn) return;
        submitBtn.disabled = loading;
        submitBtn.textContent = loading ? "A guardar..." : "Concluir Registo";
    }

    const token = getTokenFromUrl();

    if (!token) {
        showError("Link inválido ou incompleto. Utilize o link recebido por email.");
        if (submitBtn) submitBtn.disabled = true;
    }

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideError();

        if (!token) {
            showError("Token de registo em falta.");
            return;
        }

        const password = passwordInput.value;
        const confirm = confirmInput.value;

        if (!validatePassword(password)) {
            showError(
                "A palavra-passe deve ter pelo menos 8 caracteres, com letra e número."
            );
            return;
        }

        if (password !== confirm) {
            showError("As palavras-passe não coincidem.");
            return;
        }

        setLoading(true);

        const result = await api.post("/auth/complete-registration", {
            token,
            password,
        });

        setLoading(false);

        if (!result.success) {
            showError(result.error || "Não foi possível concluir o registo.");
            return;
        }

        window.location.href = `${AUTH_PATHS.login}?registered=1`;
    });
})();