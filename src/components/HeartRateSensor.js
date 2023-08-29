import React from 'react';

import { Typography, Stack, Button, CircularProgress, Card, CardContent } from '@mui/material';
import { uint8ArrayToHexString } from './bleFunctions';

class HeartRateSensor extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      busyConnecting: false,
      heartRateService: null,
      batteryService: null,
      sensorLocation: null,
      batteryLevel: null,
      heartRateMeasurement: null,

      showTechnicalData: false,
      raw: null,
      fields: null
    };
  }

  buttonConnectDevice = async () => {
    if (this.state.heartRateService === null) {

      await navigator.bluetooth.requestDevice({
        filters: [{
          services: ['heart_rate'],
        }],
        acceptAllDevices: false,
        optionalServices: ['heart_rate', 'battery_service'],
      }).then(device => {
        this.setState({ busyConnecting: true });
        device.addEventListener("gattserverdisconnected", this.onDeviceDisconnected);
        return device.gatt?.connect();
      }).then(async server => {

        if (this.state.showTechnicalData) {
          for (const primaryService of await server?.getPrimaryServices()) {
            console.log("primaryService", primaryService.uuid);
            const service = await server?.getPrimaryService(primaryService.uuid);
            service.getCharacteristics().then(characteristics => {
              for (const characteristic of characteristics) {
                console.log("\tcharacteristic", characteristic.uuid);
              }
            });
          }
        }

        await server?.getPrimaryService('heart_rate').then(service => {
          service.getCharacteristic('body_sensor_location').then(this.handleBodySensorLocationCharacteristic);
          service.getCharacteristic('heart_rate_measurement').then(this.handleHeartRateMeasurementCharacteristic);
          this.setState({ heartRateService: service });
        }).catch(error => {
          console.error("Error during connecting heart_rate: ", error);
          this.setState({ cyclingPowerService: null });
        });

        await server?.getPrimaryService('battery_service').then(service => {
          service.getCharacteristic('battery_level').then(this.handleBatteryLevelCharacteristic); 
          this.setState({ batteryService: service });
        }).catch(error => {
          console.error("Error during connecting battery_service: ", error);
        });

      }).catch(error => {
        if (error instanceof DOMException && error.code === 20) {
          console.log("User cancelled the requestDevice() chooser.");
        }
        else {
          console.error("Argh! buttonConnectDevice: ", error);
        }
      });

      this.setState({ busyConnecting: false });
    }
  }

  onDeviceDisconnected = () => {
    this.setState({ heartRateService: null });
    this.setState({ batteryService: null });
  }

  // ////////////////////////////////////////////////////////////////////
  // Heart Rate Service

  handleBodySensorLocationCharacteristic = (characteristic) => {
    if (characteristic === null) {
      console.log("Unknown sensor location.");
      return Promise.resolve();
    }
    return characteristic.readValue()
      .then(heartRateSensorLocationData => {
        const sensorLocation = heartRateSensorLocationData.getUint8(0);
        switch (sensorLocation) {
          case 0: return 'Other';
          case 1: return 'Chest';
          case 2: return 'Wrist';
          case 3: return 'Finger';
          case 4: return 'Hand';
          case 5: return 'Ear Lobe';
          case 6: return 'Foot';
          default: return 'Unknown';
        }
      }).then(location => this.setState({ sensorLocation: location }));
  }

  handleHeartRateMeasurementCharacteristic = (characteristic) => {
    return characteristic.startNotifications()
      .then(char => {
        characteristic.addEventListener('characteristicvaluechanged',
          this.onHeartRateChanged);
      });
  }

  onHeartRateChanged = (event) => {
    // https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.heart_rate_measurement.xml
    const data = event.target.value;
    const flags = data.getUint8(0);

    if (this.state.showTechnicalData) {
      console.log("cycling_power_measurement flags", flags, `(0b${flags.toString(2).padStart(16, '0')})})`)
      const raw = uint8ArrayToHexString(data.buffer);
      console.log("cycling_power_measurement data", `length=${data.byteLength}`, `content=${raw}`)
      this.setState({ raw: raw });
    }

    const result = {};
    let index = 1;

    const rate16Bits = flags & 0x1;
    if (rate16Bits) {
      result.heartRate = { value: data.getUint16(index, /*littleEndian=*/true), unit: 'bpm' };
      index += 2;
    } else {
      result.heartRate = { value: data.getUint8(index), unit: 'bpm' };
      index += 1;
    }

    const contactDetected = flags & 0x2;
    const contactSensorPresent = flags & 0x4;
    if (contactSensorPresent) {
      result.contactDetected = !!contactDetected;
    }

    const energyPresent = flags & 0x8;
    if (energyPresent) {
      result.energyExpended = { value: data.getUint16(index, /*littleEndian=*/true), unit: 'J' };
      index += 2;
    }

    const rrIntervalPresent = flags & 0x10;
    if (rrIntervalPresent) {
      const rrIntervals = [];
      for (; index + 1 < data.byteLength; index += 2) {
        rrIntervals.push({ value: data.getUint16(index, /*littleEndian=*/true) / 1024, unit: 's' });
      }
      result.rrIntervals = rrIntervals;
    }

    this.setState({ heartRateMeasurement: result });
  }

  // ////////////////////////////////////////////////////////////////////
  // Battery Service

  handleBatteryLevelCharacteristic = (characteristic) => {
    return characteristic.startNotifications()
      .then(char => {
        characteristic.addEventListener('characteristicvaluechanged',
          this.onBatteryLevelChanged);
      });
  }

  onBatteryLevelChanged = (event) => {
    const characteristic = event.target;
    this.setState({ batteryLevel: { value: characteristic.value.getUint8(0), unit: '%' } });
  }

  // ////////////////////////////////////////////////////////////////////
  // Render

  render() {
    return (
      <Card>
        <CardContent>
          <Stack spacing={2}>

            <Typography variant="h4" marginTop={3} marginBottom={3} align='center'>
              Heart Rate Sensor
            </Typography>

            {this.state.busyConnecting &&
              <CircularProgress />
            }

            {this.state.heartRateService ?
              <Typography variant="h5" marginTop={3} marginBottom={3} align='center'>
                Connected to: '{this.state.heartRateService.device.name}'
              </Typography>
              :
              <Button variant="contained" onClick={this.buttonConnectDevice} >
                Connect
              </Button>
            }

            {this.state.batteryLevel &&
              <Typography variant="h5" marginTop={3} marginBottom={3} align='center'>
                Battery level: {this.state.batteryLevel.value} {this.state.batteryLevel.unit}
              </Typography>
            }

            {this.state.sensorLocation &&
              <Typography variant="h5" marginTop={3} marginBottom={3} align='center'>
                Sensor body location: {this.state.sensorLocation}
              </Typography>
            }

            {this.state.heartRateMeasurement && !this.state.heartRateMeasurement.contactDetected &&
              <Typography variant="h5" marginTop={3} marginBottom={3} align='center'>
                Lost contact with the heart beat, is sensor correctly placed?
              </Typography>
            }

            {this.state.heartRateMeasurement && this.state.heartRateMeasurement.heartRate &&
              <Typography variant="h1" marginTop={3} marginBottom={3} align='center'>
                {this.state.heartRateMeasurement.heartRate.value} {this.state.heartRateMeasurement.heartRate.unit}
              </Typography>}

              {this.state.showTechnicalData &&
              <>
                {this.state.powerMeasurement &&
                  <Typography variant="h2" marginTop={3} marginBottom={3} align='center'>
                    {this.state.raw}
                  </Typography>
                }

                {this.state.powerMeasurement &&
                  <Typography variant="h4" marginTop={3} marginBottom={3} align='center'>
                    {JSON.stringify(this.state.fields)}
                  </Typography>
                }
              </>}


          </Stack>
        </CardContent>
      </Card>
    );
  }
}

export default HeartRateSensor;