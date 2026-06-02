const AUTH_PATHS = {
    login: "/login",
    sessionExpired: "/sessao-expirada",
    enrollMfa: "/configurar-mfa",
    register: "/primeiro-acesso",
    adminDashboard: "/painel/admin",
    gestorDashboard: "/painel/gestor",
};

function isProtectedDashboardPath() {
    return window.location.pathname.startsWith("/painel/");
}

function redirectToLogin(params = "") {
    window.location.href = `${AUTH_PATHS.login}${params}`;
}

function redirectToSessionExpired(reason = "expired") {
    if (!isProtectedDashboardPath()) {
        redirectToLogin("?session=expired");
        return;
    }

    window.location.replace(`${AUTH_PATHS.sessionExpired}?reason=${encodeURIComponent(reason)}`);
}

function getDashboardPath(role) {
    if (role === "Administrador") return AUTH_PATHS.adminDashboard;
    if (role === "Gestor") return AUTH_PATHS.gestorDashboard;
    return AUTH_PATHS.login;
}

function redirectAfterAuth(user) {
    if (!user?.role) {
        redirectToLogin();
        return;
    }
    window.location.href = getDashboardPath(user.role);
}

async function redirectIfAuthenticated() {
    const user = await fetchCurrentUser({ skipSessionExpiredRedirect: true });
    if (user?.role) {
        window.location.href = getDashboardPath(user.role);
        return true;
    }
    return false;
}

async function fetchCurrentUser(options = {}) {
    const result = await api.get("/auth/me", options);
    if (!result.success) return null;
    return result.data;
}

async function requireAuth() {
    const user = await fetchCurrentUser();
    if (!user) {
        redirectToSessionExpired("expired");
        return null;
    }
    return user;
}

async function logout() {
    try {
        await api.post("/auth/logout", null, { skipRefresh: true, skipSessionExpiredRedirect: true });
    } finally {
        redirectToLogin();
    }
}

let protectedSessionCheckInFlight = false;
let lastProtectedSessionCheckAt = 0;

async function validateProtectedSession({ force = false } = {}) {
    if (!isProtectedDashboardPath()) return;

    const now = Date.now();
    if (!force && now - lastProtectedSessionCheckAt < 5000) return;
    if (protectedSessionCheckInFlight) return;

    lastProtectedSessionCheckAt = now;
    protectedSessionCheckInFlight = true;

    try {
        const user = await fetchCurrentUser();
        if (!user) redirectToSessionExpired("expired");
    } finally {
        protectedSessionCheckInFlight = false;
    }
}

function startProtectedSessionMonitor() {
    if (!isProtectedDashboardPath()) return;

    document.addEventListener("click", () => {
        validateProtectedSession();
    }, true);

    window.addEventListener("focus", () => {
        validateProtectedSession();
    });
}

startProtectedSessionMonitor();
