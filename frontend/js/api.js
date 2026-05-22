const API_BASE = "/api";

async function parseResponse(response) {
    const data = await response.json().catch(() => ({}));
    return {
        ok: response.ok,
        status: response.status,
        data,
    };
}

async function apiRequest(path, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            ...options,
        });

        const { ok, status, data } = await parseResponse(response);

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
};