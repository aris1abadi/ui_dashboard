# UI Dashboard Contract

`ui_dashboard` adalah satu-satunya dashboard operator untuk dua perangkat:

- `karjoAgroKontrol2`
- `karjoAgroGreenHouseS2`

Pemilihan perangkat dilakukan dengan mengganti `kontrolId`.

## Peran Project

- `karjoAgroKontrol2`
  - mendukung task dinamis
  - dapat menambah, mengubah, dan menghapus task
- `karjoAgroGreenHouseS2`
  - memakai 3 task tetap
  - urutan task tetap:
    - `soil moisture / water`
    - `temperature / blower`
    - `humidity / humidifier`
  - task baru tidak diperbolehkan

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
- `POST /api/cmd`
- `POST /api/login`
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

## Aturan GreenHouse S2

Untuk `karjoAgroGreenHouseS2`:

- `allowTaskCreate = false`
- `allowTaskDelete = false`
- `fixedTaskCount = 3`
- task tidak boleh ditambah atau dihapus
- hanya nama task, threshold, durasi override, dan jadwal yang boleh disesuaikan

## Catatan Sinkronisasi

Jika ada perubahan field baru, usahakan:

1. `ui_dashboard` membaca field itu tanpa perlu menebak format lama
2. `karjoAgroKontrol2` dan `karjoAgroGreenHouseS2` mengirim field yang sama
3. greenhouse tetap mempertahankan 3 task fixed untuk hardware yang sudah terkunci
