// =======================================================================
//  api.js - غلاف موحّد لكل نداءات fetch نحو الخادم
// =======================================================================
async function apiFetch(path, { method = 'GET', body = null, isForm = false } = {}) {
    const headers = {};
    if (State.token) headers['Authorization'] = 'Bearer ' + State.token;

    let fetchBody = body;
    if (body && !isForm) {
        headers['Content-Type'] = 'application/json';
        fetchBody = JSON.stringify(body);
    }

    let res;
    try {
        res = await fetch('/api' + path, { method, headers, body: fetchBody });
    } catch (e) {
        throw new Error('تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت.');
    }

    let data = null;
    try { data = await res.json(); } catch (e) { /* استجابة بلا محتوى */ }

    if (!res.ok) {
        const message = (data && data.error) || `خطأ (${res.status})`;
        if (res.status === 401) {
            setToken(null);
            State.currentUser = null;
        }
        throw new Error(message);
    }
    return data;
}

function apiGet(path) { return apiFetch(path); }
function apiPost(path, body) { return apiFetch(path, { method: 'POST', body }); }
function apiPut(path, body) { return apiFetch(path, { method: 'PUT', body }); }
function apiDelete(path) { return apiFetch(path, { method: 'DELETE' }); }
function apiUpload(path, formData, method = 'POST') {
    return apiFetch(path, { method, body: formData, isForm: true });
}
