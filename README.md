# BLE demo

Connect BLE sensors to a web page using the Bluetooth web API.

Sources:

- [https://developer.chrome.com/articles/bluetooth/](https://developer.chrome.com/articles/bluetooth/)
- [https://github.com/WebBluetoothCG/registries/blob/master/gatt_assigned_services.txt](https://github.com/WebBluetoothCG/registries/blob/master/gatt_assigned_services.txt)
- [https://github.com/WebBluetoothCG/registries/blob/master/gatt_assigned_characteristics.txt](https://github.com/WebBluetoothCG/registries/blob/master/gatt_assigned_characteristics.txt)
- [https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/](https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/)
- [https://www.bluetooth.com/specifications/specs/cycling-speed-and-cadence-service-1-0/](https://www.bluetooth.com/specifications/specs/cycling-speed-and-cadence-service-1-0/)
- [https://www.bluetooth.com/specifications/specs/cycling-power-service-1-1/](https://www.bluetooth.com/specifications/specs/cycling-power-service-1-1/)

## `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

## BLE devices

### Heart rate sensor

PrimaryService: heart_rate 0000180D
Characteristics:

- heart_rate_measurement 00002A37
- body_sensor_location 00002A38

PrimaryService: battery_service 0000180F
Characteristics:

- battery_level 00002A19

## Kickr

PrimaryService: cycling_power 00001818
Characteristics exposed:

- sensor_location 00002A5D
- cycling_power_measurement 00002A63
- cycling_power_feature 00002A65
- cycling_power_control_point 00002A66
- Unknown a026e005-0a7d-4ab3-97fa-f1500f9feb8b

PrimaryService: fitness_machine 00001826
Characteristics exposed:

- fitness_machine_feature 00002acc
- indoor_bike_data 00002ad2
- training_status 00002ad3
- supported_resistance_level_range 00002ad6
- supported_power_range 00002ad8
- fitness_machine_control_point 00002ad9
- fitness_machine_status 00002ada

primaryService: device_information 0000180a
Characteristics exposed:

- firmware_revision 00002a26
- hardware_revision 00002a27
- manufacturer_name 00002a29

## Cadence

PrimaryService: cycling_speed_and_cadence 00001816
Characteristics:

- sc_control_point 0x2A55
- csc_measurement 0x2A5B
- csc_feature 0x2A5C
- sensor_location 0x2A5D
