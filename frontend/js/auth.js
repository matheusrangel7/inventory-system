const AUTH_PATHS = {
    login: "/pages/auth/login.html",
    enrollMfa: "/pages/auth/enroll-mfa.html",
    register: "/pages/auth/firstlogin.html",
    adminDashboard: "/pages/dashboard/admin/dashboard.html",
    gestorDashboard: "/pages/dashboard/user/dashboard.html",
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
        await api.post("/auth/logout");
    } finally {
        redirectToLogin();
    }
}