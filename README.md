# UI Dashboard Contract

`ui_dashboard` adalah satu-satunya dashboard operator untuk perangkat
`karjoAgroKontrol2`. Pemilihan perangkat dilakukan dengan mengganti `kontrolId`.

> ⚠️ `karjoAgroGreenHouseS2` **sudah digabung ke `karjoAgroKontrol2`** (21 Sep 2026)
> dan repo-nya sudah dihapus. Aturan "greenhouse" di bawah kini berlaku untuk
> Kontrol2 yang menjalankan mode 3 task fixed.

## Peran Project

- `karjoAgroKontrol2` (satu firmware untuk semua varian)
  - mendukung task dinamis
  - dapat menambah, mengubah, dan menghapus task
  - **mode greenhouse** (dulu `karjoAgroGreenHouseS2`, digabung 21 Sep 2026):
    memakai 3 task tetap, urutan task tetap:
    - `soil moisture / water`
    - `temperature / blower`
    - `humidity / humidifier`
    task baru tidak diperbolehkan

## Kontrak JSON Utama

Semua respons utama memakai format JSON dengan metadata:

- `type`
- `cmd`

Endpoint yang digunakan dashboard:

- `GET /api/status`
- `GET /api/sensors`
- `GET /api/actuators`
- `GET /api/tasks`
- `GET /api/getAll`
- `POST /api/login`
- `POST /api/cmd`
- `POST /api/wifi`
- `GET /api/wifiScan`
- `GET /api/logs`
- `POST /api/logs/clear`
- `POST /update`

## Field `status`

Field inti yang dipakai dashboard:

- `online`
- `state`
- `deviceId`
- `configuredSsid`
- `connectedSsid`
- `ip`
- `nodeCount`
- `apMode`
- `apSsid`
- `kontrolId`
- `allowTaskCreate`
- `allowTaskDelete`
- `fixedTaskCount`

Tambahan yang dipakai untuk monitoring greenhouse:

- `temperature`
- `humidity`
- `moisture`
- `tempThreshold`
- `humThreshold`
- `moistureThreshold`
- `waterOn`
- `blowerOn`
- `humidifierOn`
- `waterOverrideDuration`
- `blowerOverrideDuration`
- `humidifierOverrideDuration`
- `waterOverrideRemaining`
- `blowerOverrideRemaining`
- `humidifierOverrideRemaining`
- `waterRelayMode`
- `blowerRelayMode`
- `humidifierRelayMode`

## Field `tasks`

Setiap task memakai struktur yang sama.

Field yang dibaca dashboard:

- `index`
- `label`
- `sensorLabel`
- `sensorType`
- `sensorNode`
- `sensorChild`
- `actuatorIndex`
- `threshold`
- `thresholdEnabled`
- `activateDurationMs`
- `actuatorActive`
- `lastSensorValue`
- `lastTriggerSource`
- `editable`
- `fixed`
- `canAdd`
- `canDelete`
- `schedules`

### `lastTriggerSource`

Dashboard menampilkan sumber relay/aktuator dalam format:

- `ON(manual)`
- `ON(jadwal)`
- `ON(auto)`
- `OFF`

Mapping sumber:

- `manual` -> tombol fisik atau perintah manual
- `schedule` -> jadwal
- `threshold` -> otomatis berdasarkan threshold sensor

## Aturan mode greenhouse (dulu `karjoAgroGreenHouseS2`, kini di `karjoAgroKontrol2`)

Untuk mode greenhouse:

- `allowTaskCreate = false`
- `allowTaskDelete = false`
- `fixedTaskCount = 3`
- task tidak boleh ditambah atau dihapus
- hanya nama task, threshold, durasi override, dan jadwal yang boleh disesuaikan

## Catatan Sinkronisasi

Jika ada perubahan field baru, usahakan:

1. `ui_dashboard` membaca field itu tanpa perlu menebak format lama
2. satu firmware (`karjoAgroKontrol2`) mengirim field yang sama untuk semua varian
3. mode greenhouse tetap mempertahankan 3 task fixed untuk hardware yang sudah terkunci

## Login Baru

- username login memakai `uiId` otomatis dalam format `UI-xxxx`
- dashboard menunggu MQTT siap saat halaman login dibuka
- password dikirim ke controller untuk divalidasi melalui MQTT atau `POST /api/login`
