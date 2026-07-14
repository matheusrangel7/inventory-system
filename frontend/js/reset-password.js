(async function () {
    const form = document.getElementById("resetPasswordForm");
    const passwordInput = document.getElementById("password");
    const confirmInput = document.getElementById("confirmPassword");
    const submitBtn = document.getElementById("submitBtn");
    const feedback = document.getElementById("feedback");
    const loginLink = document.getElementById("loginLink");
    const token = new URLSearchParams(window.location.search).get("token")?.trim() || "";

    function showFeedback(message, success) {
        feedback.textContent = message;
        feedback.classList.remove(
            "hidden",
            "text-red-700",
            "bg-red-50",
            "border-red-200",
            "text-green-700",
            "bg-green-50",
            "border-green-200"
        );
        feedback.classList.add(
            success ? "text-green-700" : "text-red-700",
            success ? "bg-green-50" : "bg-red-50",
            success ? "border-green-200" : "border-red-200"
        );
    }

    function validatePassword(value) {
        return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
    }

    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitBtn.textContent = loading ? "A guardar..." : "Redefinir palavra-passe";
    }

    if (!token) {
        showFeedback("O link de recuperação é inválido ou está incompleto.", false);
        loginLink.classList.remove("hidden");
        return;
    }

    const validation = await api.get(
        `/auth/password-reset/validate?token=${encodeURIComponent(token)}`,
        { skipRefresh: true, skipSessionExpiredRedirect: true }
    );

    if (!validation.success) {
        showFeedback(validation.error || "O link de recuperação já não está ativo.", false);
        loginLink.classList.remove("hidden");
        return;
    }

    form.classList.remove("hidden");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = passwordInput.value;
        const confirmation = confirmInput.value;

        if (!validatePassword(password)) {
            showFeedback(
                "A palavra-passe deve ter pelo menos 8 caracteres, uma letra e um número.",
                false
            );
            return;
        }
        if (password !== confirmation) {
            showFeedback("As palavras-passe não coincidem.", false);
            return;
        }

        setLoading(true);
        const result = await api.post(
            "/auth/password-reset/complete",
            { token, password },
            { skipRefresh: true, skipSessionExpiredRedirect: true }
        );
        setLoading(false);

        if (!result.success) {
            showFeedback(result.error || "Não foi possível redefinir a palavra-passe.", false);
            return;
        }

        passwordInput.value = "";
        confirmInput.value = "";
        form.classList.add("hidden");
        loginLink.classList.remove("hidden");
        showFeedback(
            "Palavra-passe redefinida. Todas as sessões foram encerradas; inicie sessão novamente.",
            true
        );
    });
})();
