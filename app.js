// --- DEFAULTS & KONSTANTA ---
const defaults = {
  localBaseUrl: 'http://192.168.4.1',
  manualDurationMs: 15000,
  uiId: '',
  kontrolIds: ['KA-0000'],
  kontrolAliases: {},
  mqtt: {
    url: 'wss://z442812a.ala.asia-southeast1.emqxsl.com:8084/mqtt',
    username: '',
    password: '',
    prefixOut: 'abadinet-out',
    prefixIn: 'abadinet-in',
    kontrolId: 'KA-0000'
  }
};
const loginSessionKey = 'karjo_ui_authenticated';
const loginCredentials = { username: 'admin', password: 'admin123' };
const LOCAL_PROBE_WINDOW_MS = 15000;
const LOCAL_PROBE_INTERVAL_MS = 3000;
const LOCAL_FALLBACK_AFTER_MS = 20000;
  const themeOptions = ['dark', 'light', 'ocean', 'sunset'];
  const themeClassMap = { light: 'theme-light', ocean: 'theme-ocean', sunset: 'theme-sunset' };
  const LORA_CHANNEL_MIN = 0;
  const LORA_CHANNEL_MAX = 83;
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
function parseStatusJson(muatan) {
  const isian = parsePayloadKontrol(muatan);
  const status = isian.status && typeof isian.status === 'object' ? isian.status : isian;
  return {
    state: status.state || '',
    configuredSsid: status.configuredSsid || '',
    connectedSsid: status.connectedSsid || '',
    ip: status.ip || '',
    nodeCount: toNumber(status.nodeCount),
    kontrolId: status.kontrolId || '',
    apMode: toBool(status.apMode),
    apSsid: status.apSsid || '',
    fixedTaskCount: toNumber(status.fixedTaskCount ?? status.taskCount ?? 0),
    allowTaskCreate: status.allowTaskCreate !== false,
    allowTaskDelete: status.allowTaskDelete !== false,
    loraChannel: toNumber(status.loraChannel ?? status.channel ?? 4),
    loraChannelStored: toBool(status.loraChannelStored),
    loraDefaultChannel: toNumber(status.loraDefaultChannel ?? 4)
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
    moistureDryCalibration: item.moistureDryCalibration === '' || item.moistureDryCalibration === undefined ? 800 : toNumber(item.moistureDryCalibration, 800),
    moistureWetCalibration: item.moistureWetCalibration === '' || item.moistureWetCalibration === undefined ? 490 : toNumber(item.moistureWetCalibration, 490),
    distanceLowCalibration: item.distanceLowCalibration === '' || item.distanceLowCalibration === undefined ? null : toNumber(item.distanceLowCalibration, null),
    distanceHighCalibration: item.distanceHighCalibration === '' || item.distanceHighCalibration === undefined ? null : toNumber(item.distanceHighCalibration, null),
    fuelLowCalibration: item.fuelLowCalibration === '' || item.fuelLowCalibration === undefined ? null : toNumber(item.fuelLowCalibration, null),
    fuelHighCalibration: item.fuelHighCalibration === '' || item.fuelHighCalibration === undefined ? null : toNumber(item.fuelHighCalibration, null),
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
    stopAtMs: toNumber(item.stopAtMs ?? 0)
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
      actuatorActive: toBool(item.actuatorActive),
      lastSensorValue: item.lastSensorValue === '' || item.lastSensorValue === undefined ? null : toNumber(item.lastSensorValue, null),
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
function app() {
  return {
    // State utama
    isAuthenticated: false, config: JSON.parse(JSON.stringify(defaults)), connectionPreference: normalizeConnectionPreference(localStorage.getItem('karjo_ui_connection_mode')), mode: 'offline', connected: false, network: {}, sensors: [], actuators: [], tasks: [], currentTaskIndex: 0, lastUpdate: null, mqttClient: null, refreshTimer: null, uiTimer: null, now: Date.now(), actionInFlight: false, actionTimer: null, pendingKontrolId: null, pendingTaskSave: null, theme: 'dark',
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
    mqttCredentialForm: { username: '', password: '', error: '', showPassword: false },
    // State UI
    showSettingsModal: false, showTaskModal: false, showScheduleModal: false, showScheduleListModal: false, showLogModal: false, showLoginKontrolModal: false, showAllTasksModal: false, showDeleteConfirm: false, settingsTab: 'status', toast: { visible: false, message: '', type: 'info', timer: null },
    login: { username: '', password: '', kontrolId: '', error: '', newKontrolId: '', newKontrolAlias: '', newKontrolIdError: '', showPassword: false }, lastLoginKontrolSelection: null,
    editingTask: {}, editingSchedule: {}, scheduleListTaskIndex: -1, taskToDelete: null,
    showMoistureCalibrationModal: false,
    moistureCalibrationPollTimer: null,
    moistureCalibration: { nodeId: 0, childId: 0, label: '', rawValue: null, dryValue: 800, wetValue: 490, currentValue: null, error: '' },
    showDistanceCalibrationModal: false,
    distanceCalibrationPollTimer: null,
    distanceCalibration: { nodeId: 0, childId: 0, label: '', rawValue: null, lowValue: -10, highValue: 15, currentValue: null, error: '' },
    showFuelCalibrationModal: false,
    fuelCalibrationPollTimer: null,
    fuelCalibration: { nodeId: 0, childId: 0, label: '', rawValue: null, lowValue: 190, highValue: 0, currentValue: null, error: '' },
    timeForm: { date: '', time: '' },
    wifiSetup: { ssid: '', pass: '', auth: '', file: null, firmwareName: '' },
    loraChannelSetup: { value: 4, defaultValue: 4, stored: false },
    wifiScanResults: [], wifiScanLoading: false, wifiScanError: '', wifiScanAt: null, wifiScanFilter: 'all',
    deepSleep: { nodeId: null, intervalSec: 60 },
    // State log
    logs: [], logFilter: 'all', logPage: 0, logPerPage: 50, logCount: 0, logStorage: '0 B', logLoading: false, logChartMetric: 'temperature', logChartSelectedIndex: null, logChartHiddenSeries: [], logChartActivePoint: null, logDownload: { start: '', end: '', busy: false, error: '', progress: 0, status: '', totalPages: 0, processedPages: 0, mode: '', totalLogs: 0 }, pendingLogDownloads: {},
    
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
        threshold: 'Ambang Threshold',
        calibration: 'Kalibrasi Moisture',
        calibrationDistance: 'Kalibrasi Distance',
        calibrationFuel: 'Kalibrasi Fuel Height',
        connection: 'Status Koneksi',
        task: 'Task',
        log: 'Log Aktivitas',
        node: 'Node',
        nodeSensor: 'Node Sensor',
        loraChannel: 'Channel LoRa',
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
    getHeaderStatusIcon() {
      if (this.mode === 'detecting') return '◌';
      if (!this.connected) return '●';
      if (this.mode === 'local') return this.network?.apMode ? '◐' : '◔';
      if (this.mode === 'mqtt') return '●';
      return '◌';
    },
    get filteredLogs() { if (this.logFilter === 'all') return this.logs; const map = { sensor: 0, button: 1, status: 3 }; return this.logs.filter(e => e.type === map[this.logFilter]); },
    get sensorLogEntries() { return this.logs.filter(entry => Number(entry?.type) === 0); },
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
          if (text.includes('temp') || text.includes('lm35')) return 0;
          if (text.includes('hum')) return 1;
          if (text.includes('soil') || text.includes('moist') || text.includes('kelembapan')) return 2;
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
        { key: 'temperature', label: 'Temperature', unit: '°C' },
        { key: 'humidity', label: 'Humidity', unit: '%' },
        { key: 'soil', label: 'Soil Moisture', unit: '%' }
      ];
      const discovered = new Map();
      const blocked = new Set(['type', 'ts', 'timestamp', 'data', 'user', 'label', 'node', 'child', 'raw', 'valueType', 'unit', 'source', 'sourceLabel', 'sourceNode', 'sourceChild', 'sourceValueType', 'sourceValue']);
      for (const entry of this.sensorLogEntries) {
        const snapshot = this.getLogSensorSnapshot(entry);
        Object.entries(snapshot).forEach(([key, value]) => {
          if (blocked.has(key) || key.startsWith('source')) return;
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) return;
          if (!discovered.has(key)) {
            discovered.set(key, {
              key,
              label: this.getLogMetricLabel(key),
              unit: this.getLogMetricUnit(key)
            });
          }
        });
      }
      const ordered = ['temperature', 'humidity', 'soil'].filter(key => discovered.has(key)).map(key => discovered.get(key));
      const remaining = Array.from(discovered.values()).filter(item => !['temperature', 'humidity', 'soil'].includes(item.key));
      return ordered.length || remaining.length ? [...ordered, ...remaining] : fallback;
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
      const metrics = this.logChartMetrics;
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
      const seriesBase = metrics.map(metric => {
        const samples = this.sensorLogEntries
          .map(entry => {
            const value = this.getLogMetricValue(entry, metric);
            const ts = toNumber(entry?.ts ?? entry?.timestamp, 0);
            if (!Number.isFinite(value) || !ts) return null;
            return { ts, value };
          })
          .filter(Boolean)
          .sort((a, b) => a.ts - b.ts)
          .slice(-48);
        return {
          key: metric.key,
          label: metric.label,
          unit: metric.unit,
          samples
        };
      });
      if (!seriesBase.length) return [];
      const allPoints = seriesBase.flatMap(series => series.samples);
      if (!allPoints.length) {
        return seriesBase.map(series => {
          const theme = palette[series.key] || { color: getFallbackColor(series.key), line: 'series-default' };
          return {
            ...series,
            points: [],
            path: '',
            min: 0,
            max: 0,
            latest: null,
            count: 0,
            color: theme.color,
            lineClass: theme.line,
            visible: !this.logChartHiddenSeries.includes(series.key)
          };
        });
      }
      const tsMin = Math.min(...allPoints.map(item => item.ts));
      const tsMax = Math.max(...allPoints.map(item => item.ts));
      const valueMin = Math.min(...allPoints.map(item => item.value));
      const valueMax = Math.max(...allPoints.map(item => item.value));
      const tsRange = Math.max(1, tsMax - tsMin);
      const valueRange = Math.max(1, valueMax - valueMin);
      return seriesBase.map(series => {
        const points = series.samples.map(item => {
          const x = plotLeft + (((item.ts - tsMin) / tsRange) * (plotRight - plotLeft));
          const y = valueMax === valueMin
            ? (plotTop + plotBottom) / 2
            : plotBottom - (((item.value - valueMin) / valueRange) * (plotBottom - plotTop));
          return {
            ...item,
            x: Number(x.toFixed(1)),
            y: Number(y.toFixed(1))
          };
        });
        const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
        const theme = palette[series.key] || { color: getFallbackColor(series.key), line: 'series-default' };
        return {
          ...series,
          points,
          path,
          min: roundToOneDecimal(Math.min(...series.samples.map(item => item.value))),
          max: roundToOneDecimal(Math.max(...series.samples.map(item => item.value))),
          latest: points[points.length - 1] || null,
          count: points.length,
          color: theme.color,
          lineClass: theme.line,
          visible: !this.logChartHiddenSeries.includes(series.key)
        };
      });
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
    get showMaintenanceTab() { return this.isLocalConnected; },
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
      return !!username && !!password && !isLegacySharedMqttCredential(username, password);
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

    // Metode
    init() { 
      this.loadConfig(); 
      this.ensureUiId(); 
      this.initAuthState(); 
      this.setupPwaHooks();
      const savedTheme = localStorage.getItem('karjo_ui_theme') || 'dark'; 
      this.theme = savedTheme; 
      this.applyTheme(savedTheme); 
      this.applyBackgroundImage(this.backgroundImage); 
      this.uiTimer = setInterval(() => { this.now = Date.now(); }, 1000);
    },
    loadConfig() { 
      const raw = localStorage.getItem('karjo_ui_config'); 
      let parsed; 
      try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; } 
      const mqttKontrolId = normalizeKontrolId(parsed?.mqtt?.kontrolId) || defaults.mqtt.kontrolId; 
      const kontrolIds = normalizeKontrolIdList(parsed?.kontrolIds, mqttKontrolId); 
      const parsedMqtt = parsed.mqtt || {};
      const legacyCredential = isLegacySharedMqttCredential(parsedMqtt.username, parsedMqtt.password);
      this.config = { 
        ...defaults, 
        ...parsed, 
        kontrolIds, 
        kontrolAliases: parsed.kontrolAliases || {},
        mqtt: {
          ...defaults.mqtt,
          ...parsedMqtt,
          username: legacyCredential ? '' : `${parsedMqtt.username || ''}`.trim(),
          password: legacyCredential ? '' : `${parsedMqtt.password || ''}`.trim(),
          kontrolId: mqttKontrolId
        }
      }; 
      if (legacyCredential) {
        this.config.mqtt.username = '';
        this.config.mqtt.password = '';
        this.saveConfig();
      }
      this.pendingKontrolId = mqttKontrolId; 
      this.login.kontrolId = mqttKontrolId || kontrolIds[0]; 
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
    handleMqttConnectFailure(error) {
      if (this.mqttConnectFailureHandled) return;
      this.mqttConnectFailureHandled = true;
      const authError = isMqttAuthError(error);
      const message = authError
        ? 'Credential MQTT ditolak. Periksa username dan password.'
        : 'MQTT gagal tersambung. Periksa alamat broker atau jaringan.';
      this.clearMqttConnectTimer();
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
        this.mqttCredentialForm.error = 'Credential MQTT tidak valid.';
      }
    },
    submitMqttCredentialModal() {
      try {
        const username = `${this.mqttCredentialForm.username || ''}`.trim();
        const password = `${this.mqttCredentialForm.password || ''}`.trim();
        if (!username || !password) {
          this.mqttCredentialForm.error = 'Username dan password MQTT wajib diisi.';
          return;
        }
        this.config.mqtt.username = username;
        this.config.mqtt.password = password;
        this.saveConfig();
        this.mqttCredentialForm.error = '';
        this.mqttCredentialPendingConnect = true;
        this.mqttConnectFailureHandled = false;
        this.mqttPendingConnectError = null;
        this.closeMqttCredentialModal({ keepPendingConnect: true });
        this.showToast('Credential MQTT disimpan. Menyambungkan...', 'info');
        setTimeout(() => {
          if (this.mqttCredentialPendingConnect) {
            this.mqttCredentialPendingConnect = false;
            this.startPreferredConnection();
          }
        }, 80);
      } catch (error) {
        this.mqttCredentialPendingConnect = false;
        this.connected = false;
        this.mode = 'offline';
        this.mqttCredentialForm.error = 'Gagal menyimpan credential MQTT.';
        this.showToast('Gagal menyimpan credential MQTT.', 'error');
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

    // Autentikasi & modal login
    initAuthState() { 
      this.isAuthenticated = localStorage.getItem(loginSessionKey) === '1'; 
      this.connectionPreference = normalizeConnectionPreference(localStorage.getItem('karjo_ui_connection_mode'));
      if (this.isAuthenticated) {
        this.startPreferredConnection();
      }
    },
    attemptLogin(connectionMode = 'mqtt') { 
      this.login.error = ''; 
      if (!this.login.username || !this.login.password) return this.login.error = 'Lengkapi nama pengguna dan sandi.'; 
      if (this.login.username === loginCredentials.username && this.login.password === loginCredentials.password) { 
        if (this.login.kontrolId && this.login.kontrolId !== this.config.mqtt.kontrolId) { this.applyKontrolId(this.login.kontrolId, { skipLogout: true }); } 
        this.connectionPreference = normalizeConnectionPreference(connectionMode);
        localStorage.setItem('karjo_ui_connection_mode', this.connectionPreference);
        this.isAuthenticated = true; 
        localStorage.setItem(loginSessionKey, '1'); 
        this.showToast(this.connectionPreference === 'local' ? 'Masuk lokal berhasil.' : 'Masuk online berhasil.'); 
        this.startPreferredConnection();
      } else { 
        this.login.error = 'Nama pengguna atau sandi salah.'; 
      } 
    },
    logoutApplication(skipPrompt = false) {
      this.stopKaConnections();
      this.isAuthenticated = false;
      localStorage.removeItem(loginSessionKey);
      this.login.username = '';
      this.login.password = '';
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
      if (this.connectionPreference === 'local') {
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
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      const data = await ambilJsonDenganBatasWaktu(`${base}/api/status`, null, 2000);
      if (!data) return false;
      this.network = parseStatusJson(data);
      return true;
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
      const mqttCredentials = {
        username: `${this.config?.mqtt?.username || ''}`.trim(),
        password: `${this.config?.mqtt?.password || ''}`.trim()
      };
      const hasCredential = !!mqttCredentials.username && !!mqttCredentials.password && !isLegacySharedMqttCredential(mqttCredentials.username, mqttCredentials.password);
      if (!hasCredential) {
        this.mqttCredentialPendingConnect = true;
        this.openMqttCredentialModal();
        return;
      }
      this.config.mqtt.username = mqttCredentials.username;
      this.config.mqtt.password = mqttCredentials.password;
      this.saveConfig();
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
        this.connected = true;
        this.mode = 'mqtt';
        this.mqttPendingConnectError = null;
        const topic = `abadinet-out/${this.config.mqtt.kontrolId}/#`;
        this.mqttClient.subscribe(topic);
        this.publishCommand({ cmd: 'getAll' });
        this.startMqttPolling();
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
      if(cmd === 'respStatus') this.network = parseStatusJson(muatan); 
      if(cmd === 'respSensor') {
        this.sensors = parseSensorsJson(muatan);
        this.syncMoistureCalibrationFromSensors();
        this.syncDistanceCalibrationFromSensors();
        this.syncFuelCalibrationFromSensors();
      }
      if(cmd === 'respActuator') this.actuators = parseActuatorsJson(muatan); 
      if(cmd === 'respTask') this.mergeTasks(parseTasksJson(muatan)); 
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
    startMqttPolling() { this.clearRefresh(); this.refreshTimer = setInterval(() => { if (this.mqttClient?.connected) this.publishCommand({ cmd: 'getStatus' }); }, 20000); },
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
    async refreshLocal() {
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      try {
        const dataJaringan = await ambilJsonDenganBatasWaktu(`${base}/api/status`, null, 2000);
        if (!dataJaringan) return false;
        const jaringan = parseStatusJson(dataJaringan);
        const [sensorData, actuatorData, taskData] = await Promise.all([
          ambilJsonDenganBatasWaktu(`${base}/api/sensors`, {}, 2500),
          ambilJsonDenganBatasWaktu(`${base}/api/actuators`, {}, 2500),
          ambilJsonDenganBatasWaktu(`${base}/api/tasks`, {}, 2500)
        ]);
        this.network = jaringan;
        this.sensors = parseSensorsJson(sensorData);
        this.actuators = parseActuatorsJson(actuatorData);
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
      const topic = `abadinet-in/${this.config.mqtt.kontrolId}/0/0/${cmd}`; 
      const payload = typeof command === 'string'
        ? bangunPayloadPerintahLama(cmd, legacyArgs || [])
        : bangunPayloadPerintah(cmd, Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'cmd')));
      this.mqttClient.publish(topic, payload); 
    },
    async sendLocalCommand(command, legacyArgs = null, timeoutMs = 10000) {
      const base = this.config.localBaseUrl.replace(/\/$/, '');
      const payload = typeof command === 'string' ? bangunPayloadPerintahLama(command, legacyArgs || []) : JSON.stringify(command);
      const pengendali = new AbortController();
      const idBatasWaktu = setTimeout(() => pengendali.abort(), timeoutMs);
      try {
        const res = await fetch(`${base}/api/cmd`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: pengendali.signal
        });
        clearTimeout(idBatasWaktu);
        const text = await res.text();
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        if (!res.ok || parsed?.ok === false) {
        return { ok: false, error: parsed?.error || parsed?.message || text || 'Perintah gagal', data: parsed };
        }
        return { ok: true, data: parsed, text };
      } catch (error) {
        clearTimeout(idBatasWaktu);
        const message = error && error.name === 'AbortError' ? 'Batas waktu habis' : 'Perintah gagal';
        return { ok: false, error: message };
      }
    },
    async sendActuator(index, action, tombol) { if (!this.beginAction(tombol)) return; if (this.mode === 'local') { const duration = action === 'on' ? this.config.manualDurationMs : 0; const res = await this.sendLocalCommand({ cmd: 'setActuator', index, action, durationMs: duration }); if (res.ok) await this.refreshLocal(); else this.showToast('Gagal mengirim perintah.', 'error'); this.endAction(); } else { this.publishCommand({ cmd: 'setActuator', index, action, durationMs: this.config.manualDurationMs }); } },
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
    applyKontrolId(nextId, { skipLogout = false } = {}) { const normalized = normalizeKontrolId(nextId); if (!normalized || normalized === this.config.mqtt.kontrolId) return; const previous = this.config.mqtt.kontrolId; this.config.mqtt.kontrolId = normalized; this.ensureKontrolIdList(normalized); this.saveConfig(); if (this.mode === 'mqtt' && this.mqttClient?.connected) { if (previous) this.mqttClient.unsubscribe(`abadinet-out/${previous}/#`); this.mqttClient.subscribe(`abadinet-out/${normalized}/#`); this.publishCommand('getAll'); } if (!skipLogout) this.logoutApplication(true); },
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
      if (!sensor || !sensor.label) return ''; 
      const label = sensor.label.toLowerCase();
      if (label.includes('temp') || label.includes('lm35')) return '°C';
      if (label.includes('dist') || label.includes('cm')) return 'cm';
      if (label.includes('fuel') || label.includes('height')) return 'cm';
      if (label.includes('hum')) return '%';
      if (label.includes('moist') || label.includes('soil')) return '%';
      if (label.includes('volt')) return 'V';
      if (label.includes('watt')) return 'W';
      if (label.includes('amp')) return 'A';
      if (label.includes('lux') || label.includes('light')) return 'lux';
      const match = sensor.label.match(/\(([^)]+)\)/); 
      return match ? match[1] : ''; 
    },
    isMoistureSensor(sensor) {
      if (!sensor) return false;
      const label = `${sensor.label || ''}`.toLowerCase();
      if (label.includes('moist') || label.includes('soil') || label.includes('kelembapan')) return true;
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
      const rawValue = Number.isFinite(Number(sensor.rawValue)) && sensor.rawValue !== null
        ? toNumber(sensor.rawValue, null)
        : this.estimateMoistureRawFromValue(sensor);
      if (Number.isFinite(Number(rawValue))) {
        this.moistureCalibration.rawValue = Math.round(Number(rawValue));
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
          this.sensors = parseSensorsJson(sensorData);
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
    openMoistureCalibration(sensor) {
      if (!this.isMoistureSensor(sensor)) return;
      const dryValue = toNumber(sensor.moistureDryCalibration, 800);
      const wetValue = toNumber(sensor.moistureWetCalibration, 490);
      const rawValue = Number.isFinite(Number(sensor.rawValue)) && sensor.rawValue !== null
        ? toNumber(sensor.rawValue, null)
        : this.estimateMoistureRawFromValue(sensor);
      this.moistureCalibration = {
        nodeId: sensor.nodeId,
        childId: sensor.childId,
        label: sensor.label || `Node ${sensor.nodeId}:${sensor.childId}`,
        rawValue,
        dryValue,
        wetValue,
        currentValue: sensor.value,
        error: ''
      };
      this.showMoistureCalibrationModal = true;
      this.startMoistureCalibrationPolling();
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
          this.closeMoistureCalibration();
        }
      } finally {
        this.endAction();
      }
    },
    isDistanceSensor(sensor) {
      if (!sensor) return false;
      const label = `${sensor.label || ''}`.toLowerCase();
      if (label.includes('distance') || label.includes('hcsr04')) return true;
      return sensor.valueType === 13 || sensor.sensorType === 15;
    },
    isFuelHeightSensor(sensor) {
      if (!sensor) return false;
      const label = `${sensor.label || ''}`.toLowerCase();
      return label.includes('fuel') || label.includes('fuel height');
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
      const rawValue = Number.isFinite(Number(sensor.rawValue)) && sensor.rawValue !== null
        ? toNumber(sensor.rawValue, null)
        : this.estimateDistanceRawFromValue(sensor);
      if (Number.isFinite(Number(rawValue))) {
        this.distanceCalibration.rawValue = Number(rawValue);
      }
      this.distanceCalibration.currentValue = sensor.value;
      if (sensor.label) this.distanceCalibration.label = sensor.label;
      const lowCalibration = Number(sensor.distanceLowCalibration);
      const highCalibration = Number(sensor.distanceHighCalibration);
      if (Number.isFinite(lowCalibration) && Number.isFinite(highCalibration) && !(lowCalibration === 0 && highCalibration === 0)) {
        this.distanceCalibration.lowValue = lowCalibration;
        this.distanceCalibration.highValue = highCalibration;
      }
    },
    async refreshDistanceCalibrationData() {
      if (!this.showDistanceCalibrationModal) return false;
      if (this.mode === 'local') {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        try {
          const sensorData = await ambilJsonDenganBatasWaktu(`${base}/api/sensors`, {}, 2000);
          if (!sensorData) return false;
          this.sensors = parseSensorsJson(sensorData);
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
    openDistanceCalibration(sensor) {
      if (!this.isDistanceSensor(sensor)) return;
      const rawValue = Number.isFinite(Number(sensor.rawValue)) && sensor.rawValue !== null
        ? toNumber(sensor.rawValue, null)
        : this.estimateDistanceRawFromValue(sensor);
      this.distanceCalibration = {
        nodeId: sensor.nodeId,
        childId: sensor.childId,
        label: sensor.label || `Node ${sensor.nodeId}:${sensor.childId}`,
        rawValue,
        lowValue: (() => {
          const low = Number(sensor.distanceLowCalibration);
          const high = Number(sensor.distanceHighCalibration);
          return Number.isFinite(low) && Number.isFinite(high) && !(low === 0 && high === 0) ? low : -10;
        })(),
        highValue: (() => {
          const low = Number(sensor.distanceLowCalibration);
          const high = Number(sensor.distanceHighCalibration);
          return Number.isFinite(low) && Number.isFinite(high) && !(low === 0 && high === 0) ? high : 15;
        })(),
        currentValue: sensor.value,
        error: ''
      };
      this.showDistanceCalibrationModal = true;
      this.startDistanceCalibrationPolling();
    },
    closeDistanceCalibration() {
      this.clearDistanceCalibrationPolling();
      this.showDistanceCalibrationModal = false;
    },
    setDistanceCalibrationPoint(kind) {
      const nilaiMentah = this.distanceCalibration?.rawValue;
      if (!Number.isFinite(Number(nilaiMentah))) {
        this.showToast('Nilai raw sensor belum tersedia.', 'error');
        return;
      }
      if (kind === 'low') {
        this.distanceCalibration.lowValue = Number(nilaiMentah);
      } else if (kind === 'high') {
        this.distanceCalibration.highValue = Number(nilaiMentah);
      }
    },
    resetDistanceCalibration() {
      this.distanceCalibration.lowValue = -10;
      this.distanceCalibration.highValue = 15;
    },
    async saveDistanceCalibration() {
      const payload = this.distanceCalibration || {};
      const nodeId = toNumber(payload.nodeId, 0);
      const childId = toNumber(payload.childId, -1);
      const lowValue = Number(payload.lowValue);
      const highValue = Number(payload.highValue);
      if (!nodeId || childId < 0 || !Number.isFinite(lowValue) || !Number.isFinite(highValue)) {
        this.showToast('Data kalibrasi belum lengkap.', 'error');
        return;
      }
      if (lowValue === highValue) {
        this.showToast('Nilai kalibrasi tidak boleh sama.', 'error');
        return;
      }
      if (!this.beginAction()) return;
      const perintah = { cmd: 'setDistanceCalibration', nodeId, childId, low: lowValue, high: highValue };
      try {
        if (this.mode === 'local') {
          const res = await this.sendLocalCommand(perintah);
          if (res.ok) {
            await this.refreshLocal();
            this.showToast('Kalibrasi tersimpan.');
            this.closeDistanceCalibration();
          } else {
            this.showToast(res.error || 'Gagal menyimpan kalibrasi.', 'error');
          }
        } else {
          this.publishCommand(perintah);
          setTimeout(() => this.publishCommand('getSensors'), 500);
          this.showToast('Kalibrasi dikirim ke kontroler.');
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
      const rawValue = Number.isFinite(Number(sensor.rawValue)) && sensor.rawValue !== null
        ? toNumber(sensor.rawValue, null)
        : this.estimateFuelRawFromValue(sensor);
      if (Number.isFinite(Number(rawValue))) {
        this.fuelCalibration.rawValue = Number(rawValue);
      }
      this.fuelCalibration.currentValue = sensor.value;
      if (sensor.label) this.fuelCalibration.label = sensor.label;
      this.fuelCalibration.lowValue = toNumber(sensor.fuelLowCalibration, this.fuelCalibration.lowValue);
      this.fuelCalibration.highValue = toNumber(sensor.fuelHighCalibration, this.fuelCalibration.highValue);
    },
    async refreshFuelCalibrationData() {
      if (!this.showFuelCalibrationModal) return false;
      if (this.mode === 'local') {
        const base = this.config.localBaseUrl.replace(/\/$/, '');
        try {
          const sensorData = await ambilJsonDenganBatasWaktu(`${base}/api/sensors`, {}, 2000);
          if (!sensorData) return false;
          this.sensors = parseSensorsJson(sensorData);
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
      const rawValue = Number.isFinite(Number(sensor.rawValue)) && sensor.rawValue !== null
        ? toNumber(sensor.rawValue, null)
        : this.estimateFuelRawFromValue(sensor);
      this.fuelCalibration = {
        nodeId: sensor.nodeId,
        childId: sensor.childId,
        label: sensor.label || `Node ${sensor.nodeId}:${sensor.childId}`,
        rawValue,
        lowValue: toNumber(sensor.fuelLowCalibration, 190),
        highValue: toNumber(sensor.fuelHighCalibration, 0),
        currentValue: sensor.value,
        error: ''
      };
      this.showFuelCalibrationModal = true;
      this.startFuelCalibrationPolling();
    },
    closeFuelCalibration() {
      this.clearFuelCalibrationPolling();
      this.showFuelCalibrationModal = false;
    },
    setFuelCalibrationPoint(kind) {
      const nilaiMentah = this.fuelCalibration?.rawValue;
      if (!Number.isFinite(Number(nilaiMentah))) {
        this.showToast('Nilai raw sensor belum tersedia.', 'error');
        return;
      }
      if (kind === 'low') {
        this.fuelCalibration.lowValue = Number(nilaiMentah);
      } else if (kind === 'high') {
        this.fuelCalibration.highValue = Number(nilaiMentah);
      }
    },
    resetFuelCalibration() {
      this.fuelCalibration.lowValue = 190;
      this.fuelCalibration.highValue = 0;
    },
    async saveFuelCalibration() {
      const payload = this.fuelCalibration || {};
      const nodeId = toNumber(payload.nodeId, 0);
      const childId = toNumber(payload.childId, -1);
      const lowValue = Number(payload.lowValue);
      const highValue = Number(payload.highValue);
      if (!nodeId || childId < 0 || !Number.isFinite(lowValue) || !Number.isFinite(highValue)) {
        this.showToast('Data kalibrasi belum lengkap.', 'error');
        return;
      }
      if (lowValue === highValue) {
        this.showToast('Nilai kalibrasi tidak boleh sama.', 'error');
        return;
      }
      if (!this.beginAction()) return;
      const perintah = { cmd: 'setFuelHeightCalibration', nodeId, childId, low: lowValue, high: highValue };
      try {
        if (this.mode === 'local') {
          const res = await this.sendLocalCommand(perintah);
          if (res.ok) {
            await this.refreshLocal();
            this.showToast('Kalibrasi tersimpan.');
            this.closeFuelCalibration();
          } else {
            this.showToast(res.error || 'Gagal menyimpan kalibrasi.', 'error');
          }
        } else {
          this.publishCommand(perintah);
          setTimeout(() => this.publishCommand('getSensors'), 500);
          this.showToast('Kalibrasi dikirim ke kontroler.');
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
    getTaskTriggerSource(task) {
      if (!task) return 'none';
      const source = normalisasiSumberTrigger(task.lastTriggerSource ?? task.triggerSource ?? task.source ?? task.lastTrigger ?? task.trigger ?? 'none');
      if (source !== 'none') return source;
      if (!task.actuatorActive) return 'none';

      const rawSensor = Number(task.lastSensorValue);
      const threshold = Number(task.threshold);
      if (task.thresholdEnabled && Number.isFinite(rawSensor) && Number.isFinite(threshold) && rawSensor <= threshold) {
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
      if (!task) return 'status-offline';
      if (!this.isActuatorOnline(task)) return 'status-offline'; 
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
      if (this.isLocalConnected) {
        this.settingsTab = 'maintenance';
        this.loadWifiScan();
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
        this.editingTask = { 
          index: -1, 
          label: '', 
          sensorKey: this.sensors.length > 0 ? `${this.sensors[0].nodeId}:${this.sensors[0].childId}` : '', 
          actuatorIndex: this.actuators.length > 0 ? this.actuators[0].index : 0, 
          threshold: 50, 
          durationMinutes: 15, 
          thresholdEnabled: false,
          schedules: []
        };
      }
      this.syncFixedTaskActuator();
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
        // Minta penyegaran data task
        setTimeout(() => this.publishCommand('getTasks'), 500);
        this.showTaskModal = false;
        this.showToast('Task dikirim ke kontroler.');
      }
    },
    openScheduleList(taskIndex) { this.scheduleListTaskIndex = taskIndex; this.showScheduleListModal = true; },
    getTaskByIndex(idx) { 
      if (idx === undefined || idx === null) return null;
      return this.tasks.find(t => t.index === idx); 
    },
    getTaskSchedules(idx) { 
      if (idx === undefined || idx === null) return [];
      const t = this.getTaskByIndex(idx); 
      return (t && t.schedules) ? t.schedules.map(s => ({ ...s, taskIndex: idx })) : []; 
    },
    openScheduleForm(entry = null) {
      if (entry) {
        this.editingSchedule = { ...entry };
      } else {
        this.editingSchedule = { taskIndex: this.scheduleListTaskIndex, slotIndex: -1, pickupTime: '08:00', durationMinutes: 15, enabled: true };
      }
      this.showScheduleModal = true;
    },
    submitSchedule() {
      if (!this.editingSchedule) return;
      const task = this.getTaskByIndex(this.editingSchedule.taskIndex);
      if (!task) {
        this.showToast('Task tidak ditemukan.', 'error');
        return;
      }
      
      let schedules = [...(task.schedules || [])];
      const jadwalBaru = { 
        pickupTime: this.editingSchedule.pickupTime, 
        durationMinutes: this.editingSchedule.durationMinutes, 
        enabled: this.editingSchedule.enabled 
      };

      if (this.editingSchedule.slotIndex >= 0) {
        schedules[this.editingSchedule.slotIndex] = jadwalBaru;
      } else {
        schedules.push(jadwalBaru);
      }
      const perintah = {
        cmd: 'updateTask',
        index: task.index,
        task: {
          label: this.getTaskLabel(task),
          sensorNode: task.sensorNode || 0,
          sensorChild: task.sensorChild || 0,
          actuatorIndex: this.getFixedActuatorIndexForSensorKey(`${task.sensorNode}:${task.sensorChild}`) ?? (task.actuatorIndex || 0),
          threshold: task.threshold || 0,
          activateDurationMs: task.activateDurationMs || 0,
          thresholdEnabled: !!task.thresholdEnabled,
          schedules: schedules.map((schedule, slotIndex) => ({
            pickupTime: schedule.pickupTime || schedule.time || '00:00',
            durationMinutes: toNumber(schedule.durationMinutes ?? schedule.duration, 0),
            enabled: schedule.enabled !== false,
            slotIndex,
            label: this.getTaskLabel(task)
          }))
        }
      };

      if (this.mode === 'local') {
        this.sendLocalCommand(perintah).then(res => { if(res.ok) this.refreshLocal(); });
      } else {
        this.publishCommand(perintah);
        setTimeout(() => this.publishCommand('getTasks'), 500);
      }
      this.showScheduleModal = false;
      this.showToast('Jadwal tersimpan.');
    },
    deleteSchedule(taskIndex, slotIndex, tombol) {
      if (!confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) return;
      const task = this.getTaskByIndex(taskIndex);
      if (!task || !task.schedules) return;
      
      let daftarJadwal = task.schedules.filter((_, i) => i !== slotIndex);
      const perintah = {
        cmd: 'updateTask',
        index: task.index,
        task: {
          label: this.getTaskLabel(task),
          sensorNode: task.sensorNode || 0,
          sensorChild: task.sensorChild || 0,
          actuatorIndex: this.getFixedActuatorIndexForSensorKey(`${task.sensorNode}:${task.sensorChild}`) ?? (task.actuatorIndex || 0),
          threshold: task.threshold || 0,
          activateDurationMs: task.activateDurationMs || 0,
          thresholdEnabled: !!task.thresholdEnabled,
          schedules: daftarJadwal.map((schedule, idx) => ({
            pickupTime: schedule.pickupTime || schedule.time || '00:00',
            durationMinutes: toNumber(schedule.durationMinutes ?? schedule.duration, 0),
            enabled: schedule.enabled !== false,
            slotIndex: idx,
            label: this.getTaskLabel(task)
          }))
        }
      };

      if (this.mode === 'local') {
        this.sendLocalCommand(perintah).then(res => { if(res.ok) this.refreshLocal(); });
      } else {
        this.publishCommand(perintah);
        setTimeout(() => this.publishCommand('getTasks'), 500);
      }
      this.showToast('Jadwal dihapus.');
    },
    openLogModal() { 
      if (!this.beginAction()) return;
      this.showLogModal = true; 
      this.logChartSelectedIndex = null;
      this.logLoading = true;
      this.ensureDefaultLogDownloadRange();
      if (this.mode === 'mqtt') this.publishCommand('getLogs', [0, 30]);
      else this.loadLocalLogs();
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
        throw new Error('Koneksi MQTT belum tersambung.');
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
          throw new Error('Unduhan CSV hanya tersedia saat koneksi lokal atau MQTT aktif.');
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
          'timestamp,temperature,humidity,soil'
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
      const temperature = Number.isFinite(Number(parsed?.temperature ?? parsed?.temp)) ? roundToOneDecimal(parsed?.temperature ?? parsed?.temp) : '';
      const humidity = Number.isFinite(Number(parsed?.humidity ?? parsed?.hum)) ? roundToOneDecimal(parsed?.humidity ?? parsed?.hum) : '';
      const soil = Number.isFinite(Number(parsed?.soil ?? parsed?.moisture ?? parsed?.value)) ? roundToOneDecimal(parsed?.soil ?? parsed?.moisture ?? parsed?.value) : '';
      if (temperature === '' && humidity === '' && soil === '') return '';
      return [
        toCsv(timestampIso),
        toCsv(temperature === '' ? '' : String(temperature)),
        toCsv(humidity === '' ? '' : String(humidity)),
        toCsv(soil === '' ? '' : String(soil))
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
            this.logs = data.logs || [];
            this.logCount = data.count || this.logs.length;
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
      if (payloadLoaded && !this.logChartMetrics.some(metric => metric.key === this.logChartMetric)) {
        this.logChartMetric = this.logChartMetrics[0]?.key || 'temperature';
      }
      if (this.logChartSelectedIndex !== null && this.logChartSelectedIndex >= this.logChartSeries.points.length) {
        this.logChartSelectedIndex = null;
      }
    },
    setLogChartMetric(metric) {
      if (!metric) return;
      this.logChartMetric = metric;
      this.logChartSelectedIndex = null;
    },
    toggleLogChartSeries(metric) {
      if (!metric) return;
      if (this.logChartHiddenSeries.includes(metric)) {
        this.logChartHiddenSeries = this.logChartHiddenSeries.filter(item => item !== metric);
      } else {
        this.logChartHiddenSeries = [...this.logChartHiddenSeries, metric];
      }
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
        y: point.y
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
      if (nearest) this.selectLogChartPoint(series, nearest);
    },
    clearLogChartPoint() {
      this.logChartActivePoint = null;
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
        temperature: 'Temperature',
        humidity: 'Humidity',
        soil: 'Soil Moisture',
        moisture: 'Soil Moisture',
        temp: 'Temperature',
        hum: 'Humidity'
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
        this.showToast('Channel LoRa hanya tersedia untuk kontrol ID KA.', 'error');
        return;
      }
      if (!this.isLocalConnected) {
        this.showToast('Pengaturan channel LoRa hanya tersedia saat koneksi lokal aktif.', 'error');
        return;
      }
      const channel = Math.round(toNumber(this.loraChannelSetup?.value, NaN));
      if (!Number.isFinite(channel) || channel < LORA_CHANNEL_MIN || channel > LORA_CHANNEL_MAX) {
        this.showToast(`Channel LoRa harus ${LORA_CHANNEL_MIN} sampai ${LORA_CHANNEL_MAX}.`, 'error');
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
          throw new Error(parsed?.error || parsed?.message || text || 'Gagal menyimpan channel LoRa');
        }
        this.showToast(`Channel LoRa disimpan: ${channel}`);
        await this.refreshLocal();
        this.syncLoRaChannelSetupFromNetwork();
      } catch (error) {
        this.showToast(error?.message || 'Gagal menyimpan channel LoRa.', 'error');
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
    },
    wifiSignalLabel(rssi) {
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
    submitDeepSleepInterval() {
      if (!this.deepSleep.nodeId) return this.showToast('Pilih node sensor.', 'error');
      this.publishCommand('setSleep', [this.deepSleep.nodeId, this.deepSleep.intervalSec * 60 * 1000]);
      this.showToast('Interval node pembaca dikirim.');
    }
  };
}


// --- Inisialisasi Alpine ---
document.addEventListener('alpine:init', () => {
    Alpine.data('app', app);
});
