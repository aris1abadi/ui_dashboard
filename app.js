// --- DEFAULTS & KONSTANTA ---
// Broker MQTT sendiri (Mosquitto di VPS): websocket-nya lewat domain dashboard
// (sensor-nginx → karjoagro-mqtt:9001). Hosting statis (GitHub Pages) tidak punya
// jalur itu → pakai domain produksi.
const defaultMqttUrl = (() => {
  const loc = typeof window !== 'undefined' ? window.location : null;
  const host = `${loc?.host || ''}`;
  const statis = /github\.io|pages\.dev|netlify\.app|vercel\.app/i.test(host);
  if (loc?.protocol === 'https:' && host && !statis) return `wss://${host}/mqtt`;
  return 'wss://kontrol.karjoagro.my.id/mqtt';
})();
const defaults = {
  localBaseUrl: 'http://192.168.4.1',
  manualDurationMs: 15000,
  uiId: '',
  kontrolIds: ['KA-0000'],
  kontrolAliases: {},
  cloudBaseUrl: 'https://iot.karjoagro.my.id',
  cloudReadToken: '',
  mqtt: {
    url: defaultMqttUrl,
    username: '',
    password: '',
    prefixOut: 'abadinet-out',
    prefixIn: 'abadinet-in',
    kontrolId: 'KA-0000'
  }
};
const loginSessionKey = 'karjo_ui_authenticated';
const LOCAL_PROBE_WINDOW_MS = 15000;
const LOCAL_PROBE_INTERVAL_MS = 3000;
const LOCAL_FALLBACK_AFTER_MS = 20000;
  const themeOptions = ['dark', 'light', 'ocean', 'sunset'];
  const themeClassMap = { light: 'theme-light', ocean: 'theme-ocean', sunset: 'theme-sunset' };
  const LORA_CHANNEL_MIN = 0;
  const LORA_CHANNEL_MAX = 83;
  // Rentang level air (cm) — harus sama dengan config::WATER_LEVEL_MIN_CM/MAX_CM.
  // Titik 0 = permukaan tanah: minus = air di bawah, plus = air di atas.
  const WATER_LEVEL_MIN_CM = -15;
  const WATER_LEVEL_MAX_CM = 15;
const LEGACY_MQTT_USERNAME = 'abadinet';
const LEGACY_MQTT_PASSWORD = 'abadinet123';
const MQTT_AUTH_ERROR_PATTERNS = [
  'not authorized',
  'unauthorized',
  'authorization failed',
  'bad username or password',
  'invalid username or password',
  'connack 4',
  'connack 5',
  'connection refused: not authorized'
];

// --- FUNGSI BANTUAN MURNI ---
function normalizeKontrolId(v) { return `${v || ''}`.trim(); }
function isValidKontrolId(v) { const n = normalizeKontrolId(v); return n && n.length >= 3 && n.length <= 24 && /^[A-Za-z0-9-_]+$/.test(n); }
function normalizeKontrolIdList(list, fallbackId) { 
  const normalizedFallback = normalizeKontrolId(fallbackId);
  const values = new Set();
  if (normalizedFallback) values.add(normalizedFallback);
  if (Array.isArray(list)) {
    list.forEach(i => {
      const n = normalizeKontrolId(i);
      if (n) values.add(n);
    });
  }
  if (!values.size) values.add(defaults.mqtt.kontrolId);
  return Array.from(values);
}
function normalizeConnectionPreference(v) {
  return `${v || ''}`.trim().toLowerCase() === 'local' ? 'local' : 'mqtt';
}
function isLegacySharedMqttCredential(username, password) {
  return `${username || ''}`.trim() === LEGACY_MQTT_USERNAME && `${password || ''}`.trim() === LEGACY_MQTT_PASSWORD;
}
function isMqttAuthError(error) {
  const message = `${error?.message || error || ''}`.trim().toLowerCase();
  if (!message) return false;
  return MQTT_AUTH_ERROR_PATTERNS.some(pattern => message.includes(pattern));
}
function toNumber(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
function toBool(v) { return v === true || v === '1' || v === 1; }
function normalisasiSumberTrigger(v) {
  const teks = `${v || ''}`.trim().toLowerCase();
  if (!teks) return 'none';
  if (teks === 'schedule' || teks === 'jadwal') return 'schedule';
  if (teks === 'threshold' || teks === 'auto' || teks === 'otomatis' || teks === 'auto_threshold') return 'threshold';
  if (teks === 'manual' || teks === 'button' || teks === 'btn') return 'manual';
  return teks;
}
function parsePayloadKontrol(muatan) {
  if (muatan === null || muatan === undefined || muatan === '') return {};
  if (typeof muatan === 'object') return muatan;
  try { return JSON.parse(muatan); } catch { return {}; }
}
function ambilDaftar(muatan, key) {
  const isian = parsePayloadKontrol(muatan);
  if (Array.isArray(isian)) return isian;
  if (key && Array.isArray(isian[key])) return isian[key];
  return [];
}
// Payload respSensor PARSIAL (penghematan kuota): firmware menambahkan
// "partial": true dan hanya mengirim sensor yang nilainya berubah.
function isPartialSensorPayload(muatan) {
  const isian = parsePayloadKontrol(muatan);
  return isian?.partial === true || isian?.partial === 'true' || isian?.delta === true;
}
function parseStatusJson(muatan) {
  const isian = parsePayloadKontrol(muatan);
  const status = isian.status && typeof isian.status === 'object' ? isian.status : isian;
  return {
    state: status.state || '',
    link: status.link || '',
    configuredSsid: status.configuredSsid || '',
    connectedSsid: status.connectedSsid || '',
    ip: status.ip || '',
    nodeCount: toNumber(status.nodeCount),
    kontrolId: status.kontrolId || '',
    apMode: toBool(status.apMode),
    apSsid: status.apSsid || '',
    // Modem USB (USB host) — jalur internet yang dipakai otomatis bila modem aktif
    usbModemSupported: toBool(status.usbModem?.supported),
    usbModemActive: toBool(status.usbModem?.active),
    usbModemConnected: toBool(status.usbModem?.connected),
    usbModemMode: status.usbModem?.mode || '',
    usbModemIp: status.usbModem?.ip || '',
    usbModemText: status.usbModem?.text || '',
    fixedTaskCount: toNumber(status.fixedTaskCount ?? status.taskCount ?? 0),
    allowTaskCreate: status.allowTaskCreate !== false,
    allowTaskDelete: status.allowTaskDelete !== false,
    loraChannel: toNumber(status.loraChannel ?? status.channel ?? 4),
    loraChannelStored: toBool(status.loraChannelStored),
    loraDefaultChannel: toNumber(status.loraDefaultChannel ?? 4),
    // Identitas firmware (dikirim sejak firmware v1.0.0)
    firmwareName: status.firmwareName || '',
    firmwareVersion: status.firmwareVersion || '',
    // Sumber daya: baterai LiFePO4 atau power supply
    power: {
      onBattery: toBool(status.power?.onBattery),
      source: status.power?.source || '',
      voltage: toNumber(status.power?.voltage, null),
      percent: toNumber(status.power?.percent, null),
      low: toBool(status.power?.low),
      adc: toNumber(status.power?.adc, null)
    }
  };
}
function parseSensorsJson(muatan) {
  return ambilDaftar(muatan, 'sensors').map(item => ({
    nodeId: toNumber(item.nodeId ?? item.node ?? item.n),
    childId: toNumber(item.childId ?? item.child ?? item.c),
    label: item.label || '',
    sensorType: toNumber(item.sensorType ?? 0),
    valueType: toNumber(item.valueType ?? 0),
    value: item.value === '' || item.value === undefined ? null : toNumber(item.value, null),
    rawValue: item.rawValue === '' || item.rawValue === undefined ? null : toNumber(item.rawValue, null),
    lastSensorRawValue: item.lastSensorRawValue === '' || item.lastSensorRawValue === undefined ? null : toNumber(item.lastSensorRawValue, null),
    moistureDryCalibration: item.moistureDryCalibration === '' || item.moistureDryCalibration === undefined ? 800 : toNumber(item.moistureDryCalibration, 800),
    moistureWetCalibration: item.moistureWetCalibration === '' || item.moistureWetCalibration === undefined ? 490 : toNumber(item.moistureWetCalibration, 490),
    distanceLowCalibration: item.distanceLowCalibration === '' || item.distanceLowCalibration === undefined ? null : toNumber(item.distanceLowCalibration, null),
    distanceHighCalibration: item.distanceHighCalibration === '' || item.distanceHighCalibration === undefined ? null : toNumber(item.distanceHighCalibration, null),
    distanceZeroCalibration: item.distanceZeroCalibration === '' || item.distanceZeroCalibration === undefined ? null : toNumber(item.distanceZeroCalibration, null),
    fuelLowCalibration: item.fuelLowCalibration === '' || item.fuelLowCalibration === undefined ? null : toNumber(item.fuelLowCalibration, null),
    fuelHighCalibration: item.fuelHighCalibration === '' || item.fuelHighCalibration === undefined ? null : toNumber(item.fuelHighCalibration, null),
    fuelZeroCalibration: item.fuelZeroCalibration === '' || item.fuelZeroCalibration === undefined ? null : toNumber(item.fuelZeroCalibration, null),
    lastSeenMs: toNumber(item.lastSeenMs ?? item.lastSeen ?? 0),
    lastSeenAgeMs: toNumber(item.lastSeenAgeMs ?? item.ageMs ?? 0),
    battery: item.battery === null || item.battery === undefined ? null : toNumber(item.battery, null),
    batteryAgeMs: item.batteryAgeMs === null || item.batteryAgeMs === undefined ? null : toNumber(item.batteryAgeMs, null),
    sleepIntervalMs: item.sleepIntervalMs === null || item.sleepIntervalMs === undefined ? null : toNumber(item.sleepIntervalMs, null),
    sleepAgeMs: item.sleepAgeMs === null || item.sleepAgeMs === undefined ? null : toNumber(item.sleepAgeMs, null)
  }));
}
function parseActuatorsJson(muatan) {
  return ambilDaftar(muatan, 'actuators').map(item => ({
    index: toNumber(item.index),
    label: item.label || '',
    nodeId: toNumber(item.nodeId ?? item.node ?? 0),
    childId: toNumber(item.childId ?? item.child ?? 0),
    active: toBool(item.active),
    online: toBool(item.online),
    reportedActive: toBool(item.reportedActive ?? item.nodeReportedActive),
    statusAgeMs: toNumber(item.statusAgeMs ?? 0),
    lastTriggeredMs: toNumber(item.lastTriggeredMs ?? 0),
    stopAtMs: toNumber(item.stopAtMs ?? 0),
    // Diagnostik "kenapa otomasi ambang tidak jalan": siapa yang menahan dan sisa waktunya.
    activePriority: toNumber(item.activePriority ?? 0),
    holdOffPriority: toNumber(item.holdOffPriority ?? 0),
    holdOffActive: toBool(item.holdOffActive) || toNumber(item.holdOffRemainMs ?? 0) > 0,
    holdOffRemainMs: toNumber(item.holdOffRemainMs ?? 0),
    holdRemainMs: toNumber(item.holdRemainMs ?? 0),
    holdReason: item.holdReason || 'none'
  }));
}
function parseTaskSchedulesJson(schedules, label) {
  if (!Array.isArray(schedules)) return [];
  return schedules.map((entry, idx) => ({
    pickupTime: entry.pickupTime || entry.time || '00:00',
    durationMinutes: toNumber(entry.durationMinutes ?? entry.duration ?? 0),
    enabled: entry.enabled !== false && entry.enabled !== 0 && entry.enabled !== '0',
    label: entry.label || label || '',
    slotIndex: toNumber(entry.slotIndex, idx)
  }));
}
function parseTasksJson(muatan) {
  return ambilDaftar(muatan, 'tasks').map(item => {
    const label = item.label || '';
    return {
      index: toNumber(item.index),
      label,
      sensorNode: toNumber(item.sensorNode ?? 0),
      sensorChild: toNumber(item.sensorChild ?? 0),
      actuatorIndex: toNumber(item.actuatorIndex ?? 0),
      threshold: toNumber(item.threshold ?? 0),
      activateDurationMs: toNumber(item.activateDurationMs ?? 0),
      thresholdEnabled: toBool(item.thresholdEnabled),
      thresholdAbove: toBool(item.thresholdAbove),
      actuatorActive: toBool(item.actuatorActive),
      lastSensorValue: item.lastSensorValue === '' || item.lastSensorValue === undefined ? null : toNumber(item.lastSensorValue, null),
      lastSensorRawValue: item.lastSensorRawValue === '' || item.lastSensorRawValue === undefined ? null : toNumber(item.lastSensorRawValue, null),
      lastTriggerSource: normalisasiSumberTrigger(item.lastTriggerSource ?? item.triggerSource ?? item.source ?? item.lastTrigger ?? item.trigger ?? 'none'),
      schedules: parseTaskSchedulesJson(item.schedules || [], label)
    };
  });
}
function bangunPayloadPerintah(cmd, data = {}) { return JSON.stringify({ cmd, ...data }); }
function bangunPayloadPerintahLama(cmd, args = []) {
  if (!Array.isArray(args) || args.length === 0) {
    return bangunPayloadPerintah(cmd);
  }
  if (cmd === 'getLogs') return bangunPayloadPerintah(cmd, { page: toNumber(args[0], 0), limit: toNumber(args[1], 50) });
  if (cmd === 'setActuator') return bangunPayloadPerintah(cmd, { index: toNumber(args[0], 0), action: args[1] || 'off', durationMs: toNumber(args[2], 0) });
  if (cmd === 'runTask' || cmd === 'deleteTask') return bangunPayloadPerintah(cmd, { index: toNumber(args[0], -1) });
  if (cmd === 'setTime') return bangunPayloadPerintah(cmd, { epoch: toNumber(args[0], 0) });
  if (cmd === 'setupWifi') return bangunPayloadPerintah(cmd, { ssid: args[0] || '', pass: args[1] || '' });
  if (cmd === 'setSleep' || cmd === 'setSensorSleep') return bangunPayloadPerintah(cmd, { nodeId: toNumber(args[0], 0), intervalMs: toNumber(args[1], 0) });
  return bangunPayloadPerintah(cmd, { args });
}
async function ambilJson(path, fb = {}, options = {}) { try { const res = await fetch(path, { cache: 'no-store', ...options }); return res.ok ? await res.json() : fb; } catch { return fb; } }
async function ambilTeks(path, fb) { try { const res = await fetch(path, { cache: 'no-store' }); return res.ok ? await res.text() : fb; } catch { return fb; } }
async function ambilJsonDenganBatasWaktu(path, fb = {}, timeoutMs = 2000, options = {}) {
  const pengendali = new AbortController();
  const idBatasWaktu = setTimeout(() => pengendali.abort(), timeoutMs);
  try {
    const res = await fetch(path, { cache: 'no-store', signal: pengendali.signal, ...options });
    return res.ok ? await res.json() : fb;
  } catch {
    return fb;
  } finally {
    clearTimeout(idBatasWaktu);
  }
}
function formatUkuranBerkas(b) { if (!Number.isFinite(b) || b <= 0) return '0 B'; const k=1024, s=['B','KB','MB','GB'], i=Math.min(Math.floor(Math.log(b)/Math.log(k)),s.length-1); return `${parseFloat((b/Math.pow(k,i)).toFixed(1))} ${s[i]}`; }
function formatNilaiSensor(nilai, unit = '') {
  if (nilai === null || nilai === undefined || nilai === '') return '-';
  const numeric = Number(nilai);
  if (!Number.isFinite(numeric)) return `${nilai}${unit ? ` ${unit}` : ''}`;
  return `${numeric.toFixed(1)}${unit ? ` ${unit}` : ''}`;
}
function roundToOneDecimal(nilai) {
  const numeric = Number(nilai);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 10) / 10;
}
function formatLogChartScaleTime(ts) {
  const numeric = Number(ts);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const date = new Date(numeric > 10000000000 ? numeric : numeric * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatCsvDateTime(ts) {
  const numeric = Number(ts);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const date = new Date(numeric > 10000000000 ? numeric : numeric * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function pendekkanTeks(nilai, maxLength = 18) {
  const teks = `${nilai ?? ''}`.trim();
  if (!teks) return '';
  if (teks.length <= maxLength) return teks;
  return `${teks.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}
function formatNilaiAdc(nilai) {
  if (nilai === null || nilai === undefined || nilai === '') return '-';
  const numeric = Number(nilai);
  if (!Number.isFinite(numeric)) return `${nilai}`;
  return `${Math.round(numeric)}`;
}
function isValidRawAdcValue(nilai) {
  const numeric = Number(nilai);
  return Number.isFinite(numeric) && numeric > 0;
}
function pickRawAdcValue(...values) {
  for (const value of values) {
    if (isValidRawAdcValue(value)) return Math.round(Number(value));
  }
  return null;
}
function formatLocalDateTimeInput(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
function parseLocalDateTimeInput(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(date.getTime() / 1000);
}

// --- KOMPONEN ALPINE.JS ---
// Instance Chart.js disimpan di LUAR state Alpine: Alpine memproksi objek
// reaktif, sedangkan Chart.js membandingkan identitas objek internalnya
// (proxy membuat chart.destroy()/update() bermasalah).
const sensorhubChartInstances = {};
// Palet warna grafik — SAMA PERSIS dengan SensorHub (channel_detail.html).
const sensorhubChartPalette = ['#FF1A75', '#ff8a65', '#81c784', '#ba68c8', '#fff176', '#4db6ac', '#e57373', '#90a4ae'];

function app() {
  return {
    // State utama
    isAuthenticated: false, config: JSON.parse(JSON.stringify(defaults)), connectionPreference: normalizeConnectionPreference(localStorage.getItem('karjo_ui_connection_mode')), mode: 'offline', connected: false, network: {}, manualDurationMs: 0, manualDurationMinutes: 0, manualDurationBusy: false, sensors: [], actuators: [], tasks: [], currentTaskIndex: 0, lastUpdate: null, mqttClient: null, refreshTimer: null, uiTimer: null, now: Date.now(), actionInFlight: false, actionTimer: null, pendingKontrolId: null, pendingTaskSave: null, theme: 'dark',
    localDetectTimer: null, localLastSuccessMs: 0, connectionAttemptId: 0,
    localPollingPaused: false, localFallbackNotified: false,
    backgroundImage: localStorage.getItem('karjo_ui_bg') || '',
    loadingTaskIndex: null, selectedTaskInfo: null,
    taskPage: 0, tasksPerPage: 4,
    pwaInstallPrompt: null, pwaInstalled: false,
    showMqttCredentialModal: false,
    mqttCredentialPendingConnect: false,
    mqttConnectAttemptId: 0,
    mqttConnectTimer: null,
    mqttConnectFailureHandled: false,
    mqttPendingConnectError: null,
    loginPending: null,
    loginPendingTimer: null,
    authPasswordPending: null,
    authPasswordPendingTimer: null,
    mqttCredentialForm: { username: '', password: '', error: '', showPassword: false },
    // State UI
    showSettingsModal: false, showTaskModal: false, showScheduleModal: false, showScheduleListModal: false, showLogModal: false, showLoginKontrolModal: false, showAllTasksModal: false, showDeleteConfirm: false, settingsTab: 'status', toast: { visible: false, message: '', type: 'info', timer: null },
    login: { username: '', password: '', kontrolId: '', error: '', newKontrolId: '', newKontrolAlias: '', newKontrolIdError: '', showPassword: false }, lastLoginKontrolSelection: null, loginRole: 'guest',
    authPasswordForm: { currentPassword: '', newPassword: '', confirmPassword: '', error: '', showCurrentPassword: false, showNewPassword: false },
    editingTask: {}, editingSchedule: {}, scheduleListTaskIndex: -1, taskToDelete: null,
    // Daftar node dari /api/nodes (registri + sensor + aktuator)
    registryNodes: [],
    // Pemeliharaan data (padanan perintah serial: reset / factory reset)
    showMaintenanceConfirm: false,
    maintenanceConfirm: { title: '', message: '', confirmText: 'Ya', action: '' },
    factoryResetPassword: '',
    factoryResetBusy: false,
    apInfo: { ssid: '', password: '', url: '' },
    showMoistureCalibrationModal: false,
    moistureCalibrationPollTimer: null,
    moistureCalibration: { nodeId: 0, childId: 0, label: '', rawValue: null, dryValue: 800, wetValue: 490, currentValue: null, error: '', intervalSec: 60 },
    showDistanceCalibrationModal: false,
    distanceCalibrationPollTimer: null,
    distanceCalibration: { nodeId: 0, childId: 0, label: '', rawValue: null, zeroValue: 0, savedZero: 0, currentValue: null, error: '', intervalSec: 60 },
    showFuelCalibrationModal: false,
    showSensorIntervalModal: false,
    // Info node terhubung (baterai, timer/interval, kalibrasi saat ini)
    showNodeInfoModal: false,
    nodeInfo: { nodeId: null, sensors: [], battery: null, batteryAgeMs: null, sleepIntervalMs: null, sleepAgeMs: null, lastSeenAgeMs: null },
    nodeInfoExpandedSensor: null,
    sensorInterval: { nodeId: 0, childId: 0, label: '', intervalSec: 60 },
    fuelCalibrationPollTimer: null,
    fuelCalibration: { nodeId: 0, childId: 0, label: '', rawValue: null, zeroValue: 0, savedZero: 0, currentValue: null, error: '', intervalSec: 60 },
    timeForm: { date: '', time: '' },
    wifiSetup: { ssid: '', pass: '', auth: '', file: null, firmwareName: '' },
    loraChannelSetup: { value: 4, defaultValue: 4, stored: false },
    touchButtons: [], touchSensitivityLoading: false,
    wifiScanResults: [], wifiScanLoading: false, wifiScanError: '', wifiScanAt: null, wifiScanFilter: 'all',
    // deepSleep moved to per-sensor calibration modals
    // State log
    logs: [], logFilter: 'system', logPage: 0, logPerPage: 50, logCount: 0, logStorage: '0 B', logLoading: false, showLogFilterPanel: false, logChartMetric: 'temperature', _chartPointsCache: {}, logChartSelectedIndex: null, logChartHiddenSeries: [], logChartActivePoint: null, logDownload: { start: '', end: '', busy: false, error: '', progress: 0, status: '', totalPages: 0, processedPages: 0, mode: '', totalLogs: 0 }, pendingLogDownloads: {},
    // Cache chart agar tidak rekomputasi tiap render
    _cachedChartSeriesList: null,
    _cachedChartSeriesVersion: 0,
    
    // Properti terhitung
    get paginatedTasks() { const start = this.taskPage * this.tasksPerPage; return this.tasks.slice(start, start + this.tasksPerPage); },
    get totalTaskPages() { return Math.ceil(this.tasks.length / this.tasksPerPage); },
    get currentTask() { if (!this.tasks?.length) return null; if (this.currentTaskIndex >= this.tasks.length) this.currentTaskIndex = 0; if (this.currentTaskIndex < 0) this.currentTaskIndex = this.tasks.length - 1; return this.tasks[this.currentTaskIndex]; },
    get scheduleCount() { return this.tasks.reduce((sum, task) => sum + (task.schedules?.length || 0), 0); },
    get isFixedTaskMode() { return Number(this.network?.fixedTaskCount || 0) > 0; },
    get allowTaskCreate() { return this.network?.allowTaskCreate !== false; },
    get allowTaskDelete() { return this.network?.allowTaskDelete !== false; },
    get activeKontrolId() {
      return normalizeKontrolId(this.network?.kontrolId || this.config?.mqtt?.kontrolId || this.login?.kontrolId || '');
    },
    get loginUiId() {
      return normalizeKontrolId(this.config?.uiId || this.login?.username || '');
    },
    // Portal perangkat (dibuka dari alamat lokal, mis. http://192.168.4.1) selalu
    // login lewat Web API perangkat. Dashboard cloud login lewat MQTT ke kontroler.
    // Tidak ada lagi tombol pilihan "Lokal" di layar login — mode ditentukan dari
    // alamat tempat UI ini dibuka.
    get loginViaLocalApi() {
      return this.isLocalPortalHost;
    },
    get loginConnectionStatus() {
      if (this.mode === 'mqtt' && this.connected) return { text: 'Terhubung ke server online, siap masuk.', variant: 'badge-success' };
      if (this.mode === 'detecting') return { text: 'Menyambungkan ke server online...', variant: 'badge-warn' };
      if (this.connectionPreference === 'local') return { text: 'Mode lokal aktif.', variant: 'badge-info' };
      return { text: 'Belum terhubung ke server online.', variant: 'badge-danger' };
    },
    get loginConnectionBadgeText() {
      if (this.mode === 'mqtt' && this.connected) return 'ONLINE';
      if (this.mode === 'local' || this.connectionPreference === 'local') return 'LOKAL';
      if (this.mode === 'detecting') return 'MENUNGGU';
      return 'OFFLINE';
    },
    get canEditAdminPassword() {
      return this.loginRole === 'admin';
    },
    get loginKontrolButtonLabel() {
      const activeId = normalizeKontrolId(this.login?.kontrolId || this.config?.mqtt?.kontrolId || this.config?.kontrolIds?.[0] || '');
      return activeId ? this.getKontrolLabel(activeId) : 'Pilih ID Kontrol';
    },
    get loginKontrolIds() {
      const activeId = normalizeKontrolId(this.login?.kontrolId || this.config?.mqtt?.kontrolId || '');
      const ids = Array.from(new Set((this.config?.kontrolIds || []).map(normalizeKontrolId).filter(Boolean)));
      if (activeId) {
        return [activeId, ...ids.filter(id => id !== activeId)];
      }
      return ids;
    },
    get showLoRaChannelUI() {
      return this.activeKontrolId.toUpperCase().startsWith('KA-');
    },
    get isGreenhouseFixedMode() {
      const kontrolId = `${this.network?.kontrolId || this.config?.mqtt?.kontrolId || ''}`.trim().toUpperCase();
      return kontrolId.startsWith('GH-') || (this.isFixedTaskMode && !this.allowTaskCreate && !this.allowTaskDelete);
    },
    getTaskLabel(task) {
      return `${task?.label || this.getUiLabel('task')}`.trim() || this.getUiLabel('task');
    },
    getTaskModalTitle() {
      if (this.editingTask?.index >= 0) return 'Ubah Task';
      return this.allowTaskCreate ? 'Tambah Task' : this.getUiLabel('task');
    },
    getTaskModalSubmitLabel() {
      if (this.editingTask?.index >= 0) return 'Simpan Task';
      return this.allowTaskCreate ? 'Simpan Task' : this.getUiLabel('task');
    },
    getTaskEmptyHint() {
      return this.allowTaskCreate
        ? 'Klik tombol ＋ di header untuk menambah Task baru.'
        : `${this.getUiLabel('task')} disiapkan oleh hardware dan tidak bisa ditambah manual.`;
    },
    getTaskDeleteLockedMessage() { return 'Task fixed tidak dapat dihapus.'; },
    getTaskCreateLockedMessage() { return 'Task fixed tidak dapat ditambahkan.'; },
    getFixedActuatorIndexForSensorKey(sensorKey) {
      if (!this.isGreenhouseFixedMode) return null;
      const key = `${sensorKey || ''}`.trim();
      const fixedMap = {
        '1:1': 1,
        '1:2': 2,
        '1:3': 0
      };
      return Object.prototype.hasOwnProperty.call(fixedMap, key) ? fixedMap[key] : null;
    },
    syncFixedTaskActuator() {
      if (!this.isGreenhouseFixedMode || !this.editingTask) return;
      const mapped = this.getFixedActuatorIndexForSensorKey(this.editingTask.sensorKey);
      if (mapped !== null) this.editingTask.actuatorIndex = mapped;
    },
    getUiLabel(key) {
      const labels = {
        sensor: 'Node Sensor',
        actuator: 'Aktuator',
        schedule: 'Jadwal Otomasi',
        threshold: 'Ambang Batas',
        calibration: 'Kalibrasi Kelembapan Tanah',
        calibrationDistance: 'Kalibrasi Ketinggian Air',
        calibrationFuel: 'Kalibrasi Tinggi Cairan',
        connection: 'Status Koneksi',
        task: 'Task',
        log: 'Log Aktivitas',
        node: 'Node',
        nodeSensor: 'Node Sensor',
        loraChannel: 'Saluran Radio',
        value: 'Pembacaan',
        active: 'Aktif'
      };
      return labels[key] || key;
    },
    get moistureCalibrationPreview() {
      const c = this.moistureCalibration || {};
      const raw = Number(c.rawValue);
      const dry = Number(c.dryValue);
      const wet = Number(c.wetValue);
      if (!Number.isFinite(raw) || !Number.isFinite(dry) || !Number.isFinite(wet) || dry === wet) return null;
      if (dry > wet) {
        if (raw >= dry) return 0;
        if (raw <= wet) return 100;
        return Math.max(0, Math.min(100, ((dry - raw) * 100) / (dry - wet)));
      }
      if (raw <= dry) return 0;
      if (raw >= wet) return 100;
      return Math.max(0, Math.min(100, ((raw - dry) * 100) / (wet - dry)));
    },
    getThemeSwatches() {
      return [
        { key: 'dark', label: 'Dark', color: '#0f172a', text: '#e2e8f0', accent: '#25f4b8' },
        { key: 'light', label: 'Light', color: '#f8fafc', text: '#0f172a', accent: '#0f172a' },
        { key: 'ocean', label: 'Ocean', color: '#0f766e', text: '#ecfeff', accent: '#67e8f9' },
        { key: 'sunset', label: 'Sunset', color: '#b45309', text: '#fff7ed', accent: '#fb7185' }
      ];
    },
    get connectionMode() {
      if (this.mode === 'detecting') return 'Mendeteksi koneksi';
      if (!this.connected) return 'Tidak tersambung';
      if (this.mode === 'local') return this.network?.apMode ? 'Lokal (Titik Akses)' : 'Jaringan Lokal';
      if (this.mode === 'mqtt') return 'Koneksi Online';
      return 'Tidak tersambung';
    },
    get isControllerResponsive() {
      if (!this.lastUpdate) return false;
      const updatedAt = this.lastUpdate instanceof Date ? this.lastUpdate.getTime() : new Date(this.lastUpdate).getTime();
      if (!Number.isFinite(updatedAt)) return false;
      return Date.now() - updatedAt <= 45000;
    },
    get statusBadge() { 
      const id = this.config?.mqtt?.kontrolId || '...';
      const label = this.getKontrolLabel(id);
      if (this.mode === 'detecting') return { text: label, variant: 'badge-warn' };
      if (!this.connected) {
        if (this.connectionPreference === 'local') return { text: label, variant: 'badge-danger' };
        return { text: label, variant: 'badge-warn' };
      }
      if (this.mode === 'local') return { text: label, variant: 'badge-info' }; 
      if (this.mode === 'mqtt') return this.isControllerResponsive
        ? { text: label, variant: 'badge-success' }
        : { text: label, variant: 'badge-warn' };
      return { text: label, variant: 'badge-warn' }; 
    },
    get headerStatus() { 
      const id = this.config?.mqtt?.kontrolId || '...'; 
      const label = this.getKontrolLabel(id);
      const uiId = this.config?.uiId || 'UI-XXXX'; 
      if (this.mode === 'detecting') return { text: `${uiId} • ${label}`, variant: 'badge-warn' };
      if (!this.connected) {
        if (this.connectionPreference === 'local') return { text: `${uiId} • ${label}`, variant: 'badge-danger' };
        return { text: `${uiId} • ${label}`, variant: 'badge-warn' };
      }
      if (this.mode === 'local') return { text: `${uiId} • ${label}`, variant: 'badge-info' }; 
      if (this.mode === 'mqtt') return this.isControllerResponsive
        ? { text: `${uiId} • ${label}`, variant: 'badge-success' }
        : { text: `${uiId} • ${label}`, variant: 'badge-warn' };
      return { text: `${uiId} • ${label}`, variant: 'badge-warn' }; 
    },
    get headerStatusTitle() {
      const base = this.headerStatus.text;
      const version = `${this.network?.firmwareVersion || ''}`.trim();
      return version ? `${base} • ${this.firmwareLabel}` : base;
    },
    get firmwareLabel() {
      const name = `${this.network?.firmwareName || ''}`.trim();
      const version = `${this.network?.firmwareVersion || ''}`.trim();
      if (!name && !version) return '-';
      const shown = name || 'Firmware';
      return version ? `${shown} v${version}` : shown;
    },
    getHeaderStatusIcon() {
      if (this.mode === 'detecting') return '◌';
      if (!this.connected) return '●';
      if (this.mode === 'local') return this.network?.apMode ? '◐' : '◔';
      if (this.mode === 'mqtt') return '●';
      return '◌';
    },
    // Status sumber daya: baterai LiFePO4 atau power supply (×)
    get powerStatus() {
      const p = this.network?.power;
      const v = Number(p?.voltage);
      if (!p || !Number.isFinite(v)) {
        return { icon: '🔌', text: '--', variant: 'badge-warn', title: 'Status daya belum tersedia' };
      }
      const pctRaw = Number(p.percent);
      const pct = Number.isFinite(pctRaw) ? Math.round(pctRaw) : null;
      const pctText = pct === null ? '--' : pct + '%';
      if (!p.onBattery) {
        return {
          icon: '🔌',
          text: 'PSU',
          variant: 'badge-info',
          title: `Sumber daya: POWER SUPPLY (Vbat ${v.toFixed(2)} V)`
        };
      }
      // Ringkas: cukup persen. Tegangan lengkap ada di Setelan → Status.
      const text = pct === null ? '--' : `${pct}%`;
      if (p.low) {
        return {
          icon: '🪫',
          text,
          variant: 'badge-danger',
          title: `Baterai LiFePO4 LEMAH: ${v.toFixed(2)} V (${pctText})`
        };
      }
      return {
        icon: '🔋',
        text,
        variant: 'badge-success',
        title: `Baterai LiFePO4: ${v.toFixed(2)} V (${pctText})`
      };
    },
    // Nilai daya mentah (dipakai badge header + Setelan → Status).
    get powerDetail() {
      const p = this.network?.power;
      const v = Number(p?.voltage);
      if (!p || !Number.isFinite(v)) return null;
      const pctRaw = Number(p.percent);
      const pct = Number.isFinite(pctRaw) ? Math.round(pctRaw) : null;
      return {
        voltage: v,
        pct,
        pctText: pct === null ? 'persen belum tersedia' : `${pct}%`,
        low: !!p.low,
        onBattery: !!p.onBattery,
        chem: `${p.chem || ''}`.trim() || 'baterai',
      };
    },
    // Tegangan baterai (hanya di Setelan → Status, tidak di header).
    get powerVoltageText() {
      const d = this.powerDetail;
      if (!d) return '-';
      return `${d.voltage.toFixed(2)} V${d.pct === null ? '' : ` (${d.pct}%)`}`;
    },
    get powerSourceText() {
      const d = this.powerDetail;
      if (!d) return '-';
      return d.onBattery ? `Baterai (${d.chem})` : 'Power Supply';
    },
    get filteredLogs() { if (this.logFilter === 'all') return this.logs; const map = { sensor: 0, button: 1, status: 3 }; if (this.logFilter === 'system') return this.logs.filter(e => e.type !== 0); return this.logs.filter(e => e.type === map[this.logFilter]); },
    get paginatedFilteredLogs() {
      const perPage = Math.max(1, Number(this.logPerPage) || 50);
      const page = Math.max(0, Number(this.logPage) || 0);
      return this.filteredLogs.slice(page * perPage, (page + 1) * perPage);
    },
    get logTotalPages() {
      const perPage = Math.max(1, Number(this.logPerPage) || 50);
      return Math.max(1, Math.ceil(this.filteredLogs.length / perPage));
    },
    get sensorLogEntries() {
      return this.logs.filter(entry => Number(entry?.type) === 0);
    },
    get logChartMetrics() {
      const registered = (this.sensors || [])
        .map(sensor => {
          const nodeId = toNumber(sensor?.nodeId, 0);
          const childId = toNumber(sensor?.childId, 0);
          if (!Number.isFinite(nodeId) || !Number.isFinite(childId)) return null;
          const label = sensor?.label || `Sensor ${nodeId}:${childId}`;
          return {
            key: `${nodeId}:${childId}`,
            label,
            unit: this.getSensorUnit({ sensorNode: nodeId, sensorChild: childId }) || this.getLogMetricUnit(label),
            sensorNode: nodeId,
            sensorChild: childId,
            sensorLabel: label,
            sensorType: toNumber(sensor?.sensorType ?? 0),
            valueType: toNumber(sensor?.valueType ?? 0)
          };
        })
        .filter(Boolean);
      registered.sort((a, b) => {
        const priority = metric => {
          const text = `${metric.label || metric.sensorLabel || ''}`.toLowerCase();
          if (text.includes('suhu') || text.includes('temp') || text.includes('lm35')) return 0;
          if (text.includes('kelembapan udara') || text.includes('hum')) return 1;
          if (text.includes('kelembapan') || text.includes('soil') || text.includes('moist')) return 2;
          const sensorType = Number(metric.sensorType);
          const valueType = Number(metric.valueType);
          if (Number.isFinite(valueType)) return 20 + valueType;
          if (Number.isFinite(sensorType)) return 40 + sensorType;
          return 99;
        };
        const diff = priority(a) - priority(b);
        if (diff !== 0) return diff;
        if (a.sensorNode !== b.sensorNode) return a.sensorNode - b.sensorNode;
        if (a.sensorChild !== b.sensorChild) return a.sensorChild - b.sensorChild;
        return `${a.label}`.localeCompare(`${b.label}`, 'id');
      });
      const registeredHasData = registered.some(metric => this.sensorLogEntries.some(entry => Number.isFinite(this.getLogMetricValue(entry, metric))));
      if (registered.length && registeredHasData) return registered;
      const fallback = [
        { key: 'temperature', label: 'Suhu Udara', unit: '°C' },
        { key: 'humidity', label: 'Kelembapan Udara', unit: '%' },
        { key: 'soil', label: 'Kelembapan Tanah', unit: '%' }
      ];
      // Build metrics from log entries' node:child pairs (fallback when no registered sensors)
      const sensorKeys = new Map();
      for (const entry of this.sensorLogEntries) {
        const snapshot = this.getLogSensorSnapshot(entry);
        const nodeId = toNumber(snapshot?.node ?? snapshot?.sourceNode, -1);
        const childId = toNumber(snapshot?.child ?? snapshot?.sourceChild, -1);
        if (nodeId < 0 || childId < 0) continue;
        const key = `${nodeId}:${childId}`;
        if (!sensorKeys.has(key)) {
          const label = snapshot?.label || `Sensor ${nodeId}:${childId}`;
          const unit = snapshot?.unit || '';
          sensorKeys.set(key, { key, label, unit, sensorNode: nodeId, sensorChild: childId });
        }
      }
      if (sensorKeys.size > 0) {
        return Array.from(sensorKeys.values());
      }
      return fallback;
    },
    get selectedLogChartMetric() {
      return this.logChartMetrics.find(metric => metric.key === this.logChartMetric) || this.logChartMetrics[0] || null;
    },
    get logChartLegend() {
      return this.logChartSeriesList;
    },
    get logChartVisibleSeriesList() {
      return this.logChartSeriesList.filter(series => !this.logChartHiddenSeries.includes(series.key));
    },
    get logChartExtents() {
      const points = this.logChartSeries.points || [];
      if (!points.length) {
        return { startTs: 0, endTs: 0, min: 0, max: 0, unit: '', count: 0 };
      }
      const startTs = Math.min(...points.map(point => point.ts));
      const endTs = Math.max(...points.map(point => point.ts));
      const min = Math.min(...points.map(point => point.value));
      const max = Math.max(...points.map(point => point.value));
      return {
        startTs,
        endTs,
        min: roundToOneDecimal(min),
        max: roundToOneDecimal(max),
        unit: '',
        count: points.length
      };
    },
    get logChartSeriesList() {
      // Gunakan cache — hanya recompute jika data log/sensor berubah
      if (this._cachedChartSeriesList) {
        return this._cachedChartSeriesList;
      }
      const metrics = this.logChartMetrics;
      if (!metrics.length) {
        this._cachedChartSeriesList = [];
        return [];
      }
      const plotLeft = 6;
      const plotRight = 94;
      const plotTop = 8;
      const plotBottom = 92;
      const palette = {
        temperature: { color: '#f97316', line: 'series-temperature' },
        humidity: { color: '#38bdf8', line: 'series-humidity' },
        soil: { color: '#22c55e', line: 'series-soil' }
      };
      const allColors = ['#f97316', '#38bdf8', '#22c55e', '#a78bfa', '#f43f5e', '#eab308', '#14b8a6', '#fb7185', '#60a5fa', '#84cc16'];
      const getFallbackColor = key => {
        const text = `${key || ''}`;
        let hash = 0;
        for (let i = 0; i < text.length; i += 1) {
          hash = ((hash << 5) - hash) + text.charCodeAt(i);
          hash |= 0;
        }
        return allColors[Math.abs(hash) % allColors.length];
      };

      // Pra-proses: kelompokkan entry per sensor key utk akses cepat
      const sensorKey = m => `${m.sensorNode||0}:${m.sensorChild||0}`;
      const entriesBySensor = {};
      for (const entry of this.sensorLogEntries) {
        const data = entry?.data || '';
        const ts = toNumber(entry?.ts ?? entry?.timestamp, 0);
        if (!ts) continue;
        const snapshot = this.getLogSensorSnapshot(entry);
        const srcNode = toNumber(snapshot?.node ?? snapshot?.sourceNode, -1);
        const srcChild = toNumber(snapshot?.child ?? snapshot?.sourceChild, -1);
        if (srcNode < 0 || srcChild < 0) continue;
        const key = `${srcNode}:${srcChild}`;
        if (!entriesBySensor[key]) entriesBySensor[key] = [];
        entriesBySensor[key].push({ ts, snapshot, entry });
      }

      const seriesBase = metrics.map(metric => {
        const mKey = sensorKey(metric);
        const sensorEntries = entriesBySensor[mKey] || [];
        // Ambil nilai langsung dari snapshot (value / sourceValue)
        const samples = sensorEntries
          .map(item => {
            let value = toNumber(item.snapshot?.value ?? item.snapshot?.sourceValue, null);
            if (value === null) {
              value = this.getLogMetricValue(item.entry, metric);
            }
            if (!Number.isFinite(value)) return null;
            return { ts: item.ts, value };
          })
          .filter(Boolean)
          .sort((a, b) => a.ts - b.ts)
          .slice(-24);
        return { key: metric.key, label: metric.label, unit: metric.unit, samples };
      });

      if (!seriesBase.length) {
        this._cachedChartSeriesList = [];
        return [];
      }

      const allPoints = seriesBase.flatMap(s => s.samples);
      if (!allPoints.length) {
        const result = seriesBase.map(series => {
          const theme = palette[series.key] || { color: getFallbackColor(series.key), line: 'series-default' };
          return { ...series, points: [], path: '', min: 0, max: 0, latest: null, count: 0, color: theme.color, lineClass: theme.line, visible: !this.logChartHiddenSeries.includes(series.key) };
        });
        this._cachedChartSeriesList = result;
        return result;
      }

      const tsMin = Math.min(...allPoints.map(p => p.ts));
      const tsMax = Math.max(...allPoints.map(p => p.ts));
      const valueMin = Math.min(...allPoints.map(p => p.value));
      const valueMax = Math.max(...allPoints.map(p => p.value));
      const tsRange = Math.max(1, tsMax - tsMin);
      const valueRange = Math.max(1, valueMax - valueMin);
      const midY = (plotTop + plotBottom) / 2;

      const result = seriesBase.map(series => {
        const points = series.samples.map(item => ({
          ...item,
          x: Number((plotLeft + (((item.ts - tsMin) / tsRange) * (plotRight - plotLeft))).toFixed(1)),
          y: valueMax === valueMin
            ? midY
            : Number((plotBottom - (((item.value - valueMin) / valueRange) * (plotBottom - plotTop))).toFixed(1))
        }));
        const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const theme = palette[series.key] || { color: getFallbackColor(series.key), line: 'series-default' };
        return {
          ...series,
          points,
          path,
          min: roundToOneDecimal(Math.min(...series.samples.map(p => p.value))),
          max: roundToOneDecimal(Math.max(...series.samples.map(p => p.value))),
          latest: points[points.length - 1] || null,
          count: points.length,
          color: theme.color,
          lineClass: theme.line,
          visible: !this.logChartHiddenSeries.includes(series.key)
        };
      });
      this._cachedChartSeriesList = result;
      return result;
    },
    get logChartSeries() {
      return this.logChartVisibleSeriesList[0] || this.logChartSeriesList[0] || { key: '', label: '', unit: '', points: [], path: '', min: 0, max: 0, count: 0, latest: null, color: '#25f4b8', lineClass: 'series-default' };
    },
    getLogChartSeries(metricKey) {
      return this.logChartSeriesList.find(series => series.key === metricKey) || {
        key: metricKey,
        label: this.getLogMetricLabel(metricKey),
        unit: this.getLogMetricUnit(metricKey),
        points: [],
        path: '',
        min: 0,
        max: 0,
        count: 0,
        latest: null,
        color: '#25f4b8',
        lineClass: 'series-default'
      };
    },
    getLogChartExtents(series) {
      if (!series || !series.points || !series.points.length) {
        return { startTs: 0, endTs: 0, min: 0, max: 0, count: 0 };
      }
      const startTs = Math.min(...series.points.map(point => point.ts));
      const endTs = Math.max(...series.points.map(point => point.ts));
      const min = Math.min(...series.points.map(point => point.value));
      const max = Math.max(...series.points.map(point => point.value));
      return { startTs, endTs, min, max, count: series.points.length };
    },
    getLogChartScaleTicks(series) {
      if (!series || !series.points || !series.points.length) return [];
      const points = series.points;
      const first = points[0];
      const middle = points[Math.floor(points.length / 2)] || first;
      const last = points[points.length - 1] || first;
      const ticks = [
        { label: formatLogChartScaleTime(first.ts), x: first.x },
        { label: formatLogChartScaleTime(middle.ts), x: middle.x },
        { label: formatLogChartScaleTime(last.ts), x: last.x }
      ];
      return ticks.filter((tick, index, list) => tick.label && list.findIndex(item => item.label === tick.label) === index);
    },
    get sensorNodeIds() { return Array.from(new Set(this.sensors.map(s => s.nodeId).filter(id => Number.isFinite(id) && id > 0))); },
    get isLocalConnected() { return this.connected && this.mode === 'local'; },
    // Basis API cloud/backend: alamat yang diisi sendiri, atau origin tempat
    // dashboard ini disajikan (self-host: ui_dashboard + backend di server yang
    // sama). Origin lokal/perangkat (AP, localhost) tidak dipakai supaya tidak
    // menembak API ke perangkat.
    get cloudApiBase() {
      const configured = `${this.config?.cloudBaseUrl || ''}`.trim().replace(/\/$/, '');
      if (configured) return configured;
      const origin = `${window?.location?.origin || ''}`.replace(/\/$/, '');
      if (!origin || !/^https?:\/\//.test(origin)) return '';
      const host = `${window?.location?.hostname || ''}`;
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.local')) return '';
      // Hosting statis (GitHub Pages dsb) tidak punya API → alamat backend harus diisi manual
      if (host.endsWith('.github.io') || host.endsWith('.pages.dev') || host.endsWith('.netlify.app') || host.endsWith('.vercel.app')) return '';
      if (/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(host)) return '';
      return origin;
    },
    get showMaintenanceTab() { return this.isLocalConnected; },
    // "Web portal lokal" = UI dibuka dari alamat lokal perangkat (mis. 192.168.4.1).
    // Field koneksi yang bersifat teknis (alamat server/broker, alamat cloud,
    // alamat dasar lokal) hanya ditampilkan di sana — bukan di dashboard cloud.
    get isLocalPortalHost() {
      const host = `${window.location?.hostname || ''}`;
      if (!host) return false;
      if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return true;
      if (host === '[::1]' || host === '::1') return true;
      const match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (!match) return false;
      const a = Number(match[1]);
      const b = Number(match[2]);
      if (a === 127 || a === 10) return true;
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      return false;
    },
    get filteredWifiScanResults() {
      if (this.wifiScanFilter === 'open') return this.wifiScanResults.filter(item => `${item.auth || ''}`.toLowerCase() === 'open');
      if (this.wifiScanFilter === 'secured') return this.wifiScanResults.filter(item => `${item.auth || ''}`.toLowerCase() !== 'open');
      return this.wifiScanResults;
    },
    get isStandalonePwa() {
      return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
    },
    get canInstallPwa() {
      return !!this.pwaInstallPrompt && !this.isStandalonePwa && !this.pwaInstalled;
    },
    get hasStoredMqttCredentials() {
      const username = `${this.config?.mqtt?.username || ''}`.trim();
      const password = `${this.config?.mqtt?.password || ''}`.trim();
      return !!username && !!password;
    },
    get mqttCredentialStorageSummary() {
      if (!this.hasStoredMqttCredentials) {
        return 'Belum tersimpan di browser ini';
      }
      const username = `${this.config?.mqtt?.username || ''}`.trim();
      const password = `${this.config?.mqtt?.password || ''}`.trim();
      const maskedUser = username ? `${username.slice(0, 2)}***` : '-';
      const maskedPass = password ? `${password.slice(0, 2)}***` : '-';
      return `Tersimpan di karjo_ui_config (${maskedUser} / ${maskedPass})`;
    },
    clearDeviceState() {
      this.sensors = [];
      this.actuators = [];
      this.tasks = [];
      this.network = {};
      this.currentTaskIndex = 0;
      this.selectedTaskInfo = null;
      this.taskPage = 0;
      this.loadingTaskIndex = null;
      this.pendingTaskSave = null;
      this.localLastSuccessMs = 0;
      this.lastUpdate = null;
    },
    applyNetworkScope(network) {
      const nextNetwork = network && typeof network === 'object' ? network : {};
      const previousId = normalizeKontrolId(this.network?.kontrolId || this.config?.mqtt?.kontrolId || '');
      const nextId = normalizeKontrolId(nextNetwork?.kontrolId || '');
      const shouldReset = previousId && nextId && previousId !== nextId;
      this.network = nextNetwork;
      if (shouldReset) {
        this.clearDeviceState();
        this.network = nextNetwork;
      }
      // Durasi manual diambil dari perangkat (NVS) agar semua klien memakai
      // nilai yang sama. Perintah manual dikirim tanpa durasi (durationMs=0),
      // jadi perangkat yang menentukan batas waktunya.
      this.applyManualDurationData(nextNetwork);
    },

    // ── Tahan/hold-off aktuator (kenapa otomasi ambang tidak jalan) ───────
    // Perintah manual memasang hold-off (bawaan 1 jam): selama itu otomasi
    // ambang/jadwal TIDAK bisa memicu aktuator. Teks di bawah menjelaskannya,
    // dan `clearHold` melepaskannya lebih cepat.
    actuatorHoldText(actuator) {
      if (!actuator) return '';
      const jeda = Math.round(toNumber(actuator.holdOffRemainMs, 0));
      if (jeda > 0) {
        return `Ditahan manual ${this.formatDurasiManual(jeda)} — otomasi ambang/jadwal tidak bisa memicu`;
      }
      const tahan = Math.round(toNumber(actuator.holdRemainMs, 0));
      if (tahan > 0) {
        return toNumber(actuator.activePriority, 0) >= 3
          ? `Manual ON: sisa ${this.formatDurasiManual(tahan)} — otomasi ditahan`
          : `Timer ON: sisa ${this.formatDurasiManual(tahan)}`;
      }
      return '';
    },
    actuatorHoldVisible(actuator) {
      return !!actuator && (toNumber(actuator.holdOffRemainMs, 0) > 0 || toNumber(actuator.holdRemainMs, 0) > 0);
    },
    async clearActuatorHold(index, tombol) {
      if (tombol) tombol.disabled = true;
      try {
        if (this.mode === 'local') {
          const res = await this.sendLocalCommand({ cmd: 'clearHold', index });
          if (res.ok) await this.refreshLocal();
          else this.showToast('Gagal melepas tahan aktuator.', 'error');
        } else if (this.mode === 'mqtt' && this.connected) {
          this.publishCommand({ cmd: 'clearHold', index });
          this.showToast('Perintah lepas tahan dikirim.');
        } else {
          this.showToast('Perangkat belum terhubung.', 'error');
        }
      } finally {
        if (tombol) tombol.disabled = false;
      }
    },

    // ── Durasi manual (timeout tombol manual, 1 menit … 6 jam) ────────────
    // Padanan: serial `manualdur`, API `GET|POST /api/manual-duration`,
    // MQTT `setManualDuration`. Nilai disimpan di perangkat.
    get manualDurationSummary() {
      const menit = Math.round(toNumber(this.manualDurationMinutes, 0));
      if (menit <= 0) return '';
      return `${menit} menit (${this.formatDurasiManual(menit * 60000)})`;
    },
    applyManualDurationData(data) {
      if (!data || typeof data !== 'object') return;
      let menit = Math.round(toNumber(data.manualDurationMinutes, 0));
      if (menit <= 0) menit = Math.round(toNumber(data.minutes, 0));
      if (menit <= 0) {
        const ms = Math.round(toNumber(data.manualDurationMs, toNumber(data.ms, 0)));
        if (ms > 0) menit = Math.max(1, Math.round(ms / 60000));
      }
      if (menit > 0) {
        this.manualDurationMinutes = menit;
        this.manualDurationMs = menit * 60000;
      }
    },
    async saveManualDuration() {
      const menit = Math.max(1, Math.min(360, Math.round(toNumber(this.manualDurationMinutes, 60))));
      this.manualDurationMinutes = menit;
      this.manualDurationMs = menit * 60000;
      this.manualDurationBusy = true;
      try {
        if (this.mode === 'local') {
          const result = await this.localFetch('/api/manual-duration', {
            method: 'POST',
            body: JSON.stringify({ minutes: menit })
          });
          if (!result || result.ok === false) {
            throw new Error(result?.error || result?.message || 'Gagal menyimpan durasi manual');
          }
          this.applyManualDurationData(result);
          await this.refreshLocal();
          this.showToast(result.message || `Durasi manual: ${menit} menit.`);
        } else {
          this.publishCommand({ cmd: 'setManualDuration', minutes: menit });
          this.showToast(`Perintah durasi manual (${menit} menit) dikirim.`);
        }
      } catch (error) {
        this.showToast(error?.message || 'Gagal menyimpan durasi manual.', 'error');
      } finally {
        this.manualDurationBusy = false;
      }
    },

    // Metode
    init() { 
      // Alpine bisa mengevaluasi x-init lebih dari sekali (re-evaluasi tree).
      // Tanpa penjagaan ini initAuthState() → connectMqtt() berjalan dua kali:
      // klien MQTT pertama ditutup saat masih handshake (console warning
      // "WebSocket is closed before the connection is established").
      if (this._initialized) return;
      this._initialized = true;
      this.loadConfig(); 
      this.ensureUiId(); 
      this.initAuthState(); 
      this.setupPwaHooks();
      // Snapshot state terakhir dari VPS: dipakai saat kontroler tidak terjangkau
      // supaya task/sensor/aktuator tetap terlihat.
      this.startVpsStateWatch();
      const savedTheme = localStorage.getItem('karjo_ui_theme') || 'dark'; 
      this.theme = savedTheme; 
      this.applyTheme(savedTheme); 
      this.applyBackgroundImage(this.backgroundImage); 
      this.uiTimer = setInterval(() => { this.now = Date.now(); }, 1000);
      // Hentikan update status saat modal task terbuka agar data lokal tidak tertimpa
      this.$watch('showTaskModal', (val) => {
        this.localPollingPaused = val || this.showAllTasksModal;
      });
      this.$watch('showAllTasksModal', (val) => {
        this.localPollingPaused = val || this.showTaskModal;
      });
      // Resize → redraw canvas charts
      window.addEventListener('resize', () => {
        if (this.showLogModal) {
          clearTimeout(this._resizeTimer);
          this._resizeTimer = setTimeout(() => {
            const metric = this.selectedLogChartMetric;
            if (metric) {
              const canvas = document.getElementById('chart-' + metric.key);
              if (canvas && canvas.parentElement) this.drawChart(metric.key, canvas.parentElement);
            }
          }, 200);
        }
      });
      // Redraw saat metric berubah
      this.$watch('logChartMetric', () => {
        if (this.showLogModal && this.logFilter === 'sensor') {
          setTimeout(() => {
            try {
              const metric = this.selectedLogChartMetric;
              if (metric) {
                const canvas = document.getElementById('chart-' + metric.key);
                if (canvas) this.drawChart(metric.key, canvas.parentElement);
              }
            } catch(e) { console.warn('Chart draw error:', e); }
          }, 50);
        }
      });
      // Redraw saat pindah tab ke sensor
      this.$watch('logFilter', () => {
        if (this.showLogModal && this.logFilter === 'sensor') {
          setTimeout(() => {
            try {
              const metric = this.selectedLogChartMetric;
              if (metric) {
                const canvas = document.getElementById('chart-' + metric.key);
                if (canvas) this.drawChart(metric.key, canvas.parentElement);
              }
            } catch(e) { console.warn('Chart draw error:', e); }
          }, 100);
        }
      });
    },
    loadConfig() { 
      const raw = localStorage.getItem('karjo_ui_config'); 
      let parsed; 
      try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; } 
      const mqttKontrolId = normalizeKontrolId(parsed?.mqtt?.kontrolId) || defaults.mqtt.kontrolId; 
      const kontrolIds = normalizeKontrolIdList(parsed?.kontrolIds, mqttKontrolId); 
      const parsedMqtt = parsed.mqtt || {};
      // Migrasi broker: alamat EMQX Cloud lama diganti broker sendiri
      // (wss://<domain>/mqtt). Sandi lama tidak berlaku di broker baru → kosongkan
      // supaya dialog "Akun Online" meminta kredensial baru sekali.
      const parsedMqttUrl = `${parsedMqtt.url || ''}`.trim();
      const brokerLama = /emqxsl\.com|:8084\/mqtt/i.test(parsedMqttUrl);
      this.config = { 
        ...defaults, 
        ...parsed, 
        kontrolIds, 
        kontrolAliases: parsed.kontrolAliases || {},
        cloudBaseUrl: `${parsed.cloudBaseUrl || ''}`.trim() || defaults.cloudBaseUrl,
        cloudReadToken: `${parsed.cloudReadToken || ''}`.trim(),
        mqtt: {
          ...defaults.mqtt,
          ...parsedMqtt,
          url: brokerLama ? defaults.mqtt.url : (parsedMqttUrl || defaults.mqtt.url),
          username: brokerLama ? '' : `${parsedMqtt.username || ''}`.trim(),
          password: brokerLama ? '' : `${parsedMqtt.password || ''}`.trim(),
          kontrolId: mqttKontrolId
        }
      }; 
      this.pendingKontrolId = mqttKontrolId; 
      this.login.kontrolId = mqttKontrolId || kontrolIds[0]; 
      this.login.username = this.config.uiId || '';
      this.lastLoginKontrolSelection = this.login.kontrolId; 
      this.connectionPreference = normalizeConnectionPreference(localStorage.getItem('karjo_ui_connection_mode'));
    },
    saveConfig() { localStorage.setItem('karjo_ui_config', JSON.stringify(this.config)); },
    ensureUiId() { if (this.config.uiId) return; let uiId = localStorage.getItem('karjo_ui_id'); if (!uiId) { uiId = `UI-${Math.random().toString(16).slice(2, 6).toUpperCase()}`; localStorage.setItem('karjo_ui_id', uiId); } this.config.uiId = uiId; this.saveConfig(); },
    setTheme(theme) { localStorage.setItem('karjo_ui_theme', theme); this.applyTheme(theme); this.showToast(`Tema: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`); },
    applyTheme(theme) { const root = document.documentElement; themeOptions.forEach(key => { if (themeClassMap[key]) root.classList.remove(themeClassMap[key]); }); if (themeClassMap[theme]) root.classList.add(themeClassMap[theme]); },
    
    handleBgUpload(event) {
      const berkas = event.target.files[0];
      if (!berkas) return;
      if (berkas.size > 1.5 * 1024 * 1024) {
        this.showToast('Ukuran gambar terlalu besar (maks 1.5MB)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;
        this.backgroundImage = base64;
        localStorage.setItem('karjo_ui_bg', base64);
        this.applyBackgroundImage(base64);
        this.showToast('Background diperbarui');
      };
      reader.readAsDataURL(berkas);
    },
    removeBg() {
      this.backgroundImage = '';
      localStorage.removeItem('karjo_ui_bg');
      this.applyBackgroundImage('');
      this.showToast('Background dihapus');
    },
    applyBackgroundImage(url) {
      const body = document.body;
      body.classList.toggle('has-custom-bg', !!url);
      if (url) {
        body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url(${url})`;
        body.style.backgroundSize = 'cover';
        body.style.backgroundPosition = 'center';
        body.style.backgroundAttachment = 'fixed';
        body.style.backgroundRepeat = 'no-repeat';
      } else {
        body.style.backgroundImage = 'none';
      }
    },
    openMqttCredentialModal(message = '') {
      this.mqttCredentialForm.username = `${this.config?.mqtt?.username || ''}`.trim();
      this.mqttCredentialForm.password = `${this.config?.mqtt?.password || ''}`.trim();
      this.mqttCredentialForm.error = message;
      this.mqttCredentialForm.showPassword = false;
      this.mode = 'offline';
      this.connected = false;
      this.showMqttCredentialModal = true;
      // Layar login tampil karena perangkat belum terjangkau → tampilkan
      // snapshot terakhir dari VPS agar data tidak kosong.
      this.syncVpsState();
    },
    closeMqttCredentialModal({ keepPendingConnect = false } = {}) {
      this.showMqttCredentialModal = false;
      if (!keepPendingConnect) {
        this.mqttCredentialPendingConnect = false;
      }
      this.mqttCredentialForm.error = '';
      this.mqttCredentialForm.showPassword = false;
      if (this.mode === 'detecting') {
        this.mode = 'offline';
      }
      this.connected = false;
    },
    clearMqttConnectTimer() {
      if (this.mqttConnectTimer) {
        clearTimeout(this.mqttConnectTimer);
        this.mqttConnectTimer = null;
      }
    },
    clearLoginPending() {
      if (this.loginPendingTimer) {
        clearTimeout(this.loginPendingTimer);
        this.loginPendingTimer = null;
      }
      this.loginPending = null;
    },
    get isLoginPending() {
      return !!this.loginPending;
    },
    clearAuthPasswordPending() {
      if (this.authPasswordPendingTimer) {
        clearTimeout(this.authPasswordPendingTimer);
        this.authPasswordPendingTimer = null;
      }
      this.authPasswordPending = null;
    },
    finishLoginSuccess(connectionMode, message) {
      this.isAuthenticated = true;
      localStorage.setItem(loginSessionKey, '1');
      this.connectionPreference = normalizeConnectionPreference(connectionMode);
      localStorage.setItem('karjo_ui_connection_mode', this.connectionPreference);
      if (this.connectionPreference === 'local') {
        this.startLocalPolling();
      } else if (this.mqttClient?.connected) {
        this.publishCommand({ cmd: 'getAll' });
        this.startMqttPolling();
      }
      this.showToast(message || (this.connectionPreference === 'local' ? 'Masuk lokal berhasil.' : 'Masuk online berhasil.'));
    },
    async sendLocalLogin(username, password) {
      const result = await this.localFetch('/api/login', {
        method: 'POST', timeoutMs: 10000, body: JSON.stringify({ username, password })
      });
      if (!result) throw new Error('UI tidak bisa terhubung ke kontroller.');
      return result;
    },
    sendMqttLogin(username, password) {
      return new Promise((resolve, reject) => {
        if (!this.mqttClient?.connected) {
          reject(new Error('UI tidak bisa terhubung ke kontroller.'));
          return;
        }
        this.clearLoginPending();
        this.loginPending = { username, resolve, reject };
        this.loginPendingTimer = setTimeout(() => {
          if (this.loginPending?.reject) {
            this.loginPending.reject(new Error('UI tidak bisa terhubung ke kontroller.'));
          }
          this.clearLoginPending();
        }, 10000);
        this.publishCommand({ cmd: 'login', username, password });
      });
    },
    sendLocalAdminPasswordChange(username, currentPassword, newPassword) {
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      return fetch(`${base}/api/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, currentPassword, newPassword })
      }).then(res => res.json().catch(() => ({})));
    },
    sendMqttAdminPasswordChange(username, currentPassword, newPassword) {
      return new Promise((resolve, reject) => {
        if (!this.mqttClient?.connected) {
          reject(new Error('Koneksi online belum tersambung.'));
          return;
        }
        this.clearAuthPasswordPending();
        this.authPasswordPending = { username, resolve, reject };
        this.authPasswordPendingTimer = setTimeout(() => {
          if (this.authPasswordPending?.reject) {
            this.authPasswordPending.reject(new Error('Perubahan password timeout.'));
          }
          this.clearAuthPasswordPending();
        }, 10000);
        this.publishCommand({ cmd: 'setAdminPassword', username, currentPassword, newPassword });
      });
    },
    handleMqttConnectFailure(error) {
      if (this.mqttConnectFailureHandled) return;
      this.mqttConnectFailureHandled = true;
      const authError = isMqttAuthError(error);
      const message = authError
        ? 'Akun online ditolak. Periksa nama pengguna dan sandi.'
        : 'Gagal tersambung ke server online. Periksa alamat server atau jaringan.';
      this.clearMqttConnectTimer();
      this.clearLoginPending();
      this.clearAuthPasswordPending();
      if (this.mqttClient) {
        this.mqttClient.end(true);
        this.mqttClient = null;
      }
      this.mode = 'offline';
      this.connected = false;
      this.mqttCredentialPendingConnect = false;
      this.mqttPendingConnectError = null;
      this.showToast(message, 'error');
      if (authError) {
        this.mqttCredentialForm.error = 'Data akun online tidak valid.';
      }
      // Tampilkan snapshot terakhir dari VPS selama belum bisa masuk.
      this.syncVpsState();
    },
    submitMqttCredentialModal() {
      try {
        const username = `${this.mqttCredentialForm.username || ''}`.trim();
        const password = `${this.mqttCredentialForm.password || ''}`.trim();
        if (!username || !password) {
          this.mqttCredentialForm.error = 'Nama pengguna dan sandi wajib diisi.';
          return;
        }
        this.config.mqtt.username = username;
        this.config.mqtt.password = password;
        this.saveConfig();
        this.mqttCredentialForm.error = '';
        this.mqttCredentialPendingConnect = true;
        this.mqttConnectFailureHandled = false;
        this.mqttPendingConnectError = null;
        this.showMqttCredentialModal = false;
        this.closeMqttCredentialModal({ keepPendingConnect: true });
        this.showToast('Akun online disimpan. Menyambungkan...', 'info');
        setTimeout(() => {
          if (this.mqttCredentialPendingConnect) {
            this.mqttCredentialPendingConnect = false;
            // Di layar login (belum terautentikasi) startPreferredConnection()
            // langsung keluar → koneksi tidak pernah dibuat dan tombol Login
            // tetap nonaktif. Jadi sambung MQTT langsung, kecuali bila sudah
            // login (ikut preferensi mode koneksi yang berlaku).
            if (this.isAuthenticated) {
              this.startPreferredConnection();
            } else {
              this.connectMqtt();
            }
          }
        }, 80);
      } catch (error) {
        this.mqttCredentialPendingConnect = false;
        this.connected = false;
        this.mode = 'offline';
        this.mqttCredentialForm.error = 'Gagal menyimpan akun online.';
        this.showToast('Gagal menyimpan akun online.', 'error');
      }
    },
    setupPwaHooks() {
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        this.pwaInstallPrompt = event;
      });
      window.addEventListener('appinstalled', () => {
        this.pwaInstallPrompt = null;
        this.pwaInstalled = true;
        this.showToast('Aplikasi berhasil dipasang.');
      });
      const media = window.matchMedia?.('(display-mode: standalone)');
      if (media?.addEventListener) {
        media.addEventListener('change', () => {
          if (media.matches) {
            this.pwaInstallPrompt = null;
            this.pwaInstalled = true;
          }
        });
      }
    },
    async installPwa() {
      if (!this.pwaInstallPrompt) {
        this.showToast('Pemasangan tidak tersedia di browser ini.', 'error');
        return;
      }
      const promptEvent = this.pwaInstallPrompt;
      this.pwaInstallPrompt = null;
      try {
        promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          this.pwaInstalled = true;
          this.showToast('Aplikasi sedang dipasang.');
        } else {
          this.showToast('Pemasangan dibatalkan.');
        }
      } catch {
        this.showToast('Gagal membuka dialog pemasangan.', 'error');
      }
    },
    async resetAppCache() {
      if (!confirm('Hapus cache aplikasi dan reload halaman?')) return;
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(registration => registration.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        }
        this.showToast('Cache aplikasi dihapus. Memuat ulang...', 'info');
        setTimeout(() => window.location.reload(true), 500);
      } catch (error) {
        this.showToast('Gagal menghapus cache aplikasi.', 'error');
      }
    },

    // Autentikasi & modal login
    initAuthState() { 
      this.isAuthenticated = localStorage.getItem(loginSessionKey) === '1'; 
      this.connectionPreference = normalizeConnectionPreference(localStorage.getItem('karjo_ui_connection_mode'));
      if (this.isAuthenticated) {
        this.startPreferredConnection();
      } else if (this.loginViaLocalApi) {
        // Portal perangkat: langsung deteksi Web API lokal supaya tombol Login
        // siap ditekan (tanpa perlu kredensial broker).
        this.connectLocal();
      } else {
        // Dashboard cloud: sambungkan dulu ke server online (memakai kredensial
        // yang sudah tersimpan) supaya perintah login bisa dikirim ke kontroler.
        this.connectMqtt();
      }
    },
    async attemptLogin(connectionMode = 'mqtt') { 
      if (this.isLoginPending) return;
      this.login.error = ''; 
      const username = this.loginUiId;
      const password = `${this.login.password || ''}`.trim();
      if (!username) return this.login.error = 'UI ID belum tersedia.';
      if (!password) return this.login.error = 'Sandi login belum diisi.';
      this.login.username = username;
      this.loginPending = { mode: normalizeConnectionPreference(connectionMode) };
      try {
        if (normalizeConnectionPreference(connectionMode) === 'local') {
          this.connectionPreference = 'local';
          localStorage.setItem('karjo_ui_connection_mode', this.connectionPreference);
          this.stopKaConnections();
          // Deteksi mixed content (HTTPS → HTTP)
          if (window.location.protocol === 'https:') {
            this.login.error = 'Mode lokal tidak bisa dari halaman HTTPS. Buka http://' +
              this.config.localBaseUrl.replace(/^https?:\/\//, '') + '/ langsung di browser.';
            this.showToast(this.login.error, 'error');
            return;
          }
          const localReady = await this.tryLocalConnection();
          if (!localReady) throw new Error('UI tidak bisa terhubung ke kontroller.');
          this.mode = 'local';
          this.connected = true;
          const result = await this.sendLocalLogin(username, password);
          if (!result?.ok) throw new Error(result?.error || 'Login lokal ditolak.');
          this.loginRole = `${result?.role || ''}`.trim() || 'guest';
          if (this.login.kontrolId && this.login.kontrolId !== this.config.mqtt.kontrolId) {
            this.applyKontrolId(this.login.kontrolId, { skipLogout: true });
          }
          this.finishLoginSuccess('local', result?.message || 'Masuk lokal berhasil.');
          return;
        }

        // Login online = alur lama: UI menyambung ke server online lalu mengirim
        // {cmd:login, username, password} ke kontroler. Kontroler sendiri yang
        // memutuskan kredensial itu sah atau tidak — tanpa perantara backend.
        if (!this.mqttClient?.connected) {
          this.connectionPreference = 'mqtt';
          localStorage.setItem('karjo_ui_connection_mode', this.connectionPreference);
          const siap = await this.connectMqttAndWait();
          if (!siap) throw new Error('UI tidak bisa terhubung ke kontroller.');
        }
        const result = await this.sendMqttLogin(username, password);
        if (!result?.ok) throw new Error(result?.error || 'Login online ditolak.');
        this.loginRole = `${result?.role || ''}`.trim() || 'guest';
        if (this.login.kontrolId && this.login.kontrolId !== this.config.mqtt.kontrolId) {
          this.applyKontrolId(this.login.kontrolId, { skipLogout: true });
        }
        this.finishLoginSuccess('mqtt', result?.message || 'Masuk online berhasil.');
      } catch (error) {
        this.login.error = `${error?.message || error || 'Login gagal.'}`;
        this.showToast(this.login.error, 'error');
      } finally {
        this.clearLoginPending();
      }
    },
    logoutApplication(skipPrompt = false) {
      this.stopKaConnections();
      this.isAuthenticated = false;
      localStorage.removeItem(loginSessionKey);
      this.clearLoginPending();
      this.login.username = '';
      this.login.password = '';
      this.loginRole = 'guest';
      this.resetAuthPasswordForm();
      this.showToast('Anda telah keluar.');
      setTimeout(() => window.location.reload(), 300);
    },
    openLoginKontrolModal() { 
      this.login.newKontrolId = ''; 
      this.login.newKontrolAlias = ''; 
      this.login.newKontrolIdError = ''; 
      this.login.kontrolId = normalizeKontrolId(this.login.kontrolId || this.config.mqtt.kontrolId || this.config.kontrolIds[0] || '');
      this.showLoginKontrolModal = true; 
    },
    hideLoginKontrolModal() { this.showLoginKontrolModal = false; },
    selectLoginKontrolId(id) {
      const normalized = normalizeKontrolId(id);
      if (!normalized) return;
      this.ensureKontrolIdList(normalized);
      this.config.mqtt.kontrolId = normalized;
      this.login.kontrolId = normalized;
      this.lastLoginKontrolSelection = normalized;
      this.pendingKontrolId = normalized;
      this.saveConfig();
      this.hideLoginKontrolModal();
      this.showToast(`ID Kontrol aktif: ${this.getKontrolLabel(normalized)}`);
    },
    submitLoginKontrolModal() { 
      const raw = normalizeKontrolId(this.login.newKontrolId); 
      const alias = (this.login.newKontrolAlias || '').trim();
      if (!raw) return this.login.newKontrolIdError = 'ID Kontrol belum diisi.'; 
      if (!isValidKontrolId(raw)) return this.login.newKontrolIdError = 'Format ID tidak valid (3-24 karakter, A-Z 0-9 - _)'; 
      const exists = this.config.kontrolIds.includes(raw); 
      this.ensureKontrolIdList(raw); 
      if (alias) {
        this.config.kontrolAliases[raw] = alias;
      }
      this.config.mqtt.kontrolId = raw;
      this.login.kontrolId = raw; 
      this.lastLoginKontrolSelection = raw; 
      this.pendingKontrolId = raw;
      this.saveConfig(); 
      this.hideLoginKontrolModal(); 
      this.showToast(exists ? 'ID Kontrol sudah ada.' : 'ID Kontrol tersimpan.'); 
    },
    getKontrolLabel(id) {
      const alias = this.config.kontrolAliases[id];
      if (alias) return `${alias} • ${id}`;
      return id;
    },
    
    // Koneksi
    clearConnectionTimers() { if (this.localDetectTimer) clearTimeout(this.localDetectTimer); this.localDetectTimer = null; },
    startPreferredConnection() {
      if (!this.isAuthenticated) return;
      if (this.loginViaLocalApi || this.connectionPreference === 'local') {
        this.connectLocal();
        return;
      }
      this.connectMqtt();
    },
    async connectLocal() {
      this.stopKaConnections();
      this.localFallbackNotified = false;
      this.mode = 'local';
      this.connected = false;
      this.localLastSuccessMs = 0;
      this.clearDeviceState();

      const koneksiLokalOK = await this.tryLocalConnection();
      if (koneksiLokalOK) {
        this.connected = true;
        this.localLastSuccessMs = Date.now();
        this.startLocalPolling();
        return;
      }

      this.showToast('Koneksi lokal tidak merespons.', 'error');
    },
    async tryLocalConnection() {
      const data = await this.localFetch('/api/status', { timeoutMs: 2000 });
      if (!data) return false;
      this.applyNetworkScope(parseStatusJson(data));
      return true;
    },
    connectMqttAndWait(timeoutMs = 12000) {
      return new Promise(resolve => {
        if (this.mqttClient?.connected) return resolve(true);
        const mulai = Date.now();
        this.connectMqtt();
        const pengawas = setInterval(() => {
          if (this.mqttClient?.connected) {
            clearInterval(pengawas);
            resolve(true);
            return;
          }
          if (Date.now() - mulai >= timeoutMs) {
            clearInterval(pengawas);
            resolve(false);
          }
        }, 300);
      });
    },
    // Sesi kontrol perangkat berakhir (mis. perintah ditolak firmware) → minta
    // sandi lagi tanpa mengubah setelan lain.
    lockControlForAuth(pesan) {
      this.isAuthenticated = false;
      localStorage.removeItem(loginSessionKey);
      this.login.error = pesan || 'Sesi kontrol berakhir. Masukkan sandi lagi.';
      this.login.password = '';
      this.showToast(this.login.error, 'error');
    },
    connectMqtt() {
      this.stopKaConnections();
      this.mqttConnectFailureHandled = false;
      this.mqttPendingConnectError = null;
      if (!this.config.mqtt.url) {
        this.mode = 'offline';
        this.connected = false;
        return this.showToast('Alamat koneksi online belum diisi.', 'error');
      }
      // Pustaka MQTT dimuat dari mqtt.min.js — bila gagal termuat (mis. berkas
      // tidak tersedia), beri pesan jelas alih-alih "mqtt is not defined".
      if (typeof mqtt === 'undefined') {
        this.mode = 'offline';
        this.connected = false;
        return this.showToast('Pustaka koneksi belum termuat. Muat ulang halaman (Ctrl+F5).', 'error');
      }
      const mqttCredentials = {
        username: `${this.config?.mqtt?.username || ''}`.trim(),
        password: `${this.config?.mqtt?.password || ''}`.trim()
      };
      const hasCredential = !!mqttCredentials.username && !!mqttCredentials.password;
      if (!hasCredential) {
        this.mqttCredentialPendingConnect = true;
        this.openMqttCredentialModal();
        return;
      }
      this.config.mqtt.username = mqttCredentials.username;
      this.config.mqtt.password = mqttCredentials.password;
      this.saveConfig();
      this.showMqttCredentialModal = false;
      if (this.settingsTab === 'maintenance') {
        this.settingsTab = 'settings';
      }
      this.clearRefresh();
      this.clearConnectionTimers();
      if (this.mqttClient) this.mqttClient.end(true);
      const opts = {
        username: this.config.mqtt.username,
        password: this.config.mqtt.password,
        clientId: `karjo-ui-${Math.random().toString(16).slice(2, 10)}`,
        reconnectPeriod: 3000,
        connectTimeout: 10000
      };
      this.mqttClient = mqtt.connect(this.config.mqtt.url, opts);
      this.connected = false;
      this.mode = 'detecting';
      const attemptId = ++this.mqttConnectAttemptId;
      this.clearMqttConnectTimer();
      this.mqttConnectTimer = setTimeout(() => {
        if (this.mqttConnectAttemptId !== attemptId || this.mode !== 'detecting' || this.connected) return;
        this.handleMqttConnectFailure(this.mqttPendingConnectError || new Error('MQTT connection timeout'));
      }, 12000);
      this.mqttClient.on('connect', () => {
        if (this.mqttConnectAttemptId !== attemptId) return;
        this.clearMqttConnectTimer();
        this.showMqttCredentialModal = false;
        this.mqttCredentialPendingConnect = false;
        this.connected = true;
        this.mode = 'mqtt';
        this.mqttPendingConnectError = null;
        this.clearDeviceState();
        const topic = `abadinet-out/${this.config.mqtt.kontrolId}/#`;
        this.mqttClient.subscribe(topic);
        if (this.isAuthenticated) {
          this.publishCommand({ cmd: 'getAll' });
          this.startMqttPolling();
        }
      });
      this.mqttClient.on('message', (topic, message) => this.handleMqttMessage(topic, message.toString()));
      this.mqttClient.on('close', () => {
        if (this.mqttConnectAttemptId !== attemptId) return;
        if (this.mode === 'mqtt') {
          this.connected = false;
          this.clearMqttConnectTimer();
        } else if (this.mode === 'detecting' && !this.connected) {
          this.handleMqttConnectFailure(this.mqttPendingConnectError || new Error('MQTT connection closed'));
        }
      });
      this.mqttClient.on('error', (error) => {
        if (this.mqttConnectAttemptId !== attemptId) return;
        this.mqttPendingConnectError = error || this.mqttPendingConnectError;
        if (isMqttAuthError(error)) {
          this.handleMqttConnectFailure(error);
        } else if (this.mode === 'mqtt') {
          this.connected = false;
        }
      });
    },
    handleMqttMessage(topic, muatan) { 
      const cmd = topic.substring(topic.lastIndexOf('/')+1); 
      if(cmd === 'respStatus') this.applyNetworkScope(parseStatusJson(muatan)); 
      if(cmd === 'respLogin') {
        const parsedLogin = parsePayloadKontrol(muatan);
        const pending = this.loginPending;
        if (pending) {
          const ok = toBool(parsedLogin.ok);
          if (ok) {
            pending.resolve(parsedLogin);
          } else {
            pending.reject(new Error(parsedLogin.error || 'Login ditolak.'));
          }
        }
        if (toBool(parsedLogin.ok)) {
          this.loginRole = `${parsedLogin.role || ''}`.trim() || this.loginRole;
        }
        this.clearLoginPending();
      }
      if(cmd === 'respAuth') {
        const parsedAuth = parsePayloadKontrol(muatan);
        const pending = this.authPasswordPending;
        if (pending) {
          const ok = toBool(parsedAuth.ok);
          if (ok) {
            pending.resolve(parsedAuth);
          } else {
            pending.reject(new Error(parsedAuth.error || 'Gagal mengubah password.'));
          }
        }
        this.clearAuthPasswordPending();
        if (toBool(parsedAuth.ok)) {
          this.showToast(parsedAuth.message || 'Password admin berhasil diubah.');
        }
      }
      if(cmd === 'respError' || cmd === 'respInfo') {
        const info = parsePayloadKontrol(muatan);
        if (this.pendingTaskSave) this.finishTaskSave(false, info.error || info.message || '');
        if (!toBool(info.ok)) {
          const pesan = `${info.error || info.message || ''}`.trim();
          if (/login required/i.test(pesan)) {
            this.lockControlForAuth('Perintah ini butuh masuk ulang. Masukkan sandi perangkat.');
          } else if (pesan) {
            this.showToast(pesan, 'error');
          }
        }
      }
      if(cmd === 'respSensor') {
        // Payload bisa PARSIAL (penghematan kuota: hanya sensor yang berubah,
        // ±450 B bukan ±4,4 KB). Yang parsial digabung ke daftar yang ada,
        // yang penuh menggantikan daftar seperti sebelumnya.
        const daftarSensor = parseSensorsJson(muatan);
        this.sensors = isPartialSensorPayload(muatan)
          ? this.applySensorDelta(daftarSensor)
          : this.mergeSensors(daftarSensor);
        if (isPartialSensorPayload(muatan) && !this.sensors.length) {
          // Daftar masih kosong (UI baru terbuka) → minta daftar penuh.
          this.publishCommand({ cmd: 'getSensors' });
        }
        this.syncMoistureCalibrationFromSensors();
        this.syncDistanceCalibrationFromSensors();
        this.syncFuelCalibrationFromSensors();
      }
      if(cmd === 'respActuator') this.actuators = parseActuatorsJson(muatan); 
      if(cmd === 'respTask' && !this.localPollingPaused) {
        this.mergeTasks(parseTasksJson(muatan));
        // Balasan perangkat = perintah task benar-benar diterima & tersimpan.
        if (this.pendingTaskSave) this.finishTaskSave(true);
      }
      if(cmd === 'respLogs' || cmd === 'logs') {
        const parsedLogs = parsePayloadKontrol(muatan);
        if (this.pendingLogDownloads && Object.keys(this.pendingLogDownloads).length > 0) {
          const pendingEntries = Object.entries(this.pendingLogDownloads);
          const matchedEntry = parsedLogs && typeof parsedLogs === 'object'
            ? pendingEntries.find(([, pending]) => pending?.page === Number(parsedLogs.page ?? -1) && pending?.limit === Number(parsedLogs.limit ?? -1))
            : null;
          const chosenEntry = matchedEntry || pendingEntries[0];
          const pendingKey = chosenEntry?.[0];
          const pending = chosenEntry?.[1];
          if (pendingKey && pending) {
            pending.resolve(muatan);
          }
        }
        this.applyLogPayload(muatan);
      }
      this.lastUpdate = new Date(); 
      this.endAction(); 
    },
    startLocalPolling() {
      this.clearRefresh();
      this.localLastSuccessMs = Date.now();
      this.localFallbackNotified = false;
      this.refreshLocal();
      this.refreshTimer = setInterval(async () => {
        if (this.localPollingPaused) {
          return;
        }
        if (await this.refreshLocal()) {
          this.localLastSuccessMs = Date.now();
          this.connected = true;
          this.mode = 'local';
          this.localFallbackNotified = false;
          return;
        }
        if (Date.now() - this.localLastSuccessMs >= LOCAL_FALLBACK_AFTER_MS && !this.localFallbackNotified) {
          this.showToast('Koneksi lokal tidak merespons.', 'error');
          this.localFallbackNotified = true;
        }
      }, 5000);
    },
    startMqttPolling() { this.clearRefresh(); this.refreshTimer = setInterval(() => { if (this.mqttClient?.connected && !this.localPollingPaused) this.publishCommand({ cmd: 'getStatus' }); }, 20000); },
    clearRefresh() { if (this.refreshTimer) clearInterval(this.refreshTimer); this.refreshTimer = null; },
    clearMoistureCalibrationPolling() {
      if (this.moistureCalibrationPollTimer) clearInterval(this.moistureCalibrationPollTimer);
      this.moistureCalibrationPollTimer = null;
    },
    clearDistanceCalibrationPolling() {
      if (this.distanceCalibrationPollTimer) clearInterval(this.distanceCalibrationPollTimer);
      this.distanceCalibrationPollTimer = null;
    },
    clearFuelCalibrationPolling() {
      if (this.fuelCalibrationPollTimer) clearInterval(this.fuelCalibrationPollTimer);
      this.fuelCalibrationPollTimer = null;
    },
    stopKaConnections() {
      this.clearRefresh();
      this.clearMoistureCalibrationPolling();
      this.clearDistanceCalibrationPolling();
      this.clearFuelCalibrationPolling();
      this.clearConnectionTimers();
      this.clearMqttConnectTimer();
      this.clearLoginPending();
      this.clearAuthPasswordPending();
      this.localPollingPaused = false;
      this.localFallbackNotified = false;
      if (this.mqttClient) {
        this.mqttClient.end(true);
        this.mqttClient = null;
      }
      this.connected = false;
      this.mode = 'offline';
      this.mqttPendingConnectError = null;
    },

    // Data & aksi API
    async localFetch(path, options = {}) {
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      const url = `${base}${path}`;
      const { method = 'GET', body, timeoutMs = 3000 } = options;
      const fetchOpts = method === 'GET' ? {} : { method, headers: { 'Content-Type': 'application/json' }, body };
      try {
        const pengendali = new AbortController();
        const tid = setTimeout(() => pengendali.abort(), timeoutMs);
        const res = await fetch(url, { cache: 'no-store', signal: pengendali.signal, ...fetchOpts });
        clearTimeout(tid);
        return res.ok ? await res.json().catch(() => null) : null;
      } catch {
        return null;
      }
    },
    async refreshLocal() {
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      try {
        const dataJaringan = await this.localFetch('/api/status', { timeoutMs: 2000 });
        if (!dataJaringan) return false;
        const jaringan = parseStatusJson(dataJaringan);
        const [sensorData, actuatorData, taskData, nodeData] = await Promise.all([
          this.localFetch('/api/sensors', { timeoutMs: 2500 }),
          this.localFetch('/api/actuators', { timeoutMs: 2500 }),
          this.localFetch('/api/tasks', { timeoutMs: 2500 }),
          this.localFetch('/api/nodes', { timeoutMs: 2500 })
        ]);
        this.applyNetworkScope(jaringan);
        this.sensors = this.mergeSensors(parseSensorsJson(sensorData));
        this.actuators = parseActuatorsJson(actuatorData);
        this.registryNodes = Array.isArray(nodeData?.nodes) ? nodeData.nodes : [];
        this.mergeTasks(parseTasksJson(taskData));
        this.syncMoistureCalibrationFromSensors();
        this.syncDistanceCalibrationFromSensors();
        this.syncFuelCalibrationFromSensors();
        this.lastUpdate = new Date();
        return true;
      } catch {
        return false;
      }
    },
    mergeTasks(newTasks) {
      newTasks.forEach(newTask => {
        const oldTask = this.tasks.find(t => t.index === newTask.index);
        if (newTask.actuatorActive) {
          if (oldTask && oldTask.actuatorActive && oldTask.startTime) {
            newTask.startTime = oldTask.startTime;
          } else {
            newTask.startTime = Date.now();
          }
        }
      });
      this.tasks = newTasks;
    },
    // Gabungkan sensor PARSIAL (delta) ke daftar yang sedang ditampilkan.
    // Sensor yang belum ada ditambahkan (mis. node baru selesai presentasi).
    applySensorDelta(newSensors) {
      const daftar = Array.isArray(this.sensors) ? [...this.sensors] : [];
      const posisi = new Map(daftar.map((sensor, index) => [`${Number(sensor.nodeId)}:${Number(sensor.childId)}`, index]));
      (Array.isArray(newSensors) ? newSensors : []).forEach(sensor => {
        const key = `${Number(sensor.nodeId)}:${Number(sensor.childId)}`;
        if (posisi.has(key)) {
          const index = posisi.get(key);
          daftar[index] = { ...daftar[index], ...sensor };
        } else {
          daftar.push(sensor);
        }
      });
      return daftar;
    },
    mergeSensors(newSensors) {
      const prevSensors = new Map((this.sensors || []).map(sensor => [`${Number(sensor.nodeId)}:${Number(sensor.childId)}`, sensor]));
      return (Array.isArray(newSensors) ? newSensors : []).map(sensor => {
        const key = `${Number(sensor.nodeId)}:${Number(sensor.childId)}`;
        const previous = prevSensors.get(key) || {};
        const mergedRaw = pickRawAdcValue(
          sensor.rawValue,
          sensor.lastSensorRawValue,
          previous.rawValue,
          previous.lastSensorRawValue
        );
        return {
          ...sensor,
          rawValue: mergedRaw,
          lastSensorRawValue: mergedRaw
        };
      });
    },
    getTaskProgress(task) {
      if (!task.actuatorActive || !task.startTime) return 0;
      let duration = task.activateDurationMs || 0;
      if (task.lastTriggerSource === 'schedule') {
        const now = new Date(this.now);
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const activeSched = (task.schedules || []).find(s => s.enabled && s.pickupTime <= timeStr);
        if (activeSched) duration = activeSched.durationMinutes * 60000;
      }
      if (duration <= 0) return 0;
      const elapsed = this.now - task.startTime;
      return Math.min(100, (elapsed / duration) * 100);
    },
    publishCommand(command, legacyArgs = null) { 
      if (!this.mqttClient?.connected) return this.showToast('Koneksi online belum tersambung.', 'error'); 
      const cmd = typeof command === 'string' ? command : command?.cmd;
      if (!cmd) return;
      const topic = `abadinet-in/${this.config.mqtt.kontrolId}/${this.config.uiId || '0'}/0/${cmd}`; 
      const payload = typeof command === 'string'
        ? bangunPayloadPerintahLama(cmd, legacyArgs || [])
        : bangunPayloadPerintah(cmd, Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'cmd')));
      this.mqttClient.publish(topic, payload); 
    },
    async sendLocalCommand(command, legacyArgs = null, timeoutMs = 10000) {
      const enriched = typeof command === 'string' ? command : { ...command, uiId: this.config?.uiId || '0' };
      const payload = typeof command === 'string' ? bangunPayloadPerintahLama(command, legacyArgs || []) : JSON.stringify(enriched);
      const result = await this.localFetch('/api/cmd', {
        method: 'POST', timeoutMs, body: payload
      });
      if (!result) return { ok: false, error: 'Perintah gagal' };
      const ok = result.ok !== false;
      return { ok, data: result, text: JSON.stringify(result) };
    },
    // durationMs=0 → perangkat memakai durasi manual tersimpan (NVS).
    async sendActuator(index, action, tombol) { if (!this.beginAction(tombol)) return; if (this.mode === 'local') { const res = await this.sendLocalCommand({ cmd: 'setActuator', index, action, durationMs: 0 }); if (res.ok) await this.refreshLocal(); else this.showToast('Gagal mengirim perintah.', 'error'); this.endAction(); } else { this.publishCommand({ cmd: 'setActuator', index, action, durationMs: 0 }); } },
    async runTask(index, tombol) { if (!this.beginAction(tombol)) return; this.loadingTaskIndex = index; if (this.mode === 'local') { const res = await this.sendLocalCommand({ cmd: 'runTask', index }); if(res.ok) await this.refreshLocal(); this.endAction(); } else { this.publishCommand({ cmd: 'runTask', index }); } },
    deleteTask(index) { 
      if (!this.allowTaskDelete) {
        this.showToast(this.getTaskDeleteLockedMessage(), 'error');
        return;
      }
      if (!this.tasks) return;
      const task = this.tasks.find(t => t.index === index);
      this.taskToDelete = { index, label: task ? task.label : `Task ${index}` };
      this.showDeleteConfirm = true;
    },
    async confirmDelete() {
      if (!this.taskToDelete) return;
      if (!this.beginAction()) return;
      const index = this.taskToDelete.index;
      
      try {
        if (this.mode === 'local') { 
          const res = await this.sendLocalCommand('deleteTask', [index]); 
          if(res.ok) {
            await this.refreshLocal();
            this.showToast('Task telah dihapus.');
          } else {
            this.showToast('Gagal menghapus task.', 'error');
          }
          this.endAction();
        } else { 
          this.publishCommand('deleteTask', [index]); 
          this.showToast('Perintah hapus dikirim.');
        // Minta penyegaran setelah hapus
          setTimeout(() => {
            this.publishCommand('getTasks');
          }, 1000);
        }
      } catch (e) {
        this.showToast('Terjadi kesalahan.', 'error');
        this.endAction();
      } finally {
        this.showDeleteConfirm = false;
        this.showAllTasksModal = false;
        this.taskToDelete = null;
      }
    },

    // ── Pemeliharaan data (padanan perintah serial) ──────────────────────
    // Serial: reset nodes/sensors/actuators/tasks/data + factory reset <sandi>.
    askRemoveNode(nodeId) {
      const id = this.numOrNull(nodeId);
      if (id === null) return;
      if (id === 0) {
        this.showToast('Node 0 adalah kontroler ini sendiri dan tidak bisa dihapus.', 'error');
        return;
      }
      this.maintenanceConfirm = {
        title: 'Hapus Node',
        message: `Lepas node ${id} dari daftar? Sensor dan aktuator node ini ikut dilepas (kalibrasinya hilang).`,
        confirmText: 'Ya, Hapus',
        action: `node:${id}`
      };
      this.showMaintenanceConfirm = true;
    },
    askReset(scope) {
      const label = {
        nodes: 'seluruh pendaftaran node',
        sensors: 'seluruh pendaftaran sensor',
        actuators: 'seluruh pendaftaran aktuator',
        tasks: 'semua task',
        data: 'SEMUA data (task, sensor, aktuator, node)'
      }[scope] || scope;
      this.maintenanceConfirm = {
        title: 'Konfirmasi',
        message: `Kosongkan ${label}? Tindakan ini tidak bisa dibatalkan.`,
        confirmText: 'Ya, Kosongkan',
        action: `reset:${scope}`
      };
      this.showMaintenanceConfirm = true;
    },
    askFactoryReset() {
      if (!`${this.factoryResetPassword || ''}`.trim()) {
        this.showToast('Isi sandi teknisi dulu.', 'error');
        return;
      }
      this.maintenanceConfirm = {
        title: 'Reset Pabrik',
        message: 'Hapus SEMUA setelan (akun, WiFi, saluran radio, kalibrasi, task, data node) lalu restart perangkat?',
        confirmText: 'Ya, Reset Pabrik',
        action: 'factory'
      };
      this.showMaintenanceConfirm = true;
    },
    async runMaintenanceConfirm() {
      const action = `${this.maintenanceConfirm?.action || ''}`;
      this.showMaintenanceConfirm = false;
      if (!action) return;
      if (action === 'factory') {
        await this.factoryResetDevice();
        return;
      }
      if (action.startsWith('ap:')) {
        await this.applyApMode(action === 'ap:on');
        return;
      }
      if (!this.beginAction()) return;
      try {
        const [kind, value] = action.split(':');
        let result = null;
        if (kind === 'node') {
          result = await this.localFetch('/api/node/remove', {
            method: 'POST', timeoutMs: 8000, body: JSON.stringify({ nodeId: Number(value) })
          });
        } else if (kind === 'reset') {
          result = await this.localFetch('/api/reset', {
            method: 'POST', timeoutMs: 8000, body: JSON.stringify({ scope: value })
          });
        }
        if (result?.ok) {
          this.showToast('Selesai. Daftar dimuat ulang.');
          await this.refreshLocal();
        } else {
          this.showToast(result?.error || 'Tindakan gagal dijalankan.', 'error');
        }
      } catch (e) {
        this.showToast('Terjadi kesalahan.', 'error');
      } finally {
        this.endAction();
      }
    },
    async factoryResetDevice() {
      const password = `${this.factoryResetPassword || ''}`.trim();
      if (!password) {
        this.showToast('Isi sandi teknisi dulu.', 'error');
        return;
      }
      if (!this.beginAction()) return;
      this.factoryResetBusy = true;
      try {
        const result = await this.localFetch('/api/factory-reset', {
          method: 'POST', timeoutMs: 8000, body: JSON.stringify({ password })
        });
        this.factoryResetPassword = '';
        if (result?.ok) {
          this.showToast(result?.message || 'Reset pabrik dijalankan. Perangkat restart...');
        } else {
          this.showToast('Gagal: sandi teknisi salah atau perangkat tidak merespons.', 'error');
        }
      } catch (e) {
        this.showToast('Terjadi kesalahan.', 'error');
      } finally {
        this.factoryResetBusy = false;
        this.endAction();
      }
    },
    async restartDevice() {
      if (!this.beginAction()) return;
      try {
        const result = await this.localFetch('/api/restart', {
          method: 'POST', timeoutMs: 8000, body: '{}'
        });
        this.showToast(result?.ok ? 'Perangkat dimulai ulang...' : 'Gagal memulai ulang perangkat.', result?.ok ? 'info' : 'error');
      } catch (e) {
        this.showToast('Terjadi kesalahan.', 'error');
      } finally {
        this.endAction();
      }
    },

    // ── Titik akses lokal (AP) — padanan perintah serial `ap on|off` ───────
    // Jalur masuk portal tanpa jaringan/internet. Cara utama tetap tombol AP
    // di perangkat; ini jalur cadangan bila tombol tidak berfungsi.
    askApMode(nyalakan) {
      const on = !!nyalakan;
      this.maintenanceConfirm = {
        title: on ? 'Nyalakan AP Lokal' : 'Matikan AP Lokal',
        message: on
          ? 'Jalur WiFi dimatikan dan diganti hotspot perangkat (internet lewat WiFi berhenti; modem USB tetap jalan). Portal pindah ke http://192.168.4.1/ — sambungkan dulu ke WiFi KarjoAgro KA-xxxx. Lanjutkan?'
          : 'Hotspot dimatikan dan perangkat menyambung ulang ke jaringan tersimpan. Koneksi ke portal ini akan terputus. Lanjutkan?',
        confirmText: on ? 'Ya, Nyalakan' : 'Ya, Matikan',
        action: on ? 'ap:on' : 'ap:off'
      };
      this.showMaintenanceConfirm = true;
    },
    async applyApMode(nyalakan) {
      if (!this.beginAction()) return;
      try {
        const result = await this.localFetch('/api/ap', {
          method: 'POST', timeoutMs: 12000, body: JSON.stringify({ on: !!nyalakan })
        });
        if (nyalakan) {
          if (result?.ok) {
            this.apInfo = {
              ssid: result.apSsid || '',
              password: result.apPassword || '',
              url: result.portalUrl || 'http://192.168.4.1/'
            };
            this.showToast('AP lokal aktif: ' + (this.apInfo.ssid || 'KarjoAgro'));
          } else {
            this.showToast('Gagal menyalakan AP lokal. Cek log serial perangkat.', 'error');
          }
        } else {
          // Perangkat langsung memutus hotspot, jadi respons bisa tidak sampai.
          this.apInfo = { ssid: '', password: '', url: '' };
          this.showToast('AP lokal dimatikan. Perangkat menyambung ulang ke jaringan tersimpan.');
        }
      } catch (e) {
        this.showToast('Terjadi kesalahan.', 'error');
      } finally {
        this.endAction();
      }
    },

    // UI & fungsi bantuan
    showToast(message, type = 'info') { if (this.toast.timer) clearTimeout(this.toast.timer); this.toast = { message, type, visible: true }; this.toast.timer = setTimeout(() => { this.toast.visible = false; }, 3000); },
    beginAction(tombol) { 
      if (this.actionInFlight) return false; 
      this.actionInFlight = true; 
      if(this.actionTimer) clearTimeout(this.actionTimer); 
      // Batas waktu 10 detik agar koneksi lambat tetap punya kesempatan
      this.actionTimer = setTimeout(() => { 
        if(this.actionInFlight) { 
          this.showToast('Batas waktu habis: kontroler tidak merespons.', 'error'); 
          this.endAction(); 
        } 
      }, 10000); 
      return true; 
    },
    endAction() { if(this.actionTimer) clearTimeout(this.actionTimer); this.actionInFlight = false; this.loadingTaskIndex = null; },
    applyKontrolId(nextId, { skipLogout = false } = {}) { const normalized = normalizeKontrolId(nextId); if (!normalized || normalized === this.config.mqtt.kontrolId) return; const previous = this.config.mqtt.kontrolId; this.config.mqtt.kontrolId = normalized; this.ensureKontrolIdList(normalized); this.clearDeviceState(); this.vpsState = null; this.syncVpsState(); this.saveConfig(); if (this.mode === 'mqtt' && this.mqttClient?.connected) { if (previous) this.mqttClient.unsubscribe(`abadinet-out/${previous}/#`); this.mqttClient.subscribe(`abadinet-out/${normalized}/#`); this.publishCommand('getAll'); } if (!skipLogout) this.logoutApplication(true); },
    ensureKontrolIdList(id) { const normalized = normalizeKontrolId(id); if(normalized && !this.config.kontrolIds.includes(normalized)) { this.config.kontrolIds.push(normalized); } },
    
    // Fungsi tampilan task & jadwal
    getSensorLabel(task) { 
      if (!task) return '-';
      const sensor = this.sensors.find(s => s.nodeId === task.sensorNode && s.childId === task.sensorChild); 
      return sensor?.label || `Sensor ${task.sensorNode}:${task.sensorChild}`; 
    },
    getActuatorLabel(task) { 
      if (!task) return '-';
      const actuator = this.actuators.find(a => a.index === task.actuatorIndex); 
      return actuator?.label || `Aktuator ${task.actuatorIndex}`; 
    },
    getSensorUnit(task) { 
      if (!task) return '';
      const sensor = this.sensors.find(s => s.nodeId === task.sensorNode && s.childId === task.sensorChild); 
      if (!sensor) return ''; 
      const label = `${sensor.label || ''}`.toLowerCase();
      // Satuan dikenali dari ISTILAH UMUM label dulu (Ketinggian Air / Tinggi
      // Cairan / Suhu Udara / Kelembapan) baru nama teknis & tipe nilai.
      if (label.includes('ketinggian') || label.includes('cairan') || label.includes('tangki')) return 'cm';
      if (label.includes('suhu') || label.includes('temp') || label.includes('lm35')) return '°C';
      if (label.includes('kelembapan') || label.includes('hum') || label.includes('moist') || label.includes('soil')) return '%';
      if (label.includes('dist') || label.includes('cm')) return 'cm';
      if (label.includes('volt')) return 'V';
      if (label.includes('watt')) return 'W';
      if (label.includes('amp')) return 'A';
      if (label.includes('lux') || label.includes('light')) return 'lux';
      // Cadangan: tipe nilai sensor (V_TEMP=1, V_PERCENTAGE=3, V_DISTANCE=13).
      const valueType = Number(sensor.valueType);
      if (valueType === 1) return '°C';
      if (valueType === 3) return '%';
      if (valueType === 13) return 'cm';
      const match = `${sensor.label || ''}`.match(/\(([^)]+)\)/); 
      return match ? match[1] : ''; 
    },
    isMoistureSensor(sensor) {
      if (!sensor) return false;
      const label = `${sensor.label || ''}`.toLowerCase();
      // "Kelembapan Udara" (DHT22) BUKAN sensor kelembapan tanah — cek lebih dulu.
      if (label.includes('kelembapan udara') || label.includes('humid')) return false;
      // Istilah umum: "Kelembapan Tanah" (dulu "Soil Moisture"/"Capacitive moisture").
      if (label.includes('kelembapan') || label.includes('moist') || label.includes('soil')) return true;
      return sensor.valueType === 3 || sensor.sensorType === 23;
    },
    getMoistureCalibrationSensor() {
      const nodeId = Number(this.moistureCalibration?.nodeId);
      const childId = Number(this.moistureCalibration?.childId);
      if (!Number.isFinite(nodeId) || !Number.isFinite(childId)) return null;
      return this.sensors.find(sensor => Number(sensor.nodeId) === nodeId && Number(sensor.childId) === childId) || null;
    },
    syncMoistureCalibrationFromSensors() {
      if (!this.showMoistureCalibrationModal) return;
      const sensor = this.getMoistureCalibrationSensor();
      if (!sensor) return;
      const candidateRaw = pickRawAdcValue(
        sensor.rawValue,
        sensor.lastSensorRawValue,
        this.moistureCalibration.rawValue,
        this.estimateMoistureRawFromValue(sensor)
      );
      if (candidateRaw !== null) {
        this.moistureCalibration.rawValue = candidateRaw;
      }
      this.moistureCalibration.currentValue = sensor.value;
      if (sensor.label) this.moistureCalibration.label = sensor.label;
    },
    async refreshMoistureCalibrationData() {
      if (!this.showMoistureCalibrationModal) return false;
      if (this.mode === 'local') {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        try {
          const sensorData = await ambilJsonDenganBatasWaktu(`${base}/api/sensors`, {}, 2000);
          if (!sensorData) return false;
          this.sensors = this.mergeSensors(parseSensorsJson(sensorData));
          this.syncMoistureCalibrationFromSensors();
          this.lastUpdate = new Date();
          return true;
        } catch {
          return false;
        }
      }
      if (this.mode === 'mqtt' && this.mqttClient?.connected) {
        this.publishCommand({ cmd: 'getSensors' });
        return true;
      }
      return false;
    },
    startMoistureCalibrationPolling() {
      this.clearMoistureCalibrationPolling();
      if (!this.showMoistureCalibrationModal) return;
      this.refreshMoistureCalibrationData();
      this.moistureCalibrationPollTimer = setInterval(() => {
        if (!this.showMoistureCalibrationModal) {
          this.clearMoistureCalibrationPolling();
          return;
        }
        this.refreshMoistureCalibrationData();
      }, 2000);
    },
    estimateMoistureRawFromValue(sensor) {
      if (!sensor) return null;
      const value = Number(sensor.value);
      if (!Number.isFinite(value)) return null;
      if (value >= 0 && value <= 100) {
        return Math.round(value * 4095 / 100);
      }
      return Math.round(value);
    },
    initCalibrationInterval(sensor) {
      return sensor.sleepIntervalMs ? Math.round(sensor.sleepIntervalMs / 60000) : 60;
    },
    openMoistureCalibration(sensor) {
      if (!this.isMoistureSensor(sensor)) return;
      const dryValue = toNumber(sensor.moistureDryCalibration, 800);
      const wetValue = toNumber(sensor.moistureWetCalibration, 490);
      const rawValue = pickRawAdcValue(
        sensor.rawValue,
        sensor.lastSensorRawValue,
        this.moistureCalibration?.rawValue,
        this.estimateMoistureRawFromValue(sensor)
      );
      this.moistureCalibration = {
        nodeId: sensor.nodeId,
        childId: sensor.childId,
        label: sensor.label || `Node ${sensor.nodeId}:${sensor.childId}`,
        rawValue,
        dryValue,
        wetValue,
        currentValue: sensor.value,
        error: '',
        intervalSec: this.initCalibrationInterval(sensor)
      };
      this.showMoistureCalibrationModal = true;
      this.startMoistureCalibrationPolling();
      setTimeout(() => {
        if (this.showMoistureCalibrationModal) {
          this.refreshMoistureCalibrationData();
        }
      }, 400);
    },
    closeMoistureCalibration() {
      this.clearMoistureCalibrationPolling();
      this.showMoistureCalibrationModal = false;
    },
    setMoistureCalibrationPoint(kind) {
      const nilaiMentah = this.moistureCalibration?.rawValue;
      if (!Number.isFinite(Number(nilaiMentah))) {
        this.showToast('Nilai raw sensor belum tersedia.', 'error');
        return;
      }
      if (kind === 'dry') {
        this.moistureCalibration.dryValue = Math.round(Number(nilaiMentah));
      } else if (kind === 'wet') {
        this.moistureCalibration.wetValue = Math.round(Number(nilaiMentah));
      }
    },
    resetMoistureCalibration() {
      this.moistureCalibration.dryValue = 800;
      this.moistureCalibration.wetValue = 490;
    },
    async saveMoistureCalibration() {
      const payload = this.moistureCalibration || {};
      const nodeId = toNumber(payload.nodeId, 0);
      const childId = toNumber(payload.childId, -1);
      const dryValue = toNumber(payload.dryValue, NaN);
      const wetValue = toNumber(payload.wetValue, NaN);
      if (!nodeId || childId < 0 || !Number.isFinite(dryValue) || !Number.isFinite(wetValue)) {
        this.showToast('Data kalibrasi belum lengkap.', 'error');
        return;
      }
      if (dryValue < 0 || dryValue > 4095 || wetValue < 0 || wetValue > 4095 || dryValue === wetValue) {
        this.showToast('Nilai kalibrasi harus 0-4095 dan tidak boleh sama.', 'error');
        return;
      }
      if (!this.beginAction()) return;
      const perintah = { cmd: 'setMoistureCalibration', nodeId, childId, dry: Math.round(dryValue), wet: Math.round(wetValue) };
      try {
        if (this.mode === 'local') {
          const res = await this.sendLocalCommand(perintah);
          if (res.ok) {
            await this.refreshLocal();
            this.showToast('Kalibrasi tersimpan.');
            this.closeMoistureCalibration();
          } else {
            this.showToast(res.error || 'Gagal menyimpan kalibrasi.', 'error');
          }
        } else {
          this.publishCommand(perintah);
          setTimeout(() => this.publishCommand('getSensors'), 500);
          this.showToast('Kalibrasi dikirim ke kontroler.');
          // Juga kirim interval jika remote node
          if (nodeId !== 0 && payload.intervalSec) {
            this.publishCommand('setSensorSleep', [nodeId, childId, payload.intervalSec * 60 * 1000]);
          }
          this.closeMoistureCalibration();
        }
      } finally {
        this.endAction();
      }
    },
    isDistanceSensor(sensor) {
      if (!sensor) return false;
      const label = `${sensor.label || ''}`.toLowerCase();
      // "Ketinggian Air" = istilah umum (label lama: "HC-SR04 distance"/"VL53L0X distance").
      if (label.includes('ketinggian') || label.includes('distance') || label.includes('hcsr04')) return true;
      return sensor.valueType === 13 || sensor.sensorType === 15;
    },
    isFuelHeightSensor(sensor) {
      if (!sensor) return false;
      const label = `${sensor.label || ''}`.toLowerCase();
      // "Tinggi Cairan" = istilah umum (label lama: "Fuel height"). Sensor ini
      // juga mengirim V_DISTANCE, jadi SELALU dicek lebih dulu dari jarak air.
      return label.includes('cairan') || label.includes('tangki') || label.includes('fuel');
    },
    getDistanceCalibrationSensor() {
      const nodeId = Number(this.distanceCalibration?.nodeId);
      const childId = Number(this.distanceCalibration?.childId);
      if (!Number.isFinite(nodeId) || !Number.isFinite(childId)) return null;
      return this.sensors.find(sensor => Number(sensor.nodeId) === nodeId && Number(sensor.childId) === childId) || null;
    },
    syncDistanceCalibrationFromSensors() {
      if (!this.showDistanceCalibrationModal) return;
      const sensor = this.getDistanceCalibrationSensor();
      if (!sensor) return;
      const rawValue = this.pickRawDistanceValue(
        sensor.rawValue,
        sensor.lastSensorRawValue,
        this.distanceCalibration.rawValue,
        this.estimateDistanceRawFromValue(sensor)
      );
      if (rawValue !== null) {
        this.distanceCalibration.rawValue = rawValue;
      }
      this.distanceCalibration.currentValue = sensor.value;
      if (sensor.label) this.distanceCalibration.label = sensor.label;
      // Kalibrasi titik nol (cm jarak mentah saat level 0 cm).
      const zeroCalibration = Number(sensor.distanceZeroCalibration);
      if (Number.isFinite(zeroCalibration) && zeroCalibration > 0) {
        this.distanceCalibration.savedZero = zeroCalibration;
        if (!this.distanceCalibration.zeroTouched) this.distanceCalibration.zeroValue = zeroCalibration;
      } else {
        this.distanceCalibration.savedZero = 0;
      }
    },
    // Jarak mentah (cm) TIDAK dibulatkan: pickRawAdcValue membulatkan ke integer
    // (cocok untuk ADC 0-4095) sedangkan kalibrasi titik nol butuh ketelitian cm.
    pickRawDistanceValue(...values) {
      for (const value of values) {
        if (!isValidRawAdcValue(value)) continue;
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric;
      }
      return null;
    },
    async refreshDistanceCalibrationData() {
      if (!this.showDistanceCalibrationModal) return false;
      if (this.mode === 'local') {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        try {
          const sensorData = await ambilJsonDenganBatasWaktu(`${base}/api/sensors`, {}, 2000);
          if (!sensorData) return false;
          this.sensors = this.mergeSensors(parseSensorsJson(sensorData));
          this.syncDistanceCalibrationFromSensors();
          this.lastUpdate = new Date();
          return true;
        } catch {
          return false;
        }
      }
      if (this.mode === 'mqtt' && this.mqttClient?.connected) {
        this.publishCommand({ cmd: 'getSensors' });
        return true;
      }
      return false;
    },
    startDistanceCalibrationPolling() {
      this.clearDistanceCalibrationPolling();
      if (!this.showDistanceCalibrationModal) return;
      this.refreshDistanceCalibrationData();
      this.distanceCalibrationPollTimer = setInterval(() => {
        if (!this.showDistanceCalibrationModal) {
          this.clearDistanceCalibrationPolling();
          return;
        }
        this.refreshDistanceCalibrationData();
      }, 2000);
    },
    estimateDistanceRawFromValue(sensor) {
      if (!sensor) return null;
      if (Number.isFinite(Number(sensor.rawValue)) && sensor.rawValue !== null) return toNumber(sensor.rawValue, null);
      const value = Number(sensor.value);
      return Number.isFinite(value) ? value : null;
    },
    openSensorInterval(sensor) {
      if (!sensor || sensor.nodeId === 0) return;
      this.sensorInterval = {
        nodeId: sensor.nodeId,
        childId: sensor.childId,
        label: sensor.label || `Sensor ${sensor.nodeId}:${sensor.childId}`,
        intervalSec: sensor.sleepIntervalMs ? Math.round(sensor.sleepIntervalMs / 60000) : 60
      };
      this.showSensorIntervalModal = true;
    },
    closeSensorInterval() {
      this.showSensorIntervalModal = false;
    },
    saveSensorInterval() {
      const s = this.sensorInterval;
      if (s.nodeId === 0) return;
      this.publishCommand('setSensorSleep', [s.nodeId, s.childId, s.intervalSec * 60 * 1000]);
      this.showToast(`Interval node ${s.nodeId}:${s.childId} disimpan.`, 'success');
      this.closeSensorInterval();
    },

    // ── Info node terhubung (baterai, timer/interval, kalibrasi saat ini) ──
    // Dashboard menerima data per-sensor, sedangkan baterai & interval tidur
    // milik NODE. Semua child pada node yang sama membawa nilai node yang sama,
    // jadi informasi node dirangkum dari daftar sensor (dikelompokkan nodeId).
    numOrNull(value) {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    },
    get nodeSummaries() {
      const map = new Map();
      const pastikan = (nodeId) => {
        let node = map.get(nodeId);
        if (!node) {
          node = {
            nodeId, sensors: [], battery: null, batteryAgeMs: null, sleepIntervalMs: null,
            sleepAgeMs: null, lastSeenAgeMs: null, known: false, localOut: false, actuatorCount: 0
          };
          map.set(nodeId, node);
        }
        return node;
      };
      // Node dari registri (termasuk yang belum/tidak punya sensor aktif).
      (this.registryNodes || []).forEach(entri => {
        const nodeId = this.numOrNull(entri?.nodeId);
        if (nodeId === null) return;
        const node = pastikan(nodeId);
        node.known = entri.known === true || entri.known === 1;
        node.localOut = entri.local === true || entri.local === 1;
        node.actuatorCount = this.numOrNull(entri.actuators) ?? 0;
      });
      (this.sensors || []).forEach(sensor => {
        const nodeId = this.numOrNull(sensor?.nodeId);
        if (nodeId === null) return;
        const node = pastikan(nodeId);
        node.sensors.push(sensor);
        const battery = this.numOrNull(sensor.battery);
        if (node.battery === null && battery !== null) node.battery = battery;
        const batteryAge = this.numOrNull(sensor.batteryAgeMs);
        if (node.batteryAgeMs === null && batteryAge !== null) node.batteryAgeMs = batteryAge;
        const sleepMs = this.numOrNull(sensor.sleepIntervalMs);
        if (node.sleepIntervalMs === null && sleepMs !== null) node.sleepIntervalMs = sleepMs;
        const sleepAge = this.numOrNull(sensor.sleepAgeMs);
        if (node.sleepAgeMs === null && sleepAge !== null) node.sleepAgeMs = sleepAge;
        const seenAge = this.numOrNull(sensor.lastSeenAgeMs);
        if (seenAge !== null && (node.lastSeenAgeMs === null || seenAge < node.lastSeenAgeMs)) node.lastSeenAgeMs = seenAge;
      });
      return [...map.values()].sort((a, b) => a.nodeId - b.nodeId);
    },
    formatAgeText(ms) {
      const value = this.numOrNull(ms);
      if (value === null) return '-';
      const sec = Math.max(0, Math.floor(value / 1000));
      if (sec < 60) return `${sec} dtk lalu`;
      if (sec < 3600) return `${Math.floor(sec / 60)} mnt lalu`;
      if (sec < 86400) return `${Math.floor(sec / 3600)} jam lalu`;
      return `${Math.floor(sec / 86400)} hari lalu`;
    },
    nodeBatteryText(node) {
      const level = this.numOrNull(node?.battery);
      return level === null ? '--' : `${Math.round(level)}%`;
    },
    nodeBatteryBadge(node) {
      const level = this.numOrNull(node?.battery);
      if (level === null) return 'badge-muted';
      if (level <= 20) return 'badge-danger';
      if (level <= 50) return 'badge-warn';
      return 'badge-success';
    },
    nodeTimerText(node) {
      const ms = this.numOrNull(node?.sleepIntervalMs);
      if (ms === null || ms <= 0) return '--';
      const menit = Math.round(ms / 60000);
      return menit >= 1 ? `${menit} mnt` : `${Math.round(ms / 1000)} dtk`;
    },
    // Status kalibrasi yang sedang dipakai sensor (tanpa istilah teknis).
    // URUTAN PENTING: sensor tinggi cairan juga mengirim V_DISTANCE, jadi dicek
    // lebih dulu (deteksinya berbasis nama) supaya tidak terbaca sebagai jarak.
    sensorCalibrationText(sensor) {
      if (!sensor) return '';
      if (this.isMoistureSensor(sensor)) {
        const dry = this.numOrNull(sensor.moistureDryCalibration);
        const wet = this.numOrNull(sensor.moistureWetCalibration);
        return dry !== null && wet !== null ? 'sudah dikalibrasi' : 'belum dikalibrasi';
      }
      if (this.isFuelHeightSensor(sensor)) {
        const zero = this.numOrNull(sensor.fuelZeroCalibration);
        return zero !== null && zero > 0 ? 'sudah dikalibrasi' : 'belum dikalibrasi';
      }
      if (this.isDistanceSensor(sensor)) {
        const zero = this.numOrNull(sensor.distanceZeroCalibration);
        return zero !== null && zero > 0 ? 'sudah dikalibrasi' : 'belum dikalibrasi';
      }
      return '';
    },
    // Baris ringkas di daftar sensor: baterai • timer • kalibrasi.
    sensorInfoLine(sensor) {
      if (!sensor || this.numOrNull(sensor.nodeId) === null || Number(sensor.nodeId) === 0) return '';
      const parts = [];
      const battery = this.numOrNull(sensor.battery);
      if (battery !== null) parts.push(`🔋 ${Math.round(battery)}%`);
      const sleepMs = this.numOrNull(sensor.sleepIntervalMs);
      if (sleepMs !== null && sleepMs > 0) parts.push(`⏱️ ${this.nodeTimerText({ sleepIntervalMs: sleepMs })}`);
      const calib = this.sensorCalibrationText(sensor);
      if (calib) parts.push(calib);
      return parts.join(' • ');
    },
    openNodeInfo(node) {
      const nodeId = this.numOrNull(node?.nodeId);
      if (nodeId === null) return;
      this.nodeInfo = {
        nodeId,
        sensors: [...(node.sensors || [])],
        battery: node.battery ?? null,
        batteryAgeMs: node.batteryAgeMs ?? null,
        sleepIntervalMs: node.sleepIntervalMs ?? null,
        sleepAgeMs: node.sleepAgeMs ?? null,
        lastSeenAgeMs: node.lastSeenAgeMs ?? null
      };
      this.showNodeInfoModal = true;
    },
    closeNodeInfo() {
      this.showNodeInfoModal = false;
    },
    // Ketuk sensor di modal info node → buka modal kalibrasi/interval yang sesuai.
    // Fuel diperiksa lebih dulu karena sensor fuel juga V_DISTANCE.
    openNodeInfoSensor(sensor) {
      if (!sensor) return;
      this.closeNodeInfo();
      if (this.isMoistureSensor(sensor)) this.openMoistureCalibration(sensor);
      else if (this.isFuelHeightSensor(sensor)) this.openFuelCalibration(sensor);
      else if (this.isDistanceSensor(sensor)) this.openDistanceCalibration(sensor);
      else this.openSensorInterval(sensor);
    },

    openDistanceCalibration(sensor) {
      if (!this.isDistanceSensor(sensor)) return;
      const rawValue = this.pickRawDistanceValue(
        sensor.rawValue,
        sensor.lastSensorRawValue,
        this.distanceCalibration?.rawValue,
        this.estimateDistanceRawFromValue(sensor)
      );
      const zeroCalibration = Number(sensor.distanceZeroCalibration);
      const savedZero = Number.isFinite(zeroCalibration) && zeroCalibration > 0 ? zeroCalibration : 0;
      this.distanceCalibration = {
        nodeId: sensor.nodeId,
        childId: sensor.childId,
        label: sensor.label || `Node ${sensor.nodeId}:${sensor.childId}`,
        rawValue,
        // zeroValue  : yang akan disimpan (bisa diubah sebelum simpan)
        // savedZero  : titik 0 yang sedang dipakai kontroler
        zeroValue: savedZero,
        savedZero,
        zeroTouched: false,
        currentValue: sensor.value,
        error: '',
        intervalSec: this.initCalibrationInterval(sensor)
      };
      this.showDistanceCalibrationModal = true;
      this.startDistanceCalibrationPolling();
    },
    closeDistanceCalibration() {
      this.clearDistanceCalibrationPolling();
      this.showDistanceCalibrationModal = false;
    },
    // "Set Titik 0": pakai JARAK MENTAH yang dibaca SEKARANG sebagai titik 0
    // (permukaan acuan). Sama seperti tombol "Set Titik 0" di karjoAgroSensorHub.
    setDistanceZeroPoint() {
      const nilaiMentah = Number(this.distanceCalibration?.rawValue);
      if (!Number.isFinite(nilaiMentah)) {
        this.showToast('Jarak mentah sensor belum tersedia.', 'error');
        return;
      }
      this.distanceCalibration.zeroValue = nilaiMentah;
      this.distanceCalibration.zeroTouched = true;
      this.showToast(`Titik 0 diset: ${nilaiMentah.toFixed(1)} cm — tekan Simpan Kalibrasi.`);
    },
    resetDistanceCalibration() {
      this.distanceCalibration.zeroValue = 0;
      this.distanceCalibration.zeroTouched = true;
      this.showToast('Titik 0 dihapus — tekan Simpan Kalibrasi.');
    },
    // Pratinjau level yang akan dilaporkan: level = titik 0 - jarak sekarang.
    // Titik 0 = PERMUKAAN TANAH ⇒ air di bawah permukaan = minus, di atas = plus.
    get distanceLevelPreview() {
      const zero = Number(this.distanceCalibration?.zeroValue);
      const raw = Number(this.distanceCalibration?.rawValue);
      if (!Number.isFinite(zero) || zero <= 0 || !Number.isFinite(raw)) return null;
      return Math.max(-15, Math.min(15, zero - raw));
    },
    get distanceLevelDirectionText() {
      const level = this.distanceLevelPreview;
      if (level === null) return '';
      if (level > 0.05) return 'air di atas permukaan tanah';
      if (level < -0.05) return 'air di bawah permukaan tanah';
      return 'air tepat di permukaan tanah';
    },
    async saveDistanceCalibration() {
      const payload = this.distanceCalibration || {};
      const nodeId = toNumber(payload.nodeId, 0);
      const childId = toNumber(payload.childId, -1);
      const zeroValue = Number(payload.zeroValue);
      if (!nodeId || childId < 0 || !Number.isFinite(zeroValue) || zeroValue < 0) {
        this.showToast('Data kalibrasi belum lengkap.', 'error');
        return;
      }
      if (!this.beginAction()) return;
      const perintah = { cmd: 'setDistanceZero', nodeId, childId, zero: zeroValue };
      try {
        if (this.mode === 'local') {
          const res = await this.sendLocalCommand(perintah);
          if (res.ok) {
            await this.refreshLocal();
            this.showToast(zeroValue > 0 ? `Titik 0 disimpan: ${zeroValue.toFixed(1)} cm` : 'Kalibrasi titik 0 dihapus.');
            this.closeDistanceCalibration();
          } else {
            this.showToast(res.error || 'Gagal menyimpan kalibrasi.', 'error');
          }
        } else {
          this.publishCommand(perintah);
          setTimeout(() => this.publishCommand('getSensors'), 500);
          this.showToast('Kalibrasi titik 0 dikirim ke kontroler.');
          if (nodeId !== 0 && payload.intervalSec) {
            this.publishCommand('setSensorSleep', [nodeId, childId, payload.intervalSec * 60 * 1000]);
          }
          this.closeDistanceCalibration();
        }
      } finally {
        this.endAction();
      }
    },
    getFuelCalibrationSensor() {
      const nodeId = Number(this.fuelCalibration?.nodeId);
      const childId = Number(this.fuelCalibration?.childId);
      if (!Number.isFinite(nodeId) || !Number.isFinite(childId)) return null;
      return this.sensors.find(sensor => Number(sensor.nodeId) === nodeId && Number(sensor.childId) === childId) || null;
    },
    syncFuelCalibrationFromSensors() {
      if (!this.showFuelCalibrationModal) return;
      const sensor = this.getFuelCalibrationSensor();
      if (!sensor) return;
      const rawValue = this.pickRawDistanceValue(
        sensor.rawValue,
        sensor.lastSensorRawValue,
        this.fuelCalibration.rawValue,
        this.estimateFuelRawFromValue(sensor)
      );
      if (rawValue !== null) {
        this.fuelCalibration.rawValue = rawValue;
      }
      this.fuelCalibration.currentValue = sensor.value;
      if (sensor.label) this.fuelCalibration.label = sensor.label;
      // Kalibrasi titik nol (nilai mentah saat permukaan cairan di titik acuan).
      const zeroCalibration = Number(sensor.fuelZeroCalibration);
      if (Number.isFinite(zeroCalibration) && zeroCalibration > 0) {
        this.fuelCalibration.savedZero = zeroCalibration;
        if (!this.fuelCalibration.zeroTouched) this.fuelCalibration.zeroValue = zeroCalibration;
      } else {
        this.fuelCalibration.savedZero = 0;
      }
    },
    async refreshFuelCalibrationData() {
      if (!this.showFuelCalibrationModal) return false;
      if (this.mode === 'local') {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        try {
          const sensorData = await ambilJsonDenganBatasWaktu(`${base}/api/sensors`, {}, 2000);
          if (!sensorData) return false;
          this.sensors = this.mergeSensors(parseSensorsJson(sensorData));
          this.syncFuelCalibrationFromSensors();
          this.lastUpdate = new Date();
          return true;
        } catch {
          return false;
        }
      }
      if (this.mode === 'mqtt' && this.mqttClient?.connected) {
        this.publishCommand({ cmd: 'getSensors' });
        return true;
      }
      return false;
    },
    startFuelCalibrationPolling() {
      this.clearFuelCalibrationPolling();
      if (!this.showFuelCalibrationModal) return;
      this.refreshFuelCalibrationData();
      this.fuelCalibrationPollTimer = setInterval(() => {
        if (!this.showFuelCalibrationModal) {
          this.clearFuelCalibrationPolling();
          return;
        }
        this.refreshFuelCalibrationData();
      }, 2000);
    },
    estimateFuelRawFromValue(sensor) {
      if (!sensor) return null;
      if (Number.isFinite(Number(sensor.rawValue)) && sensor.rawValue !== null) return toNumber(sensor.rawValue, null);
      const value = Number(sensor.value);
      return Number.isFinite(value) ? value : null;
    },
    openFuelCalibration(sensor) {
      if (!this.isFuelHeightSensor(sensor)) return;
      const rawValue = this.pickRawDistanceValue(
        sensor.rawValue,
        sensor.lastSensorRawValue,
        this.fuelCalibration?.rawValue,
        this.estimateFuelRawFromValue(sensor)
      );
      const zeroCalibration = Number(sensor.fuelZeroCalibration);
      const savedZero = Number.isFinite(zeroCalibration) && zeroCalibration > 0 ? zeroCalibration : 0;
      this.fuelCalibration = {
        nodeId: sensor.nodeId,
        childId: sensor.childId,
        label: sensor.label || `Node ${sensor.nodeId}:${sensor.childId}`,
        rawValue,
        zeroValue: savedZero,
        savedZero,
        zeroTouched: false,
        currentValue: sensor.value,
        error: '',
        intervalSec: this.initCalibrationInterval(sensor)
      };
      this.showFuelCalibrationModal = true;
      this.startFuelCalibrationPolling();
    },
    closeFuelCalibration() {
      this.clearFuelCalibrationPolling();
      this.showFuelCalibrationModal = false;
    },
    // "Set Titik 0": pakai pembacaan MENTAH sekarang sebagai titik 0
    // (permukaan acuan, mis. dasar tangki / kondisi kosong).
    setFuelZeroPoint() {
      const nilaiMentah = Number(this.fuelCalibration?.rawValue);
      if (!Number.isFinite(nilaiMentah)) {
        this.showToast('Pembacaan mentah sensor belum tersedia.', 'error');
        return;
      }
      this.fuelCalibration.zeroValue = nilaiMentah;
      this.fuelCalibration.zeroTouched = true;
      this.showToast(`Titik 0 diset: ${nilaiMentah.toFixed(1)} — tekan Simpan Kalibrasi.`);
    },
    resetFuelCalibration() {
      this.fuelCalibration.zeroValue = 0;
      this.fuelCalibration.zeroTouched = true;
      this.showToast('Titik 0 dihapus — tekan Simpan Kalibrasi.');
    },
    // Pratinjau tinggi cairan: level = pembacaan sekarang - titik 0.
    get fuelLevelPreview() {
      const zero = Number(this.fuelCalibration?.zeroValue);
      const raw = Number(this.fuelCalibration?.rawValue);
      if (!Number.isFinite(zero) || zero <= 0 || !Number.isFinite(raw)) return null;
      return Math.max(-190, Math.min(190, raw - zero));
    },
    async saveFuelCalibration() {
      const payload = this.fuelCalibration || {};
      const nodeId = toNumber(payload.nodeId, 0);
      const childId = toNumber(payload.childId, -1);
      const zeroValue = Number(payload.zeroValue);
      if (!nodeId || childId < 0 || !Number.isFinite(zeroValue) || zeroValue < 0) {
        this.showToast('Data kalibrasi belum lengkap.', 'error');
        return;
      }
      if (!this.beginAction()) return;
      const perintah = { cmd: 'setFuelZero', nodeId, childId, zero: zeroValue };
      try {
        if (this.mode === 'local') {
          const res = await this.sendLocalCommand(perintah);
          if (res.ok) {
            await this.refreshLocal();
            this.showToast(zeroValue > 0 ? `Titik 0 disimpan: ${zeroValue.toFixed(1)}` : 'Kalibrasi titik 0 dihapus.');
            this.closeFuelCalibration();
          } else {
            this.showToast(res.error || 'Gagal menyimpan kalibrasi.', 'error');
          }
        } else {
          this.publishCommand(perintah);
          setTimeout(() => this.publishCommand('getSensors'), 500);
          this.showToast('Kalibrasi titik 0 dikirim ke kontroler.');
          if (nodeId !== 0 && payload.intervalSec) {
            this.publishCommand('setSensorSleep', [nodeId, childId, payload.intervalSec * 60 * 1000]);
          }
          this.closeFuelCalibration();
        }
      } finally {
        this.endAction();
      }
    },
    getScheduleSummary(task) { 
      if (!task) return `${this.getUiLabel('schedule')}: -`;
      const schedules = task.schedules || []; 
      if (!schedules.length) return `${this.getUiLabel('schedule')}: -`; 
      return `${this.getUiLabel('schedule')}: ${schedules.map(s => s.pickupTime).join(', ')}`; 
    },
    isActuatorOnline(task) { 
      if (!task) return false;
      const actuator = this.actuators.find(a => a.index === task.actuatorIndex); 
      return actuator ? actuator.online : true; 
    },
    // Teks durasi ramah-baca: menit bila < 1 jam, selebihnya jam (+ menit sisa).
    formatDurasiMenit(menit) {
      const nilai = Math.max(0, Math.round(Number(menit) || 0));
      if (nilai < 60) return `${nilai} menit`;
      const jam = Math.floor(nilai / 60);
      const sisa = nilai % 60;
      return sisa === 0 ? `${jam} jam` : `${jam} jam ${sisa} menit`;
    },
    // Durasi manual aktuator (ms) — mis. "30 detik" s/d "6 jam (360 menit)".
    formatDurasiManual(milidetik) {
      const nilaiMs = Math.max(0, Number(milidetik) || 0);
      if (nilaiMs < 60000) return `${Math.max(1, Math.round(nilaiMs / 1000))} detik`;
      const menit = Math.round(nilaiMs / 60000);
      if (menit < 60) return `${menit} menit`;
      return `${this.formatDurasiMenit(menit)} (${menit} menit)`;
    },
    // Nilai sensor terkini untuk sebuah task. Diutamakan dari daftar sensor yang
    // sedang tampil (termasuk saat perangkat hanya mengirim DELTA/penghematan
    // kuota), fallback ke nilai terakhir yang dikirim bersama daftar task.
    getTaskSensorValue(task) {
      if (!task) return null;
      const node = Number(task.sensorNode);
      const child = Number(task.sensorChild);
      const sensor = (this.sensors || []).find(s => Number(s.nodeId) === node && Number(s.childId) === child);
      const langsung = Number(sensor?.value);
      if (Number.isFinite(langsung)) return langsung;
      const tersimpan = Number(task.lastSensorValue);
      return Number.isFinite(tersimpan) ? tersimpan : null;
    },
    getTaskTriggerSource(task) {
      if (!task) return 'none';
      const source = normalisasiSumberTrigger(task.lastTriggerSource ?? task.triggerSource ?? task.source ?? task.lastTrigger ?? task.trigger ?? 'none');
      if (source !== 'none') return source;
      if (!task.actuatorActive) return 'none';

      const rawSensor = this.getTaskSensorValue(task);
      const threshold = Number(task.threshold);
      const terpicu = toBool(task.thresholdAbove) ? rawSensor >= threshold : rawSensor <= threshold;
      if (task.thresholdEnabled && Number.isFinite(rawSensor) && Number.isFinite(threshold) && terpicu) {
        return 'threshold';
      }

      const schedules = Array.isArray(task.schedules) ? task.schedules : [];
      if (schedules.length) {
        const now = new Date(this.now);
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const activeSchedule = schedules.find(schedule => schedule.enabled && `${schedule.pickupTime || ''}`.trim() <= timeStr);
        if (activeSchedule) return 'schedule';
      }

      return 'manual';
    },
    // ── Ambang batas otomasi: rentang mengikuti satuan sensor terpilih ──
    // Sensor ketinggian air memakai cm dengan titik 0 = permukaan tanah (-15…+15).
    editingTaskSensor() {
      const key = `${this.editingTask?.sensorKey || ''}`;
      return (this.sensors || []).find(sensor => `${sensor.nodeId}:${sensor.childId}` === key) || null;
    },
    sensorIsWaterLevel(sensor) {
      return !!sensor && (this.isDistanceSensor(sensor) || this.isFuelHeightSensor(sensor));
    },
    get thresholdRange() {
      const sensor = this.editingTaskSensor();
      if (this.sensorIsWaterLevel(sensor)) {
        return {
          min: WATER_LEVEL_MIN_CM,
          max: WATER_LEVEL_MAX_CM,
          step: 0.5,
          unit: 'cm',
          minLabel: `${WATER_LEVEL_MIN_CM} cm`,
          maxLabel: `+${WATER_LEVEL_MAX_CM} cm`
        };
      }
      if (sensor && this.isMoistureSensor(sensor)) {
        return { min: 0, max: 100, step: 1, unit: '%', minLabel: '0 %', maxLabel: '100 %' };
      }
      const unit = `${this.getSensorUnit({ sensorNode: sensor?.nodeId, sensorChild: sensor?.childId }) || ''}`;
      const label = `${sensor?.label || ''}`.toLowerCase();
      const suhu = toNumber(sensor?.valueType, NaN) === 1 || unit === '°C' ||
                   label.includes('temp') || label.includes('lm35') || label.includes('suhu');
      if (suhu) {
        return { min: -10, max: 60, step: 0.5, unit: '°C', minLabel: '-10 °C', maxLabel: '60 °C' };
      }
      return {
        min: 0,
        max: 100,
        step: 1,
        unit,
        minLabel: unit ? `0 ${unit}` : '0',
        maxLabel: unit ? `100 ${unit}` : '100'
      };
    },
    defaultThresholdForSensorKey(key) {
      const sensor = (this.sensors || []).find(item => `${item.nodeId}:${item.childId}` === `${key}`);
      if (this.sensorIsWaterLevel(sensor)) return 0;
      return 50;
    },
    clampEditingThreshold() {
      if (!this.editingTask) return;
      const range = this.thresholdRange;
      const nilai = toNumber(this.editingTask.threshold, range.min);
      const nilaiTerbatas = Math.min(range.max, Math.max(range.min, nilai));
      this.editingTask.threshold = Math.round(nilaiTerbatas / range.step) * range.step;
    },
    onTaskSensorChange() {
      this.syncFixedTaskActuator();
      if (this.editingTask) {
        this.editingTask.threshold = this.defaultThresholdForSensorKey(this.editingTask.sensorKey);
      }
      this.clampEditingThreshold();
    },
    setThresholdDirection(above) {
      if (!this.editingTask) return;
      this.editingTask.thresholdAbove = !!above;
    },
    // Satu pilihan untuk status + arah otomasi ambang (radio bertiga):
    //   'off'   = otomasi ambang nonaktif
    //   'below' = ON saat nilai <= ambang
    //   'above' = ON saat nilai >= ambang
    get thresholdMode() {
      if (!this.editingTask?.thresholdEnabled) return 'off';
      return this.editingTask.thresholdAbove ? 'above' : 'below';
    },
    setThresholdMode(mode) {
      if (!this.editingTask) return;
      if (mode === 'off') {
        this.editingTask.thresholdEnabled = false;
        return;
      }
      this.editingTask.thresholdEnabled = true;
      this.editingTask.thresholdAbove = mode === 'above';
    },
    get thresholdAboveActive() {
      return !!this.editingTask?.thresholdAbove;
    },
    get thresholdDirectionHint() {
      if (!this.editingTask?.thresholdEnabled) {
        return 'Otomasi ambang tidak dipakai — aktuator hanya jalan dari tombol atau jadwal.';
      }
      const air = this.sensorIsWaterLevel(this.editingTaskSensor());
      if (air) {
        return this.thresholdAboveActive
          ? 'Aktuator menyala saat air berada di ATAS ambang (mis. pompa buang).'
          : 'Aktuator menyala saat air berada di BAWAH ambang (mis. pompa isi).';
      }
      return this.thresholdAboveActive
        ? 'Aktuator menyala saat nilai sensor di ATAS ambang.'
        : 'Aktuator menyala saat nilai sensor di BAWAH ambang.';
    },
    getTaskButtonClass(task) {
      if (!task || !this.isActuatorOnline(task)) return 'status-btn-offline';
      if (!task.actuatorActive) return 'status-btn-off';
      const source = this.getTaskTriggerSource(task);
      if (source === 'manual') return 'status-btn-on status-btn-on-manual';
      return 'status-btn-on status-btn-on-auto';
    },
    getTaskStatusLabel(task) { 
      if (!task) return 'Tidak diketahui';
      if (!this.isActuatorOnline(task)) return 'Offline'; 
      if (!task.actuatorActive) return 'OFF'; 
      const source = this.getTaskTriggerSource(task);
      if (source === 'manual') return 'ON(manual)';
      if (source === 'schedule') return 'ON(jadwal)';
      if (source === 'threshold') return 'ON(auto)';
      return 'ON'; 
    },
    getTaskStatusClass(task) {
      if (!task || !this.isActuatorOnline(task)) return 'status-offline';
      return task.actuatorActive ? 'status-on' : 'status-off';
    },
    prevTask() { this.currentTaskIndex--; }, nextTask() { this.currentTaskIndex++; },
    openTaskInfo(task) { 
      if (!task) return;
      this.selectedTaskInfo = task; 
      // Siapkan editingTask untuk tab Task
      this.editingTask = { ...task, sensorKey: `${task.sensorNode}:${task.sensorChild}`, durationMinutes: Math.round(task.activateDurationMs / 60000) };
      this.syncFixedTaskActuator();
      this.showAllTasksModal = true; 
    },

    openSettings() {
      this.showSettingsModal = true;
      this.syncLoRaChannelSetupFromNetwork();
      this.resetAuthPasswordForm();
      if (this.isLocalConnected) {
        this.settingsTab = 'maintenance';
        this.loadWifiScan();
        this.loadTouchSensitivity();
      } else if (this.settingsTab === 'maintenance') {
        this.settingsTab = 'settings';
      }
      this.scrollSettingsTabTop();
    },
    openSettingsTab(tab) {
      if (!tab) return;
      this.settingsTab = tab;
      this.$nextTick(() => this.scrollSettingsTabTop());
      if (tab === 'maintenance') {
        this.loadWifiScan();
        this.loadTouchSensitivity();
      }
    },
    resetAuthPasswordForm() {
      this.authPasswordForm.currentPassword = '';
      this.authPasswordForm.newPassword = '';
      this.authPasswordForm.confirmPassword = '';
      this.authPasswordForm.error = '';
      this.authPasswordForm.showCurrentPassword = false;
      this.authPasswordForm.showNewPassword = false;
    },
    async changeAdminPassword() {
      this.authPasswordForm.error = '';
      const username = this.loginUiId;
      const currentPassword = `${this.authPasswordForm.currentPassword || ''}`.trim();
      const newPassword = `${this.authPasswordForm.newPassword || ''}`.trim();
      const confirmPassword = `${this.authPasswordForm.confirmPassword || ''}`.trim();
      if (!this.canEditAdminPassword) {
        this.authPasswordForm.error = 'Hanya admin yang bisa mengubah password.';
        return;
      }
      if (!username) {
        this.authPasswordForm.error = 'UI ID belum tersedia.';
        return;
      }
      if (!currentPassword || !newPassword || !confirmPassword) {
        this.authPasswordForm.error = 'Lengkapi password lama dan password baru.';
        return;
      }
      if (newPassword !== confirmPassword) {
        this.authPasswordForm.error = 'Password baru dan konfirmasi tidak sama.';
        return;
      }
      if (newPassword.length < 6) {
        this.authPasswordForm.error = 'Password baru minimal 6 karakter.';
        return;
      }
      try {
        let result;
        if (this.mode === 'local') {
          result = await this.sendLocalAdminPasswordChange(username, currentPassword, newPassword);
        } else {
          result = await this.sendMqttAdminPasswordChange(username, currentPassword, newPassword);
        }
        if (!result?.ok) {
          throw new Error(result?.error || 'Gagal mengubah password admin.');
        }
        this.authPasswordForm.currentPassword = '';
        this.authPasswordForm.newPassword = '';
        this.authPasswordForm.confirmPassword = '';
        this.showToast(result?.message || 'Password admin berhasil diubah.');
      } catch (error) {
        this.authPasswordForm.error = `${error?.message || error || 'Gagal mengubah password admin.'}`;
        this.showToast(this.authPasswordForm.error, 'error');
      } finally {
        this.clearAuthPasswordPending();
      }
    },
    scrollSettingsTabTop() {
      this.$nextTick(() => {
        const panel = this.$refs?.nodesTabPanel;
        if (panel) {
          panel.scrollTop = 0;
        }
      });
    },
    openTaskForm(task = null) { 
      if (!task && !this.allowTaskCreate) {
        this.showToast(this.getTaskCreateLockedMessage(), 'error');
        return;
      }
      if (task) {
        this.editingTask = { ...task, sensorKey: `${task.sensorNode}:${task.sensorChild}`, durationMinutes: Math.round(task.activateDurationMs / 60000) };
      } else {
        const sensorKey = this.sensors.length > 0 ? `${this.sensors[0].nodeId}:${this.sensors[0].childId}` : '';
        this.editingTask = { 
          index: -1, 
          label: '', 
          sensorKey, 
          actuatorIndex: this.actuators.length > 0 ? this.actuators[0].index : 0, 
          threshold: this.defaultThresholdForSensorKey(sensorKey), 
          durationMinutes: 15, 
          thresholdEnabled: false,
          thresholdAbove: false,
          schedules: []
        };
      }
      this.syncFixedTaskActuator();
      this.clampEditingThreshold();
      this.showTaskModal = true; 
    },

    submitTask() {
      const index = Number(this.editingTask?.index ?? -1);
      if (!this.editingTask || !this.editingTask.sensorKey) {
        this.showToast('Data task tidak lengkap.', 'error');
        return;
      }
      if (index < 0 && !this.allowTaskCreate) {
        this.showToast(this.getTaskCreateLockedMessage(), 'error');
        return;
      }
      if (!this.beginAction()) return;
      const [node, child] = this.editingTask.sensorKey.split(':').map(Number);
      const fixedActuatorIndex = this.getFixedActuatorIndexForSensorKey(this.editingTask.sensorKey);
      const muatanTask = {
        label: this.getTaskLabel(this.editingTask),
        sensorNode: node || 0,
        sensorChild: child || 0,
        actuatorIndex: fixedActuatorIndex !== null ? fixedActuatorIndex : (this.editingTask.actuatorIndex || 0),
        threshold: this.editingTask.threshold || 0,
        activateDurationMs: (this.editingTask.durationMinutes || 0) * 60000,
        thresholdEnabled: !!this.editingTask.thresholdEnabled,
        thresholdAbove: !!this.editingTask.thresholdAbove,
        schedules: (this.editingTask.schedules || []).map((schedule, slotIndex) => ({
          pickupTime: schedule.pickupTime || schedule.time || '00:00',
          durationMinutes: toNumber(schedule.durationMinutes ?? schedule.duration, 0),
          enabled: schedule.enabled !== false,
          slotIndex,
          label: this.getTaskLabel(this.editingTask)
        }))
      };

      const perintah = index >= 0
        ? { cmd: 'updateTask', index, task: muatanTask }
        : { cmd: 'addTask', task: muatanTask };

      if (this.mode === 'local') {
        this.sendLocalCommand(perintah).then(res => { 
          if(res.ok) {
            this.refreshLocal();
            this.showTaskModal = false;
            this.showAllTasksModal = false;
            this.showToast('Task tersimpan.');
          } else {
            this.showToast(res.error || 'Gagal menyimpan task.', 'error');
          }
          this.endAction();
        }).catch(() => {
          this.showToast('Gagal menyimpan task.', 'error');
          this.endAction();
        });
      } else {
        this.publishCommand(perintah);
        // Tunggu balasan perangkat sebelum bilang "tersimpan": kalau kontroler
        // tidak merespons (mis. sedang offline), perubahan TIDAK diterapkan dan
        // pengguna harus tahu, bukan dapat notifikasi palsu.
        this.startTaskSaveWatch(perintah.task?.label || '');
        this.showTaskModal = false;
        this.showAllTasksModal = false;
        this.endAction();
      }
    },
    // ── Umpan balik penyimpanan task (mode online) ───────────────────────
    // Perangkat membalas respTask (sukses) atau respError (gagal). Bila tidak ada
    // balasan dalam batas waktu, beri tahu bahwa perubahan BELUM tentu tersimpan.
    startTaskSaveWatch(label) {
      this.finishTaskSave();
      this.pendingTaskSave = { label, timer: setTimeout(() => {
        if (!this.pendingTaskSave) return;
        this.pendingTaskSave = null;
        this.showToast('Kontroler tidak merespons — perubahan task belum tentu tersimpan.', 'warn');
      }, 6000) };
    },
    finishTaskSave(sukses = null, pesan = '') {
      const pending = this.pendingTaskSave;
      if (pending?.timer) clearTimeout(pending.timer);
      this.pendingTaskSave = null;
      if (sukses === true) this.showToast('Task tersimpan di kontroler.');
      else if (sukses === false) this.showToast(pesan || 'Kontroler menolak perubahan task.', 'error');
    },
    openScheduleList(taskIndex) { this.scheduleListTaskIndex = taskIndex; this.showScheduleListModal = true; },
    getTaskByIndex(idx) { 
      if (idx === undefined || idx === null) return null;
      return this.tasks.find(t => t.index === idx); 
    },
    getTaskSchedules(idx) { 
      if (idx === undefined || idx === null) return [];
      // Prioritaskan editingTask jika indeks cocok (jadwal yg baru ditambah/diedit lokal)
      if (this.editingTask && this.editingTask.index === idx) {
        return (this.editingTask.schedules || []).map(s => ({ ...s, taskIndex: idx }));
      }
      const t = this.getTaskByIndex(idx); 
      return (t && t.schedules) ? t.schedules.map(s => ({ ...s, taskIndex: idx })) : []; 
    },
    openScheduleForm(entry = null) {
      if (entry) {
        this.editingSchedule = { ...entry };
        const parts = (this.editingSchedule.pickupTime || '08:00').split(':');
        this.editingSchedule.pickupHour = parts[0] || '08';
        this.editingSchedule.pickupMinute = parts[1] || '00';
      } else {
        this.editingSchedule = { taskIndex: this.scheduleListTaskIndex, slotIndex: -1, pickupTime: '08:00', pickupHour: '08', pickupMinute: '00', durationMinutes: 15, enabled: true };
      }
      this.showScheduleModal = true;
    },
    submitSchedule() {
      if (!this.editingSchedule) return;
      if (!this.editingTask) {
        this.showToast('Task tidak ditemukan.', 'error');
        return;
      }
      
      let schedules = [...(this.editingTask.schedules || [])];
      const jam = (this.editingSchedule.pickupHour || '08').padStart(2, '0');
      const menit = (this.editingSchedule.pickupMinute || '00').padStart(2, '0');
      const jadwalBaru = { 
        pickupTime: `${jam}:${menit}`, 
        durationMinutes: this.editingSchedule.durationMinutes, 
        enabled: this.editingSchedule.enabled 
      };

      if (this.editingSchedule.slotIndex >= 0) {
        schedules[this.editingSchedule.slotIndex] = jadwalBaru;
      } else {
        schedules.push(jadwalBaru);
      }

      this.editingTask.schedules = schedules;
      this.showScheduleModal = false;
      this.showToast('Jadwal tersimpan.');
    },
    deleteSchedule(taskIndex, slotIndex, tombol) {
      if (!confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) return;
      if (!this.editingTask || !this.editingTask.schedules) return;
      
      this.editingTask.schedules = this.editingTask.schedules.filter((_, i) => i !== slotIndex);
      this.showToast('Jadwal akan dihapus saat task disimpan.');
    },
    openLogModal() { 
      try {
      this.showLogModal = true; 
      this.logChartSelectedIndex = null;
      this.logPage = 0;
      this.logLoading = true;
      this.ensureDefaultLogDownloadRange();
      // Fetch more logs (200) so all sensors have data
      if (this.mode === 'mqtt') this.publishCommand('getLogs', [0, 200]);
      else this.loadLocalLogs();
      } catch(e) { console.warn('openLogModal error:', e); this.logLoading = false; }
    },
    ensureDefaultLogDownloadRange() {
      if (!this.logDownload?.start) {
        this.logDownload.start = formatLocalDateTimeInput(Date.now() - (24 * 60 * 60 * 1000));
      }
      if (!this.logDownload?.end) {
        this.logDownload.end = formatLocalDateTimeInput(Date.now());
      }
    },
    setLogDownloadPreset(days) {
      const value = Number(days);
      if (!Number.isFinite(value) || value <= 0) return;
      this.logDownload.start = formatLocalDateTimeInput(Date.now() - (value * 24 * 60 * 60 * 1000));
      this.logDownload.end = formatLocalDateTimeInput(Date.now());
      this.logDownload.error = '';
    },
    async requestMqttLogsPage(page, limit, timeoutMs = 20000) {
      if (!this.mqttClient?.connected) {
        throw new Error('Koneksi online belum tersambung.');
      }
      return new Promise((resolve, reject) => {
        const requestKey = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const timer = setTimeout(() => {
          if (this.pendingLogDownloads?.[requestKey]) {
            delete this.pendingLogDownloads[requestKey];
          }
          reject(new Error('Waktu tunggu respons log habis.'));
        }, timeoutMs);
        if (!this.pendingLogDownloads) this.pendingLogDownloads = {};
        this.pendingLogDownloads[requestKey] = {
          page,
          limit,
          resolve: payload => {
            clearTimeout(timer);
            delete this.pendingLogDownloads[requestKey];
            resolve(payload);
          },
          reject: error => {
            clearTimeout(timer);
            delete this.pendingLogDownloads[requestKey];
            reject(error);
          }
        };
        this.publishCommand('getLogs', [page, limit]);
      });
    },
    async requestLocalLogsPage(page, limit) {
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
      });
      const url = `${base}/api/getLogs?${params.toString()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Gagal membaca log lokal (${res.status}).`);
      }
      return await res.text();
    },
    // Ambil data sensor ringan dari API baru (hanya utk chart, lebih cepat)
    async fetchSensorData(nodeId, childId, limit = 24) {
      if (this.mode === 'local') {
        const data = await this.localFetch(`/api/getSensorData?node=${nodeId}&child=${childId}&limit=${limit}`, { timeoutMs: 5000 });
        if (data && Array.isArray(data.points)) return data.points;
      }
      // Fallback: ekstrak dari this.logs yang sudah ada
      return this.sensorLogEntries
        .map(entry => {
          const snapshot = this.getLogSensorSnapshot(entry);
          const srcNode = toNumber(snapshot?.node ?? snapshot?.sourceNode, -1);
          const srcChild = toNumber(snapshot?.child ?? snapshot?.sourceChild, -1);
          if (srcNode !== nodeId || srcChild !== childId) return null;
          const value = toNumber(snapshot?.value ?? snapshot?.sourceValue, null);
          const ts = toNumber(entry?.ts ?? entry?.timestamp, 0);
          if (!Number.isFinite(value) || !ts) return null;
          return { ts, value };
        })
        .filter(Boolean)
        .sort((a, b) => a.ts - b.ts)
        .slice(-limit);
    },
    async downloadSensorLogsCsv() {
      const startTs = parseLocalDateTimeInput(this.logDownload?.start);
      const endTs = parseLocalDateTimeInput(this.logDownload?.end);
      if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
        this.logDownload.error = 'Pilih rentang waktu yang valid.';
        this.showToast('Pilih rentang waktu yang valid.', 'error');
        return;
      }
      const fromTs = Math.min(startTs, endTs);
      const toTs = Math.max(startTs, endTs);
      this.logDownload.error = '';
      this.logDownload.busy = true;
      this.logDownload.progress = 0;
      this.logDownload.status = 'Menyiapkan unduhan...';
      this.logDownload.totalPages = 0;
      this.logDownload.processedPages = 0;
      this.logDownload.totalLogs = 0;
      this.logDownload.mode = this.mode;
      try {
        if (this.mode !== 'local' && (this.mode !== 'mqtt' || !this.mqttClient?.connected)) {
          throw new Error('Unduhan CSV hanya tersedia saat koneksi lokal atau online aktif.');
        }
        const limit = 50;
        const requestPage = this.mode === 'local'
          ? (page, perPage) => this.requestLocalLogsPage(page, perPage)
          : (page, perPage) => this.requestMqttLogsPage(page, perPage);
        const firstResponse = await requestPage(0, limit);
        const firstData = parsePayloadKontrol(firstResponse);
        const totalLogs = toNumber(firstData?.count, 0);
        const totalPages = Math.max(1, Math.ceil(Math.max(0, totalLogs) / limit));
        this.logDownload.totalLogs = totalLogs;
        this.logDownload.totalPages = totalPages;
        this.logDownload.status = `Membaca log halaman 1 dari ${totalPages}...`;
        const collected = [];
        const collectPage = payload => {
          const data = parsePayloadKontrol(payload);
          const items = Array.isArray(data?.logs) ? data.logs : [];
          items.forEach(entry => {
            const ts = Number(entry?.ts ?? entry?.timestamp ?? 0);
            if (!Number.isFinite(ts) || ts < fromTs || ts > toTs) return;
            const type = Number(entry?.type ?? 0);
            if (type !== 0) return;
            collected.push({
              ts,
              data: entry?.data || entry?.payload || ''
            });
          });
        };
        collectPage(firstResponse);
        this.logDownload.processedPages = 1;
        this.logDownload.progress = Math.min(100, (1 / totalPages) * 100);
        for (let page = 1; page < totalPages; page += 1) {
          this.logDownload.status = `Membaca log halaman ${page + 1} dari ${totalPages}...`;
          const response = await requestPage(page, limit);
          collectPage(response);
          this.logDownload.processedPages = page + 1;
          this.logDownload.progress = Math.min(100, ((page + 1) / totalPages) * 100);
        }
        collected.sort((a, b) => a.ts - b.ts);
        const rows = [
          'timestamp,sensor,node,child,value,raw,unit'
        ];
        for (const entry of collected) {
          const row = this.formatSensorLogCsvRow(entry);
          if (row) rows.push(row);
        }
        const csv = rows.join('\n') + '\n';
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sensor_logs_${fromTs}_${toTs}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        this.showToast(`CSV sensor siap: ${collected.length} log.`);
      } catch (error) {
        this.logDownload.error = error?.message || 'Gagal mengunduh CSV sensor.';
        this.showToast(this.logDownload.error, 'error');
      } finally {
        this.logDownload.busy = false;
        this.logDownload.status = '';
        this.logDownload.progress = 0;
      }
    },
    formatSensorLogCsvRow(entry) {
      const ts = Number(entry?.ts ?? entry?.timestamp ?? 0);
      if (!Number.isFinite(ts) || !ts) return '';
      const raw = `${entry?.data ?? ''}`;
      let parsed = null;
      try {
        parsed = raw && raw.trim().startsWith('{') ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      const toCsv = value => {
        const text = `${value ?? ''}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const timestampIso = formatCsvDateTime(ts);
      const label  = parsed?.label  ?? '';
      const node   = parsed?.node   ?? '';
      const child  = parsed?.child  ?? '';
      const value  = Number.isFinite(Number(parsed?.value))  ? roundToOneDecimal(parsed.value)  : '';
      const rawVal = Number.isFinite(Number(parsed?.raw))    ? Math.round(parsed.raw)           : '';
      const unit   = parsed?.unit   ?? '';
      if (value === '' && rawVal === '') return '';
      return [
        toCsv(timestampIso),
        toCsv(label),
        toCsv(node),
        toCsv(child),
        toCsv(value === '' ? '' : String(value)),
        toCsv(rawVal === '' ? '' : String(rawVal)),
        toCsv(unit)
      ].join(',');
    },
    async loadLocalLogs() {
      this.logLoading = true;
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      try {
        const data = await ambilJsonDenganBatasWaktu(`${base}/api/getLogs`, {}, 2500);
        this.applyLogPayload(data);
      } catch (e) {
        this.logLoading = false;
        this.endAction();
      }
    },
    applyLogPayload(muatan) {
      this.logLoading = false;
      this.endAction();
      let payloadLoaded = false;
      if (!muatan) {
        this.logs = [];
        this.logCount = 0;
        this.logStorage = '0 B';
        payloadLoaded = true;
      } else {
        try {
          const data = parsePayloadKontrol(muatan);
          if (data && typeof data === 'object' && !Array.isArray(data) && (Array.isArray(data.logs) || data.count !== undefined || data.storage !== undefined)) {
            const incomingLogs = Array.isArray(data.logs) ? data.logs : [];
            // Batasi jumlah log agar UI tidak berat
            const uiLogLimit = 300;
            this.logs = incomingLogs.length > uiLogLimit ? incomingLogs.slice(-uiLogLimit) : incomingLogs;
            this.logCount = data.count || incomingLogs.length || this.logs.length;
            this.logStorage = formatUkuranBerkas(data.storage || 0);
            payloadLoaded = true;
          } else {
            const teks = typeof muatan === 'string' ? muatan : JSON.stringify(muatan);
            this.logs = [];
            this.logCount = 0;
            this.logStorage = formatUkuranBerkas(teks.length);
            payloadLoaded = true;
          }
        } catch (e) {
          const teks = typeof muatan === 'string' ? muatan : '';
          this.logs = teks.split('\n').filter(Boolean).map(line => {
            const p = line.split(',');
            return { type: toNumber(p[0]), ts: toNumber(p[1]), data: p.slice(2).join(', ') };
          }).reverse();
          this.logCount = this.logs.length;
          this.logStorage = formatUkuranBerkas(teks.length);
          payloadLoaded = true;
        }
      }
      if (payloadLoaded) {
        // Tandai chart perlu di-recompute
        this.markChartDirty();
        if (!this.logChartMetrics.some(metric => metric.key === this.logChartMetric)) {
          this.logChartMetric = this.logChartMetrics[0]?.key || 'temperature';
        }
        this.logPage = 0;
        // Redraw chart canvas setelah data baru
        setTimeout(() => {
          try {
            const metric = this.selectedLogChartMetric;
            if (metric) {
              const canvas = document.getElementById('chart-' + metric.key);
              if (canvas && canvas.parentElement) this.drawChart(metric.key, canvas.parentElement);
            }
          } catch(e) { console.warn('Chart draw error:', e); }
        }, 50);
      }
      if (this.logChartSelectedIndex !== null && this.logChartSelectedIndex >= this.logChartSeries.points.length) {
        this.logChartSelectedIndex = null;
      }
    },
    setLogPage(page) {
      const totalPages = this.logTotalPages;
      const next = Math.min(Math.max(0, Number(page) || 0), Math.max(0, totalPages - 1));
      this.logPage = next;
    },
    prevLogPage() {
      this.setLogPage(this.logPage - 1);
    },
    nextLogPage() {
      this.setLogPage(this.logPage + 1);
    },
    setLogChartMetric(metric) {
      if (!metric) return;
      this.logChartMetric = metric;
      this.logChartSelectedIndex = null;
      this.logChartActivePoint = null;
      // Lazy load: fetch data spesifik untuk sensor yang dipilih
      const parts = metric.split(':');
      if (parts.length === 2) {
        const nodeId = parseInt(parts[0]);
        const childId = parseInt(parts[1]);
        if (Number.isFinite(nodeId) && Number.isFinite(childId)) {
          // Mark chart dirty so it recomputes
          this.markChartDirty();
          // Fetch data dan simpan di cache
          this.fetchSensorData(nodeId, childId, 24).then(points => {
            if (Array.isArray(points) && points.length) {
              this._chartPointsCache[metric] = points;
            }
            // Redraw canvas untuk metric baru
            setTimeout(() => {
              try {
                const canvas = document.getElementById('chart-' + metric);
                if (canvas) this.drawChart(metric, canvas.parentElement);
              } catch(e) { console.warn('Chart draw error:', e); }
            }, 50);
          });
        }
      } else {
        // Fallback: redraw tanpa lazy load
        this.markChartDirty();
        setTimeout(() => {
          try {
            const canvas = document.getElementById('chart-' + metric);
            if (canvas) this.drawChart(metric, canvas.parentElement);
          } catch(e) { console.warn('Chart draw error:', e); }
        }, 50);
      }
    },
    toggleLogChartSeries(metric) {
      if (!metric) return;
      if (this.logChartHiddenSeries.includes(metric)) {
        this.logChartHiddenSeries = this.logChartHiddenSeries.filter(item => item !== metric);
      } else {
        this.logChartHiddenSeries = [...this.logChartHiddenSeries, metric];
      }
    },
    markChartDirty() {
      this._cachedChartSeriesVersion += 1;
      this._cachedChartSeriesList = null;
    },
    selectLogChartPoint(series, point) {
      if (!series || !point) return;
      this.logChartActivePoint = {
        key: series.key,
        label: series.label,
        unit: series.unit,
        ts: point.ts,
        value: point.value,
        x: point.x,
        y: point.y,
        canvasX: undefined,
        canvasY: undefined
      };
    },
    updateLogChartHover(metricKey, event) {
      const series = this.getLogChartSeries(metricKey);
      if (!series || !series.points || !series.points.length || !event?.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const cursorX = ((event.clientX - rect.left) / rect.width) * 100;
      const cursorY = ((event.clientY - rect.top) / rect.height) * 100;
      let nearest = series.points[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const point of series.points) {
        const dx = point.x - cursorX;
        const dy = point.y - cursorY;
        const distance = (dx * dx) + (dy * dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          nearest = point;
        }
      }
      if (nearest) {
        this.selectLogChartPoint(series, nearest);
      }
    },
    clearLogChartPoint() {
      this.logChartActivePoint = null;
    },
    debounceDrawChart(metricKey) {
      if (this._chartDebounce) clearTimeout(this._chartDebounce);
      this._chartDebounce = setTimeout(() => {
        try { this.drawChart(metricKey); } catch(e) { console.warn('Chart draw error:', e); }
      }, 150);
    },
    drawChart(metricKey, surfaceEl) {
      try {
      const canvas = document.getElementById('chart-' + metricKey);
      if (!canvas) return;
      // Get dimensions: prefer clientWidth, fallback to computed style
      let w = canvas.clientWidth;
      let h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        const rect = canvas.getBoundingClientRect();
        w = rect.width;
        h = rect.height;
      }
      if (w < 10 || h < 10) {
        const cs = getComputedStyle(canvas);
        w = parseFloat(cs.width) || 300;
        h = parseFloat(cs.height) || 180;
      }
      if (w < 10 || h < 10) {
        // Canvas masih hidden, coba lagi nanti
        if (!canvas._chartRetry) {
          canvas._chartRetry = setTimeout(() => {
            canvas._chartRetry = null;
            try { this.drawChart(metricKey, surfaceEl); } catch(e) {}
          }, 200);
        }
        return;
      }
      // Try cached points first (faster, from lazy-load)
      let points = this._chartPointsCache?.[metricKey];
      if (!points || !points.length) {
        // Fallback to chart series (from this.logs)
        const series = this.getLogChartSeries(metricKey);
        if (series && series.points && series.points.length) {
          points = series.points;
        }
      }
      if (!points || !points.length) return;
      // Set canvas pixel dimensions (use devicePixelRatio for HiDPI)
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      // Margins (compact)
      const ml = 36, mr = 6, mt = 10, mb = 14;
      const plotW = Math.max(10, w - ml - mr);
      const plotH = Math.max(10, h - mt - mb);
      // Determine value range from points
      const vals = points.map(p => p.value);
      const valMin = Math.min(...vals);
      const valMax = Math.max(...vals);
      const valRange = Math.max(0.1, valMax - valMin);
      const tsMin = points[0].ts;
      const tsMax = points[points.length - 1].ts;
      const tsRange = Math.max(1, tsMax - tsMin);
      // Grid lines (horizontal)
      ctx.strokeStyle = 'rgba(107, 114, 128, 0.2)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const y = mt + (plotH * i / 4);
        ctx.beginPath();
        ctx.moveTo(ml, y);
        ctx.lineTo(ml + plotW, y);
        ctx.stroke();
      }
      // Y-axis labels (compact, drawn right-aligned inside plot area)
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const frac = i / 4;
        const val = valMax - (frac * valRange);
        const label = val.toFixed(1);
        const y = mt + (plotH * frac);
        const tw = ctx.measureText(label).width + 4;
        ctx.fillStyle = 'rgba(13, 13, 18, 0.6)';
        ctx.fillRect(ml - tw - 2, y - 6, tw + 4, 12);
        ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
        ctx.fillText(label, ml - 3, y);
      }
      // X-axis labels (time)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
      ctx.font = '8px sans-serif';
      const tsMid = tsMin + tsRange * 0.5;
      const xAxisLabels = [
        { ts: tsMin, label: this.formatLogTimestamp(tsMin * 1000).slice(-5) },
        { ts: tsMid, label: '' },
        { ts: tsMax, label: this.formatLogTimestamp(tsMax * 1000).slice(-5) }
      ];
      for (const tl of xAxisLabels) {
        if (!tl.label) continue;
        const x = ml + ((tl.ts - tsMin) / tsRange) * plotW;
        ctx.fillText(tl.label, x, mt + plotH + 1);
      }
      // Data line
      const color = series.color || '#25f4b8';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = ml + ((p.ts - tsMin) / tsRange) * plotW;
        const y = mt + plotH - ((p.value - valMin) / valRange) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Latest point marker
      const last = points[points.length - 1];
      if (last) {
        const lx = ml + ((last.ts - tsMin) / tsRange) * plotW;
        const ly = mt + plotH - ((last.value - valMin) / valRange) * plotH;
        ctx.beginPath();
        ctx.arc(lx, ly, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Hover point highlight
      if (this.logChartActivePoint && this.logChartActivePoint.key === metricKey) {
        const hp = this.logChartActivePoint;
        const hx = ml + ((hp.ts - tsMin) / tsRange) * plotW;
        const hy = mt + plotH - ((hp.value - valMin) / valRange) * plotH;
        ctx.beginPath();
        ctx.arc(hx, hy, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Tooltip position (store for HTML overlay)
        if (surfaceEl) {
          const surfRect = surfaceEl.getBoundingClientRect();
          this.logChartActivePoint.canvasX = hx;
          this.logChartActivePoint.canvasY = hy;
        }
      }
      } catch(e) { console.warn('Chart drawChart error:', e); }
    },
    getLogSensorSnapshot(entry) {
      if (!entry) return {};
      const raw = typeof entry.data !== 'undefined' ? entry.data : entry;
      const parsed = parsePayloadKontrol(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    },
    getLogMetricLabel(key) {
      const labels = {
        temperature: 'Suhu Udara',
        humidity: 'Kelembapan Udara',
        soil: 'Kelembapan Tanah',
        moisture: 'Kelembapan Tanah',
        temp: 'Suhu Udara',
        hum: 'Kelembapan Udara'
      };
      return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    },
    getLogMetricUnit(key) {
      const normalized = `${key || ''}`.toLowerCase();
      if (normalized.includes('temp')) return '°C';
      if (normalized.includes('hum')) return '%';
      if (normalized.includes('soil') || normalized.includes('moist')) return '%';
      return '';
    },
    getLogMetricValue(entry, key) {
      if (!entry || !key) return null;
      const metric = typeof key === 'object' ? key : { key };
      const metricKey = `${metric.key || ''}`.trim();
      const metricLabel = `${metric.label || ''}`.trim();
      const metricSensorNode = Number(metric.sensorNode);
      const metricSensorChild = Number(metric.sensorChild);
      const snapshot = this.getLogSensorSnapshot(entry);
      const allSources = [entry, snapshot];
      const normalize = value => `${value || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const keyCandidates = new Set([metricKey, metricLabel, this.getLogMetricLabel(metricKey)]);
      if (metricKey.includes(':')) {
        keyCandidates.add(metricKey.replace(':', '_'));
      }
      const valueFields = ['value', 'val', 'reading', 'rawValue', 'sourceValue'];
      for (const source of allSources) {
        if (!source || typeof source !== 'object') continue;
        if (metricKey && typeof source[metricKey] !== 'undefined') {
          const direct = Number(source[metricKey]);
          if (Number.isFinite(direct)) return direct;
        }
        for (const candidate of keyCandidates) {
          if (!candidate) continue;
          for (const [sourceKey, sourceValue] of Object.entries(source)) {
            if (normalize(sourceKey) === normalize(candidate)) {
              const direct = Number(sourceValue);
              if (Number.isFinite(direct)) return direct;
            }
          }
        }
      }
      const sensorIdPairs = [
        ['nodeId', 'childId'],
        ['node', 'child'],
        ['nid', 'cid'],
        ['n', 'c'],
        ['sourceNode', 'sourceChild']
      ];
      for (const source of allSources) {
        if (!source || typeof source !== 'object') continue;
        for (const [nodeKey, childKey] of sensorIdPairs) {
          const nodeValue = Number(source[nodeKey]);
          const childValue = Number(source[childKey]);
          if (Number.isFinite(metricSensorNode) && Number.isFinite(metricSensorChild) && nodeValue === metricSensorNode && childValue === metricSensorChild) {
            for (const valueField of valueFields) {
              const candidateValue = Number(source[valueField]);
              if (Number.isFinite(candidateValue)) return candidateValue;
            }
            for (const [sourceKey, sourceValue] of Object.entries(source)) {
              if (['type', 'ts', 'timestamp', 'data', 'user', 'label', nodeKey, childKey, 'raw', 'valueType', 'unit'].includes(sourceKey)) continue;
              const numeric = Number(sourceValue);
              if (Number.isFinite(numeric)) return numeric;
            }
          }
        }
      }
      for (const source of allSources) {
        if (!source || typeof source !== 'object') continue;
        if (typeof source.value !== 'undefined') {
          const direct = Number(source.value);
          if (Number.isFinite(direct)) return direct;
        }
      }
      const aliases = {
        temperature: ['temperature', 'temp'],
        humidity: ['humidity', 'hum'],
        soil: ['soil', 'moisture', 'value']
      };
      const list = aliases[metricKey] || [metricKey];
      for (const alias of list) {
        if (typeof snapshot[alias] !== 'undefined') {
          const parsed = Number(snapshot[alias]);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      const normalizedMetric = `${metricLabel || metricKey || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
      const snapshotValueByHint = (hints, keys) => {
        if (!hints.some(hint => normalizedMetric.includes(hint))) return null;
        for (const snapshotKey of keys) {
          if (typeof snapshot[snapshotKey] === 'undefined') continue;
          const parsed = Number(snapshot[snapshotKey]);
          if (Number.isFinite(parsed)) return parsed;
        }
        return null;
      };
      const hintedTemperature = snapshotValueByHint(['temp', 'suhu', 'temperature'], ['temperature', 'temp']);
      if (hintedTemperature !== null) return hintedTemperature;
      const hintedHumidity = snapshotValueByHint(['hum', 'humid', 'kelembap', 'humidity'], ['humidity', 'hum']);
      if (hintedHumidity !== null) return hintedHumidity;
      const hintedSoil = snapshotValueByHint(['soil', 'moist', 'tanah', 'moisture'], ['soil', 'moisture', 'value']);
      if (hintedSoil !== null) return hintedSoil;
      if (metricLabel) {
        const normalizedLabel = normalize(metricLabel);
        for (const [snapshotKey, snapshotValue] of Object.entries(snapshot)) {
          if (normalize(snapshotKey) === normalizedLabel) {
            const parsed = Number(snapshotValue);
            if (Number.isFinite(parsed)) return parsed;
          }
        }
      }
      return null;
    },
    getLogTypeName(type) {
      const map = { 0: '🌡️ Sensor', 1: '🔌 Kontrol', 2: '⏰ Jadwal', 3: 'ℹ️ Status' };
      return map[type] || '📝 Log';
    },
    formatLogTimestamp(ts) { 
      if (!ts) return '-';
      // Jika ts masih dalam detik (Unix), ubah ke milidetik
      const date = new Date(ts > 10000000000 ? ts : ts * 1000);
      return date.toLocaleString('id-ID'); 
    },
    formatLogData(entry) { 
      let dataMentah = entry.data;
      if (!dataMentah) return '-';
      
      // Normalisasi data mentah jika berupa array
      if (Array.isArray(dataMentah)) dataMentah = dataMentah.join(',');

      let obj = null;
      if (typeof dataMentah === 'object' && dataMentah !== null) {
        obj = dataMentah;
      } else if (typeof dataMentah === 'string' && dataMentah.trim().startsWith('{')) {
        try { obj = JSON.parse(dataMentah); } catch (e) {}
      }

      const type = Number(entry.type);

      // Jika berupa objek, ambil field sesuai tipe
      if (obj) {
        if (type === 0) { // Sensor
          const temp = obj.temperature ?? obj.temp;
          const hum = obj.humidity ?? obj.hum;
          const soil = obj.soil ?? obj.moisture ?? obj.value;
          if (temp !== undefined || hum !== undefined || soil !== undefined) {
            const parts = [];
            if (temp !== undefined) parts.push(`T ${formatNilaiSensor(temp, 'C')}`);
            if (hum !== undefined) parts.push(`H ${formatNilaiSensor(hum, '%')}`);
            if (soil !== undefined) parts.push(`Soil ${formatNilaiSensor(soil, '%')}`);
            return parts.join(' | ');
          }
          const nid = obj.nid ?? obj.nodeId ?? obj.n;
          const cid = obj.cid ?? obj.childId ?? obj.c;
          const val = obj.val ?? obj.value ?? obj.v;
          if (nid !== undefined && cid !== undefined) {
            const sensor = this.sensors.find(s => s.nodeId === toNumber(nid) && s.childId === toNumber(cid));
            const label = sensor?.label || this.getUiLabel('sensor');
            const unit = this.getSensorUnit({ sensorNode: toNumber(nid), sensorChild: toNumber(cid) });
            return `${label}(${nid}_${cid}) ${formatNilaiSensor(val, unit)}`.trim();
          }
        } else if (type === 1) { // Aktuator
          const idx = obj.idx ?? obj.index ?? obj.i;
          const stateVal = obj.state ?? obj.active ?? obj.s;
          const state = (String(stateVal).toLowerCase() === 'on' || stateVal === '1' || stateVal === 1 || stateVal === true) ? 'Aktif' : 'Nonaktif';
          const dur = obj.dur ?? obj.duration ?? obj.d;
          const actuator = this.actuators.find(a => a.index === toNumber(idx));
          const label = actuator?.label || `${this.getUiLabel('actuator')} ${idx}`;
          const relay = actuator ? `${actuator.nodeId}_${actuator.childId}` : idx;
          let durationStr = (dur && state === 'Aktif') ? ` ${dur} Menit` : '';
          return `${label}(${relay}) ${state}${durationStr}`.trim();
        } else if (type === 3) { // Status
          if (obj.msg || obj.event) return (obj.msg || obj.event).replace(/_/g, ' ').toUpperCase();
        }
        // Cadangan untuk data objek lain
        return Object.entries(obj).map(([k, v]) => `${k} ➔ ${v}`).join(' | ');
      }

      // Cadangan ke parsing CSV/String jika bukan objek
      // Tangani koma dan titik dua sebagai pemisah
      const parts = String(dataMentah).split(/[,,:]/).map(p => p.trim()).filter(Boolean);
      
      if (type === 0 && parts.length >= 3) {
        const nid = toNumber(parts[0]);
        const cid = toNumber(parts[1]);
        const val = parts[2];
        const sensor = this.sensors.find(s => s.nodeId === nid && s.childId === cid);
        const label = sensor?.label || this.getUiLabel('sensor');
        const unit = this.getSensorUnit({ sensorNode: nid, sensorChild: cid });
        return `${label}(${nid}_${cid}) ${val} ${unit}`.trim();
      }
      
      if (type === 1 && parts.length >= 2) {
        const idx = toNumber(parts[0]);
        const state = (parts[1].toLowerCase() === 'on' || parts[1] === '1') ? 'Aktif' : 'Nonaktif';
        const dur = parts[2];
        const actuator = this.actuators.find(a => a.index === idx);
        const label = actuator?.label || `${this.getUiLabel('actuator')} ${idx}`;
        const relay = actuator ? `${actuator.nodeId}_${actuator.childId}` : idx;
        let durationStr = (dur && state === 'Aktif') ? ` ${dur} Menit` : '';
        return `${label}(${relay}) ${state}${durationStr}`.trim();
      }
      
      if (type === 3) {
        if (parts.length >= 2) return parts[1].replace(/_/g, ' ').toUpperCase();
        return String(dataMentah).replace(/_/g, ' ').toUpperCase();
      }

      return String(dataMentah).replace(/_/g, ' ').replace(/:/g, ' ➔ ').replace(/,/g, ' | ').trim();
    },
    clearLogs() {
      if (!confirm('Apakah Anda yakin ingin menghapus semua log di kontroler?')) return;
      if (!this.beginAction()) return;
      if (this.mode === 'local') {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        fetch(`${base}/api/clearLogs`, { method: 'POST' }).then(() => {
          this.loadLocalLogs();
          this.endAction();
        }).catch(() => this.endAction());
      } else {
        this.publishCommand('clearLogs');
      }
      this.logs = [];
      this.logCount = 0;
      this.logStorage = '0 B';
    },
    saveAndReconnect() {
      this.saveConfig();
      this.showSettingsModal = false;
      this.startPreferredConnection();
    },
    setTime() {
      if (!this.timeForm.date || !this.timeForm.time) {
        this.showToast('Pilih tanggal dan waktu.', 'error');
        return;
      }
      const ts = Math.floor(new Date(`${this.timeForm.date}T${this.timeForm.time}`).getTime() / 1000);
      if (this.mode === 'local') {
        this.sendLocalCommand('setTime', [ts]).then(res => { if(res.ok) this.showToast('Waktu berhasil diatur.'); });
      } else {
        this.publishCommand('setTime', [ts]);
      }
    },
    setupGreenhouseWifi() {
      if (this.isLocalConnected) {
        return this.submitLocalWifiCredentials();
      }
      if (!this.wifiSetup.ssid) {
        this.showToast('Lengkapi SSID WiFi.', 'error');
        return;
      }
      this.publishCommand('setupWifi', [this.wifiSetup.ssid, this.wifiSetup.pass]);
      this.showToast(this.wifiSetup.pass ? 'Setelan WiFi dikirim.' : 'Setelan WiFi tanpa sandi dikirim.');
    },
    handleFirmwareFileChange(event) {
      const berkas = event.target.files && event.target.files[0] ? event.target.files[0] : null;
      this.wifiSetup.file = berkas;
      this.wifiSetup.firmwareName = berkas ? berkas.name : '';
    },
    async loadWifiScan() {
      if (!this.isLocalConnected) {
        this.wifiScanResults = [];
        this.wifiScanError = 'Pindai WiFi hanya tersedia saat terhubung ke kontroler lokal.';
        return;
      }
      this.wifiScanLoading = true;
      this.wifiScanError = '';
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      this.localPollingPaused = true;
      try {
        const data = await ambilJsonDenganBatasWaktu(`${base}/api/wifiScan`, [], 15000);
        const list = Array.isArray(data) ? data : [];
        this.wifiScanResults = list
          .filter(item => item && item.ssid)
          .map(item => ({
            ssid: item.ssid,
            bssid: item.bssid || '',
            rssi: toNumber(item.rssi, -100),
            auth: item.auth || 'Tidak diketahui'
          }))
          .sort((a, b) => b.rssi - a.rssi);
        this.wifiScanAt = new Date();
        if (!this.wifiScanResults.length) {
        this.wifiScanError = 'Tidak ada jaringan terdeteksi. Coba pindai ulang.';
        }
      } catch (error) {
        this.wifiScanError = error?.message || 'Gagal memindai WiFi.';
        this.wifiScanResults = [];
      } finally {
        this.wifiScanLoading = false;
        setTimeout(() => {
          this.localPollingPaused = false;
          if (this.isLocalConnected) {
            this.refreshLocal();
          }
        }, 500);
      }
    },
    pickWifiNetwork(network) {
      const ssid = typeof network === 'string' ? network : network?.ssid || '';
      const isOpen = `${network?.auth || ''}`.toLowerCase() === 'open';
      this.wifiSetup.ssid = ssid;
      this.wifiSetup.auth = isOpen ? 'open' : 'secured';
      if (isOpen) {
        this.wifiSetup.pass = '';
      }
      this.$nextTick(() => {
        this.$refs.wifiPasswordInput?.focus?.();
      });
      this.showToast(isOpen ? `SSID tanpa sandi dipilih: ${ssid}` : `SSID dipilih: ${ssid}`);
    },
    clearWifiNetworkAuth() {
      this.wifiSetup.auth = '';
    },
    applyOpenWifiMode() {
      this.wifiSetup.auth = 'open';
      this.wifiSetup.pass = '';
      this.$nextTick(() => {
        this.$refs.wifiPasswordInput?.blur?.();
      });
      this.showToast('Mode tanpa sandi dipilih.');
    },
    syncLoRaChannelSetupFromNetwork() {
      const channel = toNumber(this.network?.loraChannel, 4);
      const defaultChannel = toNumber(this.network?.loraDefaultChannel, 4);
      this.loraChannelSetup = {
        value: channel,
        defaultValue: defaultChannel,
        stored: toBool(this.network?.loraChannelStored)
      };
    },
    async saveLoRaChannel() {
      if (!this.showLoRaChannelUI) {
        this.showToast('Saluran radio hanya tersedia untuk kontrol ID KA.', 'error');
        return;
      }
      if (!this.isLocalConnected) {
        this.showToast('Pengaturan saluran radio hanya tersedia saat koneksi lokal aktif.', 'error');
        return;
      }
      const channel = Math.round(toNumber(this.loraChannelSetup?.value, NaN));
      if (!Number.isFinite(channel) || channel < LORA_CHANNEL_MIN || channel > LORA_CHANNEL_MAX) {
        this.showToast(`Saluran radio harus ${LORA_CHANNEL_MIN} sampai ${LORA_CHANNEL_MAX}.`, 'error');
        return;
      }
      if (!this.beginAction()) return;
      try {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        const body = new URLSearchParams();
        body.set('channel', String(channel));
        const res = await fetch(`${base}/api/lora/channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const text = await res.text();
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        if (!res.ok || parsed?.ok === false) {
          throw new Error(parsed?.error || parsed?.message || text || 'Gagal menyimpan saluran radio');
        }
        this.showToast(`Channel LoRa disimpan: ${channel}`);
        await this.refreshLocal();
        this.syncLoRaChannelSetupFromNetwork();
      } catch (error) {
        this.showToast(error?.message || 'Gagal menyimpan saluran radio.', 'error');
      } finally {
        this.endAction();
      }
    },

    touchThresholdToSensitivity(threshold) {
      const value = Math.max(400, Math.min(2200, Math.round(toNumber(threshold, 1200))));
      return Math.max(1, Math.min(10, Math.round((2200 - value) / 200) + 1));
    },
    touchSensitivityToThreshold(sensitivity) {
      const value = Math.max(1, Math.min(10, Math.round(toNumber(sensitivity, 6))));
      return 2200 - ((value - 1) * 200);
    },
    touchButtonLabel(button) {
      const name = `${button?.name || ''}`.toLowerCase();
      if (name === 'water') return 'Water';
      if (name === 'blower') return 'Blower';
      if (name === 'humidifier' || name === 'humid') return 'Humidifier';
      return `Button ${Number(button?.index ?? 0) + 1}`;
    },
    async loadTouchSensitivity() {
      if (!this.isLocalConnected || this.touchSensitivityLoading) return;
      this.touchSensitivityLoading = true;
      try {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        const res = await fetch(`${base}/api/touch`, { cache: 'no-store' });
        const text = await res.text();
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        if (!res.ok || parsed?.ok === false) throw new Error(parsed?.error || text || 'Gagal membaca sensitivitas touch');
        this.touchButtons = (parsed?.buttons || []).map(button => {
          const threshold = Math.round(toNumber(button.threshold, 1200));
          return {
            index: Number(button.index || 0),
            name: button.name || '',
            threshold,
            defaultThreshold: Math.round(toNumber(button.defaultThreshold, 1200)),
            stored: toBool(button.stored),
            sensitivity: this.touchThresholdToSensitivity(threshold)
          };
        });
      } catch (error) {
        this.showToast(error?.message || 'Gagal membaca sensitivitas touch.', 'error');
      } finally {
        this.touchSensitivityLoading = false;
      }
    },
    async saveTouchSensitivity(button) {
      if (!this.isLocalConnected || !button) return;
      const threshold = this.touchSensitivityToThreshold(button.sensitivity);
      if (!this.beginAction()) return;
      try {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        const body = new URLSearchParams();
        body.set('index', String(button.index));
        body.set('threshold', String(threshold));
        const res = await fetch(`${base}/api/touch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const text = await res.text();
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        if (!res.ok || parsed?.ok === false) throw new Error(parsed?.error || parsed?.message || text || 'Gagal menyimpan sensitivitas touch');
        button.threshold = threshold;
        button.stored = true;
        this.showToast(`${this.touchButtonLabel(button)} disimpan.`);
        await this.loadTouchSensitivity();
      } catch (error) {
        this.showToast(error?.message || 'Gagal menyimpan sensitivitas touch.', 'error');
      } finally {
        this.endAction();
      }
    },
    async resetTouchSensitivity(button = null) {
      if (!this.isLocalConnected) return;
      if (!this.beginAction()) return;
      try {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        const body = new URLSearchParams();
        body.set('reset', button ? (button.name || String(button.index)) : 'all');
        const res = await fetch(`${base}/api/touch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const text = await res.text();
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        if (!res.ok || parsed?.ok === false) throw new Error(parsed?.error || text || 'Gagal reset sensitivitas touch');
        this.showToast(button ? `${this.touchButtonLabel(button)} direset.` : 'Sensitivitas touch direset.');
        await this.loadTouchSensitivity();
      } catch (error) {
        this.showToast(error?.message || 'Gagal reset sensitivitas touch.', 'error');
      } finally {
        this.endAction();
      }
    },
    wifiSignalLevel(rssi) {
      const value = Number(rssi);
      if (!Number.isFinite(value)) return 0;
      if (value >= -55) return 4;
      if (value >= -67) return 3;
      if (value >= -75) return 2;
      if (value >= -82) return 1;
      return 0;
    },    wifiSignalLabel(rssi) {
      const value = Number(rssi);
      if (!Number.isFinite(value)) return 'Tidak diketahui';
      if (value >= -55) return 'Sangat bagus';
      if (value >= -67) return 'Bagus';
      if (value >= -75) return 'Cukup';
      if (value >= -82) return 'Lemah';
      return 'Sangat lemah';
    },
    async submitLocalWifiCredentials() {
      if (!this.isLocalConnected) {
        this.showToast('Koneksi lokal belum aktif.', 'error');
        return;
      }
      if (!this.wifiSetup.ssid) {
        this.showToast('Lengkapi SSID WiFi.', 'error');
        return;
      }
      if (!this.beginAction()) return;
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      try {
        const body = new URLSearchParams();
        body.set('ssid', this.wifiSetup.ssid);
        body.set('pass', this.wifiSetup.pass);
        const res = await fetch(`${base}/api/wifi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || 'Gagal menyimpan WiFi');
        }
        this.showToast(this.wifiSetup.pass ? 'WiFi tersimpan. Perangkat akan restart.' : 'WiFi tanpa sandi tersimpan. Perangkat akan restart.');
        setTimeout(() => this.startPreferredConnection(), 5000);
      } catch (error) {
        this.showToast(error?.message || 'Gagal menyimpan WiFi.', 'error');
      } finally {
        this.endAction();
      }
    },
    uploadGreenhouseFirmware() {
      if (!this.isLocalConnected) {
        this.showToast('Pembaruan firmware memerlukan koneksi lokal.', 'info');
        return;
      }
      if (!this.wifiSetup.file) {
        this.showToast('Pilih berkas firmware.', 'error');
        return;
      }
      if (this.actionInFlight) return;
      this.actionInFlight = true;
      if (this.actionTimer) clearTimeout(this.actionTimer);
      this.actionTimer = setTimeout(() => {
        if (this.actionInFlight) {
          this.showToast('Pembaruan firmware masih berjalan.', 'info');
          this.endAction();
        }
      }, 120000);
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      const form = new FormData();
      form.append('update', this.wifiSetup.file);
      fetch(`${base}/update`, {
        method: 'POST',
        body: form
      })
        .then(async res => {
          const text = await res.text();
          if (!res.ok) {
            throw new Error(text || 'Gagal mengirim firmware');
          }
          this.showToast('Firmware dikirim. Perangkat sedang memperbarui.');
          this.wifiSetup.file = null;
          this.wifiSetup.firmwareName = '';
        })
        .catch(error => {
          this.showToast(error?.message || 'Gagal memperbarui firmware.', 'error');
        })
        .finally(() => {
          this.endAction();
        });
    },
    openSensorInterval(sensor) {
      if (!sensor || sensor.nodeId === 0) return;
      this.sensorInterval = {
        nodeId: sensor.nodeId,
        childId: sensor.childId,
        label: sensor.label || ('Sensor ' + sensor.nodeId + ':' + sensor.childId),
        intervalSec: sensor.sleepIntervalMs ? Math.round(sensor.sleepIntervalMs / 60000) : 60
      };
      this.showSensorIntervalModal = true;
    },
    closeSensorInterval() {
      this.showSensorIntervalModal = false;
    },
    saveSensorInterval() {
      const s = this.sensorInterval;
      if (s.nodeId === 0) return;
      this.publishCommand('setSensorSleep', [s.nodeId, s.childId, s.intervalSec * 60 * 1000]);
      this.showToast('Interval node ' + s.nodeId + ':' + s.childId + ' disimpan.', 'success');
      this.closeSensorInterval();
    },

    // ─── Riwayat & grafik dari karjoAgroSensorHub ───
    // Satu KONTROLER = satu channel (kunci `KA-XXXX`): channel itu memuat sensor
    // lokal kontroler + sensor semua node LoRa di bawahnya (nama field node
    // berawalan `SN-XXXX • …`). Node yang tidak lewat kontroler tetap punya
    // channel sendiri (`SN-XXXX`). Dibaca lewat /api/series; channel publik
    // boleh dibaca tanpa token baca.
    showCloudModal: false,
    cloudHistory: [],
    cloudHistoryLoading: false,
    cloudHistoryError: '',
    cloudDateRange: '24h',
    cloudDataCount: 0,
    // Daftar node (serial) yang punya data di SensorHub.
    sensorhubNodes: [],
    sensorhubSn: '',
    // SATU sensor yang digrafikkan (dipilih dari dropdown "Pilih Sensor").
    sensorhubChartField: '',
    sensorhubSeries: [],
    // ── DUPLIKAT STATUS DI VPS (SensorHub) ────────────────────────────────
    // Kontroler mengirim state terakhirnya (status/task/sensor/aktuator) ke
    // SensorHub; saat kontroler TIDAK terjangkau dashboard memakai snapshot itu
    // supaya task/sensor/aktuator tetap terlihat (penanda: baris ID jadi kuning,
    // tekan untuk melihat pesan "Kontroler sedang offline").
    vpsState: null,        // {age_s, last_seen, online, diambil}
    vpsStateBusy: false,
    vpsStateTimer: null,
    // Menunggu balasan perangkat setelah menyimpan task (mode online).
    pendingTaskSave: null,

    get cloudBase() {
      return `${this.config?.cloudBaseUrl || ''}`.trim().replace(/\/+$/, '');
    },
    get cloudEnabled() {
      return !!this.cloudBase;
    },
    get cloudToken() {
      return `${this.config?.cloudReadToken || ''}`.trim();
    },
    get sensorhubNode() {
      return this.sensorhubNodes.find((n) => n.sn === this.sensorhubSn) || null;
    },
    // Label pemilih channel: channel kontroler vs node tunggal.
    sensorhubNodeLabel(n) {
      const sn = n?.sn || '';
      const nama = n?.name || '';
      if (!sn) return nama || 'karjoAgroSensorHub';
      if (n?.type === 'kontroler') {
        return `Kontroler ${sn}` + (nama && nama !== `Kontroler ${sn}` ? ` — ${nama}` : ' (semua sensor)');
      }
      return nama && nama !== `Node ${sn}` ? `${sn} — ${nama}` : `Node ${sn}`;
    },
    get sensorhubFieldList() {
      return this.sensorhubNode?.fields || [];
    },
    // Pemilik sensor = kontrol id kontroler pengirim (mis. KA-24C2). Dicatat
    // otomatis oleh SensorHub saat data pertama masuk — tanpa proses claim.
    get sensorhubOwner() {
      return this.sensorhubNode?.kontrol_id || '';
    },
    get sensorhubPublic() {
      return !!this.sensorhubNode?.public;
    },
    // Sensor yang digrafikkan = SATU yang dipilih di dropdown.
    sensorhubFieldSelected(name) {
      return this.sensorhubChartField === name;
    },
    // Ganti sensor yang digrafikkan (dropdown). Tidak perlu memuat ulang data:
    // seluruh kolom channel sudah diambil sekaligus saat membuka riwayat.
    async selectSensorhubChart(name) {
      this.sensorhubChartField = `${name || ''}`;
      await this.$nextTick();
      await this.renderSensorhubCharts();
    },
    sensorhubColor(index) {
      // Palet SAMA dengan SensorHub (channel_detail.html `colors`) supaya warna
      // grafik dashboard identik dengan halaman channel SensorHub.
      const p = sensorhubChartPalette;
      return p[index % p.length];
    },
    get cloudKontrolId() {
      return this.mqttKontrolId || this.login.kontrolId || this.config.mqtt.kontrolId;
    },

    // ── Snapshot state dari VPS (dipakai saat kontroler offline) ──────────
    get isLiveConnected() {
      return (this.mode === 'mqtt' && this.connected) || (this.mode === 'local' && this.connected);
    },
    get vpsStateActive() {
      return !!this.vpsState;
    },
    get vpsStateAgeText() {
      const detik = Number(this.vpsState?.age_s);
      if (!Number.isFinite(detik)) return '';
      if (detik < 90) return 'baru saja';
      const menit = Math.round(detik / 60);
      if (menit < 60) return `${menit} menit lalu`;
      const jam = Math.round(menit / 60);
      if (jam < 48) return `${jam} jam lalu`;
      return `${Math.round(jam / 24)} hari lalu`;
    },
    // Dipanggil saat baris ID kontroler ditekan (manual) di header. Teks sengaja
    // sederhana: pengguna tidak perlu tahu soal VPS/snapshot.
    showKontrolOfflineInfo() {
      const label = `${this.cloudKontrolId || ''}`.trim() || 'Kontroler';
      if (this.isLiveConnected) {
        this.showToast(`${label} tersambung — data langsung dari kontroler.`);
        return;
      }
      const umur = this.vpsStateAgeText;
      this.showToast(
        umur
          ? `Kontroler sedang offline — menampilkan data terakhir (${umur}).`
          : 'Kontroler sedang offline.',
        'warn'
      );
    },
    // Ambil snapshot dari SensorHub. Hanya saat TIDAK live (kalau live, snapshot
    // dibuang supaya data langsung dari perangkat yang dipakai).
    async syncVpsState() {
      if (this.isLiveConnected) {
        if (this.vpsState) this.vpsState = null;
        return;
      }
      if (!this.cloudEnabled || !this.cloudKontrolId || this.vpsStateBusy) return;
      // KA-0000 = ID bawaan (perangkat belum dipilih) → tidak ada snapshot,
      // jangan buat permintaan yang pasti 404.
      if (normalizeKontrolId(this.cloudKontrolId) === 'KA-0000') return;
      this.vpsStateBusy = true;
      try {
        const token = `${this.cloudToken || ''}`.trim();
        const sn = encodeURIComponent(this.cloudKontrolId);
        const resp = await fetch(
          `${this.cloudBase}/api/state/${sn}${token ? `?token=${encodeURIComponent(token)}` : ''}`,
          { cache: 'no-store' },
        );
        if (!resp.ok) {
          // 404 = belum ada snapshot (kontroler belum pernah mengirim) → biarkan kosong.
          if (resp.status === 404) this.vpsState = null;
          return;
        }
        const data = await resp.json();
        if (data?.ok) this.applyVpsSnapshot(data);
      } catch {
        /* jaringan/CORS bermasalah → snapshot lama tetap dipakai */
      } finally {
        this.vpsStateBusy = false;
      }
    },
    // Terapkan snapshot lewat parser yang SAMA dengan jalur MQTT, jadi bentuk
    // payload kontroler (respStatus/respTask/respSensor/respActuator) langsung
    // bisa dipakai tanpa kode khusus.
    applyVpsSnapshot(data) {
      const kosongSebelumnya = !this.sensors.length && !this.tasks.length;
      let diisi = false;
      try {
        if (data.status) {
          this.applyNetworkScope(parseStatusJson(JSON.stringify(data.status)));
          diisi = true;
        }
        if (data.actuators) {
          this.actuators = parseActuatorsJson(JSON.stringify(data.actuators));
          diisi = true;
        }
        if (data.tasks) {
          this.mergeTasks(parseTasksJson(JSON.stringify(data.tasks)));
          diisi = true;
        }
        if (data.sensors) {
          this.sensors = this.mergeSensors(parseSensorsJson(JSON.stringify(data.sensors)));
          diisi = true;
        }
      } catch {
        return; // payload rusak/tidak dikenal — jangan tampilkan setengah data
      }
      if (!diisi) return;

      this.lastUpdate = new Date();
      this.vpsState = {
        age_s: data.age_s,
        last_seen: data.last_seen,
        online: !!data.online,
        diambil: Date.now(),
      };
      // Beri tahu sekali (saat benar-benar kosong sebelumnya) supaya pengguna tahu
      // data ini snapshot, bukan live.
      if (kosongSebelumnya && !this._vpsSnapshotNotified) {
        this._vpsSnapshotNotified = true;
        this.showToast(`Kontroler sedang offline — menampilkan data terakhir (${this.vpsStateAgeText || 'tersimpan'}).`, 'warn');
      }
    },
    startVpsStateWatch() {
      this.stopVpsStateWatch();
      this.syncVpsState();
      this.vpsStateTimer = setInterval(() => { this.syncVpsState(); }, 60000);
    },
    stopVpsStateWatch() {
      if (this.vpsStateTimer) {
        clearInterval(this.vpsStateTimer);
        this.vpsStateTimer = null;
      }
    },

    async openCloudHistory() {
      this.showCloudModal = true;
      this.cloudHistoryError = '';
      await this.loadSensorHubNodes();
      this.cloudDateRange = this.cloudDateRange || '24h';
      await this.fetchCloudData();
    },
    closeCloudHistory() {
      this.showCloudModal = false;
      this.destroySensorhubCharts();
      this.cloudHistory = [];
      this.sensorhubSeries = [];
      this.cloudHistoryError = '';
    },

    // Daftar node yang punya data di SensorHub (GET /api/series/nodes).
    async loadSensorHubNodes() {
      if (!this.cloudEnabled) {
        this.cloudHistoryError = 'Alamat Server SensorHub belum diisi (Pengaturan → Koneksi).';
        return;
      }
      try {
        const url = `${this.cloudBase}/api/series/nodes?token=${encodeURIComponent(this.cloudToken)}`;
        const resp = await fetch(url, { cache: 'no-store' });
        const json = await resp.json();
        if (!json.ok) throw new Error('Gagal memuat daftar node');
        this.sensorhubNodes = json.nodes || [];

        // Prioritas pemilihan channel:
        //   1. channel KONTROLER yang sedang dibuka (`kontrolId`, mis. KA-24C2)
        //      — kini berisi SEMUA sensor kontroler itu,
        //   2. node dari payload sensor terkini (yang sedang terhubung),
        //   3. channel pertama yang tersedia.
        const snDiUi = [...new Set((this.sensors || []).map((s) => s.sn).filter(Boolean))];
        const kontrol = `${this.cloudKontrolId || ''}`.trim().toUpperCase();
        const cocokKontrol = this.sensorhubNodes.find((n) => `${n.sn || ''}`.toUpperCase() === kontrol)
          || this.sensorhubNodes.find((n) => `${n.kontrol_id || ''}`.toUpperCase() === kontrol);
        const cocokSensor = this.sensorhubNodes.find((n) => snDiUi.includes(n.sn));
        if (!this.sensorhubSn || !this.sensorhubNodes.some((n) => n.sn === this.sensorhubSn)) {
          this.sensorhubSn = (cocokKontrol || cocokSensor || this.sensorhubNodes[0])?.sn || '';
        }
      } catch (err) {
        this.sensorhubNodes = [];
        this.cloudHistoryError = err.message || 'Gagal terhubung ke SensorHub';
      }
    },

    async fetchCloudData() {
      if (!this.cloudEnabled || !this.sensorhubSn) {
        this.destroySensorhubCharts();
        this.sensorhubSeries = [];
        this.cloudHistory = [];
        return;
      }
      this.cloudHistoryLoading = true;
      this.cloudHistoryError = '';
      const since = new Date(Date.now() - ({
        '1h': 3600000,
        '6h': 21600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
      }[this.cloudDateRange] || 86400000)).toISOString();

      const token = encodeURIComponent(this.cloudToken);
      const sn = encodeURIComponent(this.sensorhubSn);

      try {
        // Seluruh kolom channel dimuat sekaligus (tanpa filter `field`) supaya
        // ganti sensor di dropdown langsung tampil tanpa memuat data lagi.
        const urlSeries =
          `${this.cloudBase}/api/series?sn=${sn}&since=${encodeURIComponent(since)}` +
          `&limit=1500&token=${token}`;

        const seriesResp = await fetch(urlSeries, { cache: 'no-store' });
        const series = await seriesResp.json();
        if (!series.ok) throw new Error(series.detail || 'Gagal memuat data SensorHub');

        this.sensorhubSeries = series.data || [];
        this.cloudHistory = this.sensorhubSeries;
        this.cloudDataCount = series.count || this.sensorhubSeries.length;

        // Sensor terpilih tidak ada lagi di channel ini → pilih otomatis
        // sensor pertama yang punya data.
        const tersedia = (this.sensorhubFieldList || []).map((f) => f.name);
        if (!this.sensorhubChartField || !tersedia.includes(this.sensorhubChartField)) {
          this.sensorhubChartField = this.sensorhubDefaultFields()[0] || '';
        }
      } catch (err) {
        this.cloudHistoryError = err.message || 'Gagal terhubung ke SensorHub';
        this.sensorhubSeries = [];
        this.cloudHistory = [];
      } finally {
        this.cloudHistoryLoading = false;
      }
      // Gambar grafik SETELAH container terlihat (Chart.js butuh ukuran elemen).
      await this.renderSensorhubCharts();
    },

    // Grafik yang ditampilkan: SATU sensor saja (yang dipilih di dropdown).
    get sensorhubChartFields() {
      const dipilih = `${this.sensorhubChartField || ''}`.trim();
      if (dipilih) return [dipilih];
      const otomatis = this.sensorhubDefaultFields()[0];
      return otomatis ? [otomatis] : [];
    },

    // Pilihan awal: sensor (bukan aktuator/relay) yang punya data. Hanya SATU
    // karena grafik menampilkan satu sensor saja.
    sensorhubDefaultFields() {
      const daftar = (this.sensorhubFieldList || []).map((f) => f.name);
      const adaData = (n) => (this.sensorhubSeries || []).some((r) => typeof r[n] === 'number');
      const bukanAktuator = daftar.filter((n) => !/aktuator|relay|pompa|kipas|pump|fan/i.test(n));
      const utama = bukanAktuator.filter(adaData);
      const pilihan = utama.length ? utama : (bukanAktuator.length ? bukanAktuator : daftar);
      return pilihan.slice(0, 1);
    },

    // Titik data satu sensor: [{ts, v}] (hanya nilai angka).
    sensorhubSeriesFor(name) {
      return (this.sensorhubSeries || [])
        .map((row) => ({ ts: row.ts, v: Number(row[name]) }))
        .filter((p) => Number.isFinite(p.v));
    },
    // Unduh data SATU sensor dalam CSV (sesuai rentang waktu yang aktif).
    downloadSensorhubCsv(name) {
      const titik = this.sensorhubSeriesFor(name);
      if (!titik.length) {
        this.showToast(`Belum ada data "${name}" pada rentang ini.`, 'warn');
        return;
      }
      const unit = this.sensorhubSensorUnit(name);
      const baris = [`waktu;nilai${unit ? ` (${unit})` : ''}`];
      titik.forEach((p) => {
        baris.push(`${new Date(p.ts).toLocaleString('id-ID')};${String(p.v).replace('.', ',')}`);
      });
      const berkas = `${name}`.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'sensor';
      const blob = new Blob(['\uFEFF' + baris.join('\r\n') + '\r\n'], {
        type: 'text/csv;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const tautan = document.createElement('a');
      tautan.href = url;
      tautan.download = `${this.sensorhubSn || 'channel'}-${berkas}-${this.cloudDateRange}.csv`;
      document.body.appendChild(tautan);
      tautan.click();
      document.body.removeChild(tautan);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showToast(`Data "${name}" diunduh (${titik.length} titik).`);
    },
    // Ringkasan satu sensor: nilai terakhir, min/max, jumlah titik, waktu akhir.
    sensorhubSensorStat(name) {
      const titik = this.sensorhubSeriesFor(name);
      if (!titik.length) return { count: 0, last: null, min: null, max: null, at: null };
      const nilai = titik.map((p) => p.v);
      const akhir = titik[titik.length - 1];
      return {
        count: titik.length,
        last: akhir.v,
        at: akhir.ts,
        min: Math.min(...nilai),
        max: Math.max(...nilai),
      };
    },
    sensorhubSensorValue(name) {
      const stat = this.sensorhubSensorStat(name);
      return stat.count ? this.formatCloudValue(stat.last) : '-';
    },
    sensorhubSensorTime(name) {
      const stat = this.sensorhubSensorStat(name);
      if (!stat.at) return '';
      const d = new Date(stat.at);
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    },
    sensorhubSensorRange(name) {
      const stat = this.sensorhubSensorStat(name);
      if (!stat.count) return { min: '-', max: '-' };
      return { min: stat.min.toFixed(1), max: stat.max.toFixed(1) };
    },
    // Satuan dibaca dari nama sensor (SensorHub tidak mengirim satuan).
    sensorhubSensorUnit(name) {
      const n = `${name || ''}`.toLowerCase();
      if (/kelembapan|kelembaban|humidity|moisture|baterai|battery/.test(n)) return '%';
      if (/suhu|temperature|temp/.test(n)) return '°C';
      if (/ketinggian|tinggi|level|jarak|distance|hc-sr04/.test(n)) return 'cm';
      if (/\bph\b/.test(n)) return 'pH';
      if (/\bec\b/.test(n)) return 'mS/cm';
      if (/\borp\b/.test(n)) return 'mV';
      return '';
    },

    // ── Grafik Chart.js — konfigurasi SAMA dengan SensorHub ──────────────
    // Sumber: karjoAgroSensorHub/backend/templates/channel_detail.html
    //         (`buildLineChartConfig`, `getTimeLabels`).
    // Tema gelap dipakai karena dashboard selalu gelap (nilai dari
    // applyChartTheme() SensorHub saat mode dark).
    sensorhubTimeLabels() {
      return (this.sensorhubSeries || []).map((row) => {
        const t = `${row.ts || ''}`.replace('T', ' ');
        return t.length >= 16 ? t.substring(11, 19) : t;
      });
    },
    sensorhubChartConfig(nama, index) {
      const unit = this.sensorhubSensorUnit(nama);
      const color = this.sensorhubColor(index);
      const series = this.sensorhubSeries || [];
      const values = series.map((row) => {
        const v = row[nama];
        return v === null || v === undefined ? null : Number(v);
      });
      return {
        type: 'line',
        data: {
          labels: this.sensorhubTimeLabels(),
          datasets: [{
            label: nama,
            data: values,
            borderColor: color,
            backgroundColor: color + '33',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            spanGaps: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => {
                  const f = series[items[0].dataIndex];
                  const t = `${f?.ts || ''}`.replace('T', ' ');
                  return t.length >= 16 ? t.substring(0, 19) : t;
                },
                label: (ctx) => `${nama}: ${ctx.parsed.y}${unit ? ' ' + unit : ''}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#8888aa', maxTicksLimit: 10, maxRotation: 45 },
              grid: { color: '#2a2a4a' },
            },
            y: {
              title: { display: !!unit, text: unit || '', color: '#8888aa' },
              beginAtZero: false,
              ticks: { color: '#8888aa' },
              grid: { color: '#2a2a4a' },
            },
          },
        },
      };
    },
    sensorhubChartCanvas(index) {
      return document.getElementById(`sensorhub-chart-${index}`);
    },
    destroySensorhubCharts() {
      Object.keys(sensorhubChartInstances).forEach((key) => {
        try {
          sensorhubChartInstances[key].destroy();
        } catch {
          /* instance sudah tidak valid — diabaikan */
        }
        delete sensorhubChartInstances[key];
      });
    },
    // Gambar ulang semua grafik (satu canvas per sensor terpilih). Selalu
    // dibuat ulang dari nol supaya urutan canvas cocok dengan daftar sensor.
    async renderSensorhubCharts() {
      if (typeof Chart === 'undefined') return; // pustaka belum termuat
      this.destroySensorhubCharts();
      await this.$nextTick();
      this.sensorhubChartFields.forEach((nama, i) => {
        const canvas = this.sensorhubChartCanvas(i);
        if (!canvas) return;
        sensorhubChartInstances[nama] = new Chart(canvas.getContext('2d'), this.sensorhubChartConfig(nama, i));
      });
    },

    formatCloudTime(iso) {
      if (!iso) return '-';
      const d = new Date(iso);
      return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
    },
    formatCloudValue(v) {
      if (v === null || v === undefined) return '-';
      if (typeof v === 'number') return v.toFixed(1);
      return v;
    },
    cloudBool(v) {
      return v ? 'Aktif' : 'Mati';
    },
  };
}


// --- Inisialisasi Alpine ---
document.addEventListener('alpine:init', () => {
    Alpine.data('app', app);
});
