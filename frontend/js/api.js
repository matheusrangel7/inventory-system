const API_BASE = "/api";
const SESSION_EXPIRED_PATH = "/sessao-expirada";
const LOGIN_PATH = "/login";

let refreshPromise = null;
let sessionExpiredRedirecting = false;

async function parseResponse(response) {
    const data = await response.json().catch(() => ({}));
    return {
        ok: response.ok,
        status: response.status,
        data,
    };
}

function getCookie(name) {
    const prefix = `${encodeURIComponent(name)}=`;
    const cookie = document.cookie
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix));

    if (!cookie) return "";

    return decodeURIComponent(cookie.slice(prefix.length));
}

function isUnsafeMethod(method) {
    return !["GET", "HEAD", "OPTIONS", "TRACE"].includes(String(method || "GET").toUpperCase());
}

function getCsrfTokenForRequest(path, method) {
    if (!isUnsafeMethod(method)) return "";

    if (path === "/auth/refresh" || path === "/auth/logout") {
        return getCookie("csrf_refresh_token") || getCookie("csrf_access_token");
    }

    return getCookie("csrf_access_token");
}

function buildRequestHeaders(path, method, headers = {}) {
    const finalHeaders = {
        "Content-Type": "application/json",
        ...headers,
    };

    const csrfToken = getCsrfTokenForRequest(path, method);
    if (csrfToken && !finalHeaders["X-CSRF-TOKEN"]) {
        finalHeaders["X-CSRF-TOKEN"] = csrfToken;
    }

    return finalHeaders;
}

function isProtectedPage() {
    return window.location.pathname.startsWith("/painel/");
}

function shouldRedirectToSessionExpired() {
    return isProtectedPage() && window.location.pathname !== SESSION_EXPIRED_PATH;
}

function redirectToSessionExpired(reason = "expired") {
    if (!shouldRedirectToSessionExpired() || sessionExpiredRedirecting) return;

    sessionExpiredRedirecting = true;

    try {
        window.sessionStorage.setItem("invubi.sessionExpired.reason", reason);
    } catch {
        // sessionStorage pode estar indisponível em modo privado/restrito.
    }

    window.location.replace(`${SESSION_EXPIRED_PATH}?reason=${encodeURIComponent(reason)}`);
}

function shouldAttemptRefresh(path, options = {}) {
    if (options.skipRefresh) return false;

    const authPathsWithoutRefresh = [
        "/auth/login",
        "/auth/logout",
        "/auth/refresh",
        "/auth/verify-mfa",
        "/auth/enroll-mfa/setup",
        "/auth/enroll-mfa/confirm",
        "/auth/complete-registration",
    ];

    return !authPathsWithoutRefresh.includes(path);
}

async function performRefreshRequest() {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: buildRequestHeaders("/auth/refresh", "POST"),
    });

    const { ok, data } = await parseResponse(response);
    return ok && data.success === true;
}

async function refreshSession() {
    if (!refreshPromise) {
        refreshPromise = performRefreshRequest()
            .catch(() => false)
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
}

async function apiRequest(path, options = {}) {
    const {
        skipRefresh,
        skipSessionExpiredRedirect,
        _retryingAfterRefresh,
        headers = {},
        ...fetchOptions
    } = options;

    const method = fetchOptions.method || "GET";

    try {
        const response = await fetch(`${API_BASE}${path}`, {
            credentials: "include",
            ...fetchOptions,
            headers: buildRequestHeaders(path, method, headers),
        });

        const { ok, status, data } = await parseResponse(response);

        if (status === 401 && !_retryingAfterRefresh && shouldAttemptRefresh(path, { skipRefresh })) {
            const refreshed = await refreshSession();
            if (refreshed) {
                return apiRequest(path, {
                    ...options,
                    _retryingAfterRefresh: true,
                });
            }

            if (!skipSessionExpiredRedirect) {
                redirectToSessionExpired("expired");
            }
        } else if (status === 401 && !skipSessionExpiredRedirect && !shouldAttemptRefresh(path, { skipRefresh })) {
            redirectToSessionExpired("expired");
        }

        return {
            ok,
            status,
            success: data.success === true,
            message: data.message || null,
            error: data.error || data.msg || null,
            data: data.data ?? null,
        };
    } catch {
        return {
            ok: false,
            status: 0,
            success: false,
            error: "Sem ligação ao servidor. Tente novamente.",
            message: null,
            data: null,
        };
    }
}

const api = {
    get(path, options) {
        return apiRequest(path, { method: "GET", ...options });
    },
    post(path, body, options = {}) {
        return apiRequest(path, {
            method: "POST",
            body: body ? JSON.stringify(body) : undefined,
            ...options,
        });
    },
    put(path, body, options = {}) {
        return apiRequest(path, {
            method: "PUT",
            body: body ? JSON.stringify(body) : undefined,
            ...options,
        });
    },
    delete(path, options = {}) {
        return apiRequest(path, { method: "DELETE", ...options });
    },
};
