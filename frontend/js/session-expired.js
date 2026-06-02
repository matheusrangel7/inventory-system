(function () {
    const loginButton = document.getElementById("btnGoLogin");
    const retryButton = document.getElementById("btnRetrySession");
    const reasonText = document.getElementById("sessionExpiredReason");

    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason") || "expired";

    if (reasonText) {
        reasonText.textContent = reason === "csrf"
            ? "A validação de segurança da sessão falhou. Por proteção, inicia sessão novamente."
            : "A tua sessão expirou ou deixou de ser válida.";
    }

    loginButton?.addEventListener("click", () => {
        window.location.href = "/login?session=expired";
    });

    retryButton?.addEventListener("click", async () => {
        retryButton.disabled = true;
        retryButton.textContent = "A verificar...";

        const result = await api.get("/auth/me", { skipSessionExpiredRedirect: true });
        if (result.success && result.data?.role) {
            redirectAfterAuth(result.data);
            return;
        }

        window.location.href = "/login?session=expired";
    });
})();
