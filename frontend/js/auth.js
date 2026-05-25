const AUTH_PATHS = {
    login: "/login",
    enrollMfa: "/configurar-mfa",
    register: "/primeiro-acesso",
    adminDashboard: "/painel/admin",
    gestorDashboard: "/painel/gestor",
};

function redirectToLogin() {
    window.location.href = AUTH_PATHS.login;
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
    const user = await fetchCurrentUser();
    if (user?.role) {
        window.location.href = getDashboardPath(user.role);
        return true;
    }
    return false;
}

async function fetchCurrentUser() {
    const result = await api.get("/auth/me");
    if (!result.success) return null;
    return result.data;
}

async function requireAuth() {
    const user = await fetchCurrentUser();
    if (!user) {
        redirectToLogin();
        return null;
    }
    return user;
}

async function logout() {
    try {
        await api.post("/auth/logout", null, { skipRefresh: true });
    } finally {
        redirectToLogin();
    }
}
