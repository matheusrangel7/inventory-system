(function () {
    const globalError = document.getElementById("globalError");
    const loadingQr = document.getElementById("loadingQr");
    const enrollContent = document.getElementById("enrollContent");
    const qrImage = document.getElementById("qrImage");
    const mfaCodeInput = document.getElementById("mfaCode");
    const confirmBtn = document.getElementById("confirmBtn");
    const recoveryCodeContent = document.getElementById("recoveryCodeContent");
    const recoveryCodeElement = document.getElementById("recoveryCode");
    const copyRecoveryCodeBtn = document.getElementById("copyRecoveryCodeBtn");
    const completeEnrollmentBtn = document.getElementById("completeEnrollmentBtn");

    let setupLoaded = false;

    function showError(message) {
        globalError.textContent = message || "Ocorreu um erro.";
        globalError.classList.remove("hidden");
    }

    function hideError() {
        globalError.classList.add("hidden");
    }

    async function loadQrCode() {
        if (setupLoaded) return;

        const result = await api.post("/auth/enroll-mfa/setup");

        loadingQr.classList.add("hidden");

        if (!result.success) {
            if (result.status === 401) {
                redirectToLogin();
                return;
            }
            showError(result.error || "Não foi possível gerar o QR Code.");
            return;
        }

        if (!result.data?.qr_code) {
            showError("QR Code não recebido.");
            return;
        }

        qrImage.src = result.data.qr_code;
        enrollContent.classList.remove("hidden");
        setupLoaded = true;
        mfaCodeInput.focus();
    }

    async function confirmEnrollment() {
        hideError();

        const code = mfaCodeInput.value.replace(/\D/g, "").slice(0, 6);
        if (!/^\d{6}$/.test(code)) {
            showError("Introduza um código de 6 dígitos.");
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = "A ativar...";

        const result = await api.post("/auth/enroll-mfa/confirm", { code });

        confirmBtn.disabled = false;
        confirmBtn.textContent = "Ativar MFA";

        if (!result.success) {
            if (result.status === 401) {
                redirectToLogin();
                return;
            }
            showError(result.error || "Código inválido.");
            return;
        }

        if (!result.data?.recovery_code) {
            showError("Código de recuperação não recebido.");
            return;
        }

        enrollContent.classList.add("hidden");
        recoveryCodeElement.textContent = result.data.recovery_code;
        recoveryCodeContent.classList.remove("hidden");
    }

    async function copyRecoveryCode() {
        const recoveryCode = recoveryCodeElement.textContent.trim();
        if (!recoveryCode) return;

        try {
            await navigator.clipboard.writeText(recoveryCode);
            copyRecoveryCodeBtn.textContent = "Código copiado";
        } catch {
            showError("Não foi possível copiar automaticamente. Selecione e copie o código.");
        }
    }

    async function completeEnrollment() {
        hideError();
        completeEnrollmentBtn.disabled = true;
        completeEnrollmentBtn.textContent = "A entrar...";

        const result = await api.post("/auth/enroll-mfa/complete");

        completeEnrollmentBtn.disabled = false;
        completeEnrollmentBtn.textContent = "Já guardei o código";

        if (!result.success) {
            if (result.status === 401) {
                redirectToLogin();
                return;
            }
            showError(result.error || "Não foi possível concluir o acesso.");
            return;
        }

        recoveryCodeElement.textContent = "";
        redirectAfterAuth(result.data);
    }

    confirmBtn?.addEventListener("click", confirmEnrollment);
    copyRecoveryCodeBtn?.addEventListener("click", copyRecoveryCode);
    completeEnrollmentBtn?.addEventListener("click", completeEnrollment);

    mfaCodeInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            confirmEnrollment();
        }
    });

    redirectIfAuthenticated().then((redirected) => {
        if (!redirected) loadQrCode();
    });
})();
