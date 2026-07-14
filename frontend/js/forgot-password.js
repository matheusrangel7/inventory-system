(function () {
    const form = document.getElementById("forgotPasswordForm");
    const emailInput = document.getElementById("email");
    const submitBtn = document.getElementById("submitBtn");
    const feedback = document.getElementById("feedback");

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

    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitBtn.textContent = loading ? "A enviar..." : "Enviar instruções";
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = emailInput.value.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showFeedback("Introduza um endereço de email válido.", false);
            return;
        }

        setLoading(true);
        const result = await api.post(
            "/auth/password-reset/request",
            { email },
            { skipRefresh: true, skipSessionExpiredRedirect: true }
        );
        setLoading(false);

        if (!result.success) {
            showFeedback(result.error || "Não foi possível processar o pedido.", false);
            return;
        }

        form.classList.add("hidden");
        showFeedback(result.message, true);
    });
})();
