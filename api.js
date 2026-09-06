/* ============================================================================
   Finance bot Web App — tiny API client (shared by all tabs)
   ----------------------------------------------------------------------------
   Exposes a global `App` object. Loaded AFTER config.js and the Telegram
   web-app script, BEFORE each page's inline script.

   Why a wrapper:
   - one place to prefix API_BASE and send the ngrok-skip-browser-warning header
     (free ngrok otherwise returns an HTML interstitial that breaks .json()),
   - attaches the signed Telegram initData as an `Authorization: tma …` header
     on every request, so the backend can verify it and authenticate the user,
   - resolves the Telegram user id (with a browser/dev fallback),
   - keeps the 3 HTML pages small and consistent.
   ============================================================================ */
(function () {
  var cfg = window.APP_CONFIG || {};
  var tg = (window.Telegram && window.Telegram.WebApp) || null;

  // Initialise the Telegram WebApp as early as possible so initDataUnsafe.user
  // is populated before we read it.
  if (tg && typeof tg.ready === 'function') { try { tg.ready(); } catch (e) {} }

  var base = String(cfg.API_BASE || '').replace(/\/+$/, '');

  // --- Telegram user id resolution ----------------------------------------
  // We try HARD to find the REAL Telegram id, from three independent sources,
  // because initDataUnsafe.user can be empty depending on client/launch method:
  //   1. tg.initDataUnsafe.user.id          (the normal path)
  //   2. tg.initData                        (raw "user=<json>&hash=…" string)
  //   3. location.hash #tgWebAppData=…      (raw launch fragment)
  // The real id (only ever from Telegram) is cached in localStorage so the
  // fragment-less views keep using it after in-app navigation.
  //
  // There is intentionally NO fake fallback id anymore. If we can't find a real
  // Telegram id and no explicit ?uid= test override is given, userId stays 0 and
  // we DO NOT create a user — so a junk id like 123456789 can never be created.
  var UID_KEY = 'app_uid';
  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k, v); } catch(e){} }

  // Pull "user=<json>" out of a urlencoded initData string and return its id.
  function idFromInitDataString(s) {
    if (!s) return 0;
    try {
      var raw = new URLSearchParams(s).get('user');
      if (!raw) return 0;
      var user = JSON.parse(raw);
      return (user && user.id) ? Number(user.id) : 0;
    } catch (e) { return 0; }
  }

  function telegramUserId() {
    // 1) structured
    var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    if (u && u.id) return Number(u.id);
    // 2) raw initData string
    var fromInit = idFromInitDataString(tg && tg.initData);
    if (fromInit) return fromInit;
    // 3) raw launch fragment (#tgWebAppData=<urlencoded initData>)
    var hash = (location.hash || '').replace(/^#/, '');
    var tgData = new URLSearchParams(hash).get('tgWebAppData');
    var fromHash = idFromInitDataString(tgData);
    if (fromHash) return fromHash;
    return 0;
  }

  function resolveUserId() {
    var live = telegramUserId();
    if (live) { lsSet(UID_KEY, String(live)); return { id: live, src: 'telegram' }; }

    var fromQuery = Number(new URLSearchParams(location.search).get('uid'));
    if (fromQuery) return { id: fromQuery, src: 'uid-param' };   // explicit testing override

    var stored = Number(lsGet(UID_KEY));
    if (stored) return { id: stored, src: 'stored-telegram' };   // real id seen earlier this device

    var dev = Number(cfg.DEV_USER_ID) || 0;                      // only if YOU set a real id in config
    if (dev) return { id: dev, src: 'config-dev-id' };

    return { id: 0, src: 'none' };                               // no real id → will NOT create a user
  }
  var resolved = resolveUserId();
  var userId = resolved.id;
  var userSrc = resolved.src;
  var inTelegram = (userSrc === 'telegram' || userSrc === 'stored-telegram');
  try {
    if (userSrc === 'none') {
      console.error('[App] No Telegram user id found — app was not opened from Telegram ' +
        'and no ?uid= / DEV_USER_ID is set. NOT creating a user.');
    } else {
      console.info('[App] user_id =', userId, '(source: ' + userSrc + ')');
    }
  } catch (e) {}

  // --- raw signed initData (the actual auth credential) -------------------
  // Unlike the user id above (which comes from initDataUnsafe and is spoofable),
  // the RAW initData string is signed by Telegram with the bot token. We send it
  // on every request in an `Authorization: tma <initData>` header; the backend
  // verifies the hash and derives the user from it (it must NOT trust a client
  // user_id). Single-page app, so we just read it live from the SDK each load
  // (or the launch fragment as a fallback) — no cross-page persistence needed.
  function rawInitData() {
    if (tg && tg.initData) return tg.initData;                  // normal path
    var hash = (location.hash || '').replace(/^#/, '');
    return new URLSearchParams(hash).get('tgWebAppData') || ''; // launch fragment fallback
  }
  var initData = rawInitData();

  // Carry the Telegram launch fragment across in-app navigation so initData stays
  // available on every tab (defence-in-depth alongside the persisted id above).
  function preserveHashOnLinks() {
    if (!location.hash) return;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href && /\.html($|\?)/.test(href) && href.indexOf('#') === -1) {
        links[i].setAttribute('href', href + location.hash);
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preserveHashOnLinks);
  else preserveHashOnLinks();

  // --- transactions cache (shared across tabs) ----------------------------
  // Transactions only change when the user creates or deletes them, so we cache
  // the last known list per user. Every tab paints its count badge (and the
  // table its rows) from this cache INSTANTLY on load — no flash to 0 and back.
  // A background fetch then reconciles silently and only updates if it differs.
  var TX_KEY = 'app_tx_' + (userId || 'anon');
  function getCachedTx() {
    try { var v = JSON.parse(localStorage.getItem(TX_KEY)); return Array.isArray(v) ? v : null; }
    catch (e) { return null; }
  }
  function setCachedTx(list) {
    try { localStorage.setItem(TX_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch (e) {}
  }
  // Count as the UI shows it: scoped to the active account when one is selected. The badge
  // is painted from here on DOM-ready, so it must apply the same scope the views do —
  // otherwise it would flash (and then overwrite) an all-accounts number. A transfer counts
  // on both of its accounts, matching scopedTX() in index.html.
  function cachedCount() {
    var c = getCachedTx();
    if (!c) return null;
    var acc = getActiveAccount();
    if (!acc) return c.length;
    function refId(obj, flat) { return (obj && obj.id != null) ? obj.id : flat; }
    return c.filter(function (tx) {
      return String(refId(tx.account_from, tx.account_from_id)) === String(acc)
          || String(refId(tx.account_to, tx.account_to_id)) === String(acc);
    }).length;
  }

  // Paint the nav count badge from cache the moment the DOM is ready (all tabs).
  function paintBadgeFromCache() {
    var el = document.getElementById('countBadge');
    var c = cachedCount();
    if (el && c != null) el.textContent = c;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintBadgeFromCache);
  else paintBadgeFromCache();

  // core fetch: adds base, JSON + ngrok headers, throws on non-2xx
  async function req(path, opts) {
    opts = opts || {};
    if (!base) throw new Error('API_BASE is not set — edit config.js');
    var headers = Object.assign({
      'Accept': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    }, opts.headers || {});
    // Authenticate every request with the signed Telegram initData. The backend
    // verifies the hash and derives the user from it — don't trust client user_id.
    if (initData && !headers['Authorization']) {
      headers['Authorization'] = 'tma ' + initData;
    }
    if (opts.body != null && typeof opts.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }
    var res = await fetch(base + path, Object.assign({}, opts, { headers: headers }));
    if (!res.ok) {
      var detail = '';
      try { detail = ' — ' + (await res.text()).slice(0, 200); } catch (e) {}
      throw new Error('HTTP ' + res.status + detail);
    }
    var text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // Build a query string from the extra params only. The user is identified by
  // the signed initData auth header (see req()), never by a client-sent user_id.
  var qp = function (extra) {
    var s = new URLSearchParams(extra || {}).toString();
    return s ? '?' + s : '';
  };

  /* -------- user --------
     The "create user" POST is fired immediately when the app opens (see the
     auto-call near the bottom). It's memoised, so each page's init can call
     ensureUser() / await App.ready again without sending a second request. */
  var _userPromise = null;
  function ensureUser() {
    if (_userPromise) return _userPromise;
    _userPromise = (async function () {
      if (!userId) return null;
      if (!base) return null; // API_BASE not set yet — nothing to call
      try {
        return await req('/user', { method: 'POST' }); // user derived from initData header
      } catch (e) { console.error('[App] ensureUser failed', e); return null; }
    })();
    return _userPromise;
  }

  /* -------- reference data (dropdowns) -------- */
  // Categories are scoped to a transaction type — the backend requires type_id and
  // returns only the categories that belong to it. Pass the selected type's id.
  function getCategories(typeId) { return req('/categories' + qp({ type_id: typeId })); }
  // The user's OWN categories, across every type — what the Settings section lists and the
  // only ones they may rename or delete. The seeded ones (user_id IS NULL) are shared and
  // deliberately excluded, which is what /me means here: scoped to the caller, not to a type.
  function getOwnCategories() { return req('/categories/me' + qp()); }
  function getCounterparties() { return req('/counterparties' + qp()); } // user from initData header
  function getProviders() { return req('/providers' + qp()); }           // user from initData header
  function getTransactionTypes() { return req('/types' + qp()); }        // user from initData header

  /* -------- dictionaries (Settings screen) --------
     Categories, counterparties and providers are user-owned reference lists sharing one
     contract: POST { name }, PUT { id, name }, DELETE { id } — each 404ing when the row
     isn't the caller's to touch.

     No user_id on the wire, by design: every route derives the owner from the signed
     initData header (see req), which is the only identity the backend trusts. A client-sent
     one would be unverifiable, so these bodies carry nothing but the fields being changed. */
  function createCategory(name) {
    return req('/category', { method: 'POST', body: JSON.stringify({ name: name }) });
  }
  function updateCategory(id, name) {
    return req('/category', { method: 'PUT', body: JSON.stringify({ id: Number(id), name: name }) });
  }
  function deleteCategory(id) {
    return req('/category', { method: 'DELETE', body: JSON.stringify({ id: Number(id) }) });
  }
  function createCounterparty(name) {
    return req('/counterparty', { method: 'POST', body: JSON.stringify({ name: name }) });
  }
  function deleteCounterparty(id) {
    return req('/counterparty', { method: 'DELETE', body: JSON.stringify({ id: Number(id) }) });
  }
  function createProvider(name) {
    return req('/provider', { method: 'POST', body: JSON.stringify({ name: name }) });
  }
  function deleteProvider(id) {
    return req('/provider', { method: 'DELETE', body: JSON.stringify({ id: Number(id) }) });
  }

  /* -------- renaming (Settings › inline edit) --------
     PUT <resource> with { id, name }, mirroring the DELETE contract above. The response is
     the updated record. */
  function updateCounterparty(id, name) {
    return req('/counterparty', { method: 'PUT', body: JSON.stringify({ id: Number(id), name: name }) });
  }
  function updateProvider(id, name) {
    return req('/provider', { method: 'PUT', body: JSON.stringify({ id: Number(id), name: name }) });
  }
  // AccountUpdate replaces the whole record (name + balance + currency are all required),
  // so callers pass every field, not just the one they changed.
  function updateAccount(id, fields) {
    return req('/account', {
      method: 'PUT',
      body: JSON.stringify(Object.assign({ id: Number(id) }, fields))
    });
  }

  /* -------- accounts --------
     Same owner-from-initData contract as the dictionaries above, plus an opening
     balance. Deleting an account leaves its transactions in place with account_from_id /
     account_to_id cleared (both FKs are ON DELETE SET NULL). */
  async function getAccounts() {
    var list = await req('/accounts' + qp());
    setCachedAccounts(list || []);
    return list || [];
  }
  // `currency` is the unit the account (and its opening balance) is denominated in. Pydantic
  // ignores fields the schema doesn't declare, so sending it is safe before the backend
  // stores it — it just won't come back from GET /accounts until the column exists.
  function createAccount(name, balance, currency) {
    return req('/account', {
      method: 'POST',
      body: JSON.stringify({ name: name, balance: Number(balance) || 0, currency: currency })
    });
  }
  function deleteAccount(id) {
    return req('/account', { method: 'DELETE', body: JSON.stringify({ id: Number(id) }) });
  }

  /* -------- accounts: cache + the active one --------
     The account picker sits in the top bar, so it must paint the right name on the
     FIRST frame — hence the same cache-then-reconcile trick the transactions use.
     The active account is the app-wide scope ('' = all accounts) and is remembered
     per user until they pick another one. */
  var ACC_KEY = 'app_accs_' + (userId || 'anon');
  var ACTIVE_ACC_KEY = 'app_acc_active_' + (userId || 'anon');
  function getCachedAccounts() {
    try { var v = JSON.parse(localStorage.getItem(ACC_KEY)); return Array.isArray(v) ? v : null; }
    catch (e) { return null; }
  }
  function setCachedAccounts(list) {
    try { localStorage.setItem(ACC_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch (e) {}
  }
  function getActiveAccount() { return lsGet(ACTIVE_ACC_KEY) || ''; }
  function setActiveAccount(id) { lsSet(ACTIVE_ACC_KEY, id == null ? '' : String(id)); }

  /* -------- transactions -------- */
  // Every successful fetch refreshes the shared cache so other tabs render instantly.
  async function getTransactions() {
    var list = await req('/transactions' + qp());
    setCachedTx(list || []);
    return list || [];
  }
  // `data.account_from_id` is the account the money moves on (TransactionCreate). A transfer
  // also carries `account_to_id` — the account it lands on, account_from being the one it
  // leaves; every other type sends null there.
  function createTransaction(data) {
    return req('/transaction', { method: 'POST', body: JSON.stringify(data) });
  }
  // PUT /transaction expects the full record incl. { id } (TransactionUpdate schema)
  function updateTransaction(data) {
    return req('/transaction', { method: 'PUT', body: JSON.stringify(data) });
  }
  // DELETE /transaction expects a JSON body { id } (TransactionDelete schema)
  function deleteTransaction(id) {
    return req('/transaction', { method: 'DELETE', body: JSON.stringify({ id: Number(id) }) });
  }
  // DELETE /transactions clears all transactions for the authenticated user
  function clearTransactions() { return req('/transactions' + qp(), { method: 'DELETE' }); }

  /* -------- helpers -------- */
  // Display label for a reference object ({id, name}). Reference data is single-name
  // (Russian) now — the old bilingual name_en/name_uk pair is kept only as a fallback
  // so a stale cached transaction still renders a label instead of a blank cell.
  function pickName(obj) {
    if (!obj) return '';
    return obj.name || obj.name_uk || obj.name_en || '';
  }

  // Immediately create the user the moment the web app opens.
  var ready = ensureUser();

  window.App = {
    base: base,
    userId: userId,
    initData: initData,
    inTelegram: inTelegram,
    configured: !!base,
    ready: ready,
    req: req,
    ensureUser: ensureUser,
    getCategories: getCategories,
    getOwnCategories: getOwnCategories,
    createCategory: createCategory,
    updateCategory: updateCategory,
    deleteCategory: deleteCategory,
    getCounterparties: getCounterparties,
    getProviders: getProviders,
    getTransactionTypes: getTransactionTypes,
    createCounterparty: createCounterparty,
    deleteCounterparty: deleteCounterparty,
    updateCounterparty: updateCounterparty,
    createProvider: createProvider,
    deleteProvider: deleteProvider,
    updateProvider: updateProvider,
    getAccounts: getAccounts,
    createAccount: createAccount,
    deleteAccount: deleteAccount,
    updateAccount: updateAccount,
    cachedAccounts: getCachedAccounts,     // last known list (or null) — for instant render
    setCachedAccounts: setCachedAccounts,  // keep cache in sync after create/delete
    getActiveAccount: getActiveAccount,    // '' = all accounts
    setActiveAccount: setActiveAccount,
    getTransactions: getTransactions,
    cachedTransactions: getCachedTx,   // last known list (or null) — for instant render
    cachedCount: cachedCount,          // last known count (or null)
    setCachedTransactions: setCachedTx,// keep cache in sync after create/delete
    createTransaction: createTransaction,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,
    clearTransactions: clearTransactions,
    pickName: pickName
  };
})();
