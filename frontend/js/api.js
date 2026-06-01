const API_BASE = "/api";

async function parseResponse(response) {
    const data = await response.json().catch(() => ({}));
    return {
        ok: response.ok,
        status: response.status,
        data,
    };
}

function shouldAttemptRefresh(path, options) {
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

async function refreshSession() {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
        },
    });

    const { ok, data } = await parseResponse(response);
    return ok && data.success === true;
}

async function apiRequest(path, options = {}) {
    const { skipRefresh, _retryingAfterRefresh, headers = {}, ...fetchOptions } = options;

    try {
        const response = await fetch(`${API_BASE}${path}`, {
            credentials: "include",
            ...fetchOptions,
            headers: {
                "Content-Type": "application/json",
                ...headers,
            },
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
        }

        return {
            ok,
            status,
            success: data.success === true,
            message: data.message || null,
            error: data.error || null,
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