import React from 'react';

import { Typography, Stack, Button, CircularProgress, Card, CardContent, List, ListItem, ListItemText } from '@mui/material';

import { sensorLocationLookup, uint8ArrayToHexString } from './bleFunctions';

class Cadence extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      busyConnecting: false,
      wheelCircumference: { value: 2.125, unit: 'm' },
      cyclingSpeedAndCadenceService: null,
      sensorLocation: null,
      cscMeasurement: null,

      showTechnicalData: false,
      flags: null,
      raw: null,
      fields: null
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (this.state.wheelCircumference !== nextProps.wheelCircumference) {
      this.setState({ wheelCircumference: nextProps.wheelCircumference });
    }
    return true;
  }

  buttonConnectDevice = async () => {
    if (this.state.cyclingSpeedAndCadenceService === null) {

      await navigator.bluetooth.requestDevice({
        filters: [{
          services: ['cycling_speed_and_cadence'],
        }],
        acceptAllDevices: false,
        optionalServices: ['cycling_speed_and_cadence'],
      }).then(device => {
        this.setState({ busyConnecting: true });
        device.addEventListener("gattserverdisconnected", this.onDeviceDisconnected);
        return device.gatt?.connect();
      }).then(async server => {

        await server?.getPrimaryService('cycling_speed_and_cadence').then(service => {
          service.getCharacteristic('sensor_location').then(this.handleSensorLocationCharacteristic);
          service.getCharacteristic('csc_measurement').then(this.handleCscMeasurementCharacteristic);
          service.getCharacteristic('csc_feature').then(this.handleCscFeatureCharacteristic);
          //cyclingSpeedAndCadenceService.getCharacteristic('sc_control_point').then(this.handleScControlPointCharacteristic);
          this.setState({ cyclingSpeedAndCadenceService: service });
        }).catch(error => {
          console.error("Error during connecting cycling_speed_and_cadence: ", error);
          this.setState({ cyclingSpeedAndCadenceService: null });
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
    this.setState({ cyclingSpeedAndCadenceService: null });
  }

  handleSensorLocationCharacteristic = (characteristic) => {
    if (characteristic === null) {
      console.log("Unknown sensor location.");
      return Promise.resolve();
    }
    return characteristic.readValue()
      .then(sensorLocationData => {
        this.setState({ sensorLocation: sensorLocationLookup(sensorLocationData.getUint8(0)) })
      })
  }

  handleCscFeatureCharacteristic = (characteristic) => {
    return characteristic.readValue()
      .then(cscFeatureData => {
        const flags = cscFeatureData.getUint16(0, /*littleEndian=*/true);
        console.log("csc_feature flags", flags, `(0b${flags.toString(2).padStart(16, '0')})})`)

        const result = {};
        if (flags & 0x1) {
          result.wheelRevolutionDataSupported = true;
        }
        if (flags & 0x2) {
          result.crankRevolutionDataSupported = true;
        }
        if (flags & 0x4) {
          result.multipleSensorLocationsSupported = true;
        }
      })
  }

  handleCscMeasurementCharacteristic = (characteristic) => {
    return characteristic.startNotifications()
      .then(char => {
        characteristic.addEventListener('characteristicvaluechanged',
          this.onCscMeasurementChanged);
      });
  }

  onCscMeasurementChanged = (event) => {
    // https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.csc_measurement.xml
    const data = event.target.value;
    const flags = data.getUint8(0);

    if (this.state.showTechnicalData) {
      //console.log("csc_measurement flags", flags, `(0b${flags.toString(2).padStart(8, '0')})})`)
      this.setState({ flags: `0b${flags.toString(2).padStart(8, '0')}` });
      const raw = uint8ArrayToHexString(data.buffer);
      //console.log("csc_measurement data", `length=${data.byteLength}`, `content=${raw}`)
      this.setState({ raw: raw });

      const fields = [];
      fields.push(`Crank revolutions: (${data.getUint16(1, true)})`);
      fields.push(`Last crank event time: (${data.getUint16(3, true)})`);
      this.setState({ fields: fields });

    }

    const result = {};
    let index = 1;

    const wheelRevolutionDataPresent = flags & 0x1;
    if (wheelRevolutionDataPresent) {
      const prevWheelTime = this.state.cscMeasurement?.lastWheelEventTime?.value || 0;
      const prevWheelRevolutions = this.state.cscMeasurement?.cumulativeWheelRevolutions?.value || 0;
      let wheelRpm = this.state.cscMeasurement?.wheelRpm?.value || 0;
      let speedCounter = (this.state.cscMeasurement?.speedCounter || 0) + 1;

      const wheelTime = data.getUint16(index + 4, /*littleEndian=*/true);
      const wheelRevolutions = data.getUint32(index, /*littleEndian=*/true);

      const deltaRotations = wheelRevolutions - prevWheelRevolutions;
      let deltaTime = wheelTime - prevWheelTime;
      if (deltaTime < 0) { deltaTime += 65536; }

      if (deltaTime !== 0 && deltaRotations !== 0) {
        wheelRpm = 1024 * deltaRotations / deltaTime * 60;
        speedCounter = 0; // Reset
      }

      if (speedCounter > 2) {
        wheelRpm = 0;
      }

      let speed = 0;
      let distance = 0;
      if (this.state.wheelCircumference.unit === 'm') {
        speed = { value: wheelRpm * this.state.wheelCircumference.value * 60 / 1000, unit: 'km/h' };
        distance = { value: this.state.wheelCircumference.value * wheelRevolutions / 1000, unit: 'km' };
      }
      else if (this.state.wheelCircumference.unit === 'in') {
        speed = { value: wheelRpm * this.state.wheelCircumference.value * 3.6 / 63360, unit: 'mph' };
        distance = { value: this.state.wheelCircumference.value * wheelRevolutions / 63360, unit: 'mi' };
      }
      result.cumulativeWheelRevolutions = { value: wheelRevolutions, unit: 'revolutions' };
      result.lastWheelEventTime = { value: wheelTime, unit: 's' };
      result.wheelRpm = { value: wheelRpm, unit: 'rpm' };
      result.speedCounter = speedCounter;
      result.distance = distance;
      result.speed = speed;

      index += 6;
    }

    const crankRevolutionDataPresent = flags & 0x2;
    if (crankRevolutionDataPresent) {
      const prevCrankTime = this.state.cscMeasurement?.lastCrankEventTime?.value || 0;
      const prevCrankRevolutions = this.state.cscMeasurement?.cumulativeCrankRevolutions?.value || 0;
      let cadence = this.state.cscMeasurement?.cadence?.value || 0;
      let crankCounter = (this.state.cscMeasurement?.crankCounter || 0) + 1;

      const crankTime = data.getUint16(index + 2, /*littleEndian=*/true);
      const crankRevolutions = data.getUint16(index, /*littleEndian=*/true);

      const deltaRotations = crankRevolutions - prevCrankRevolutions;
      let deltaTime = crankTime - prevCrankTime;
      if (deltaTime < 0) { deltaTime += 65536; }

      if (deltaTime !== 0 && deltaRotations !== 0) {
        cadence = 1024 * deltaRotations / deltaTime * 60;
        crankCounter = 0; // Reset
      }

      if (crankCounter > 2) {
        cadence = 0;
      }

      result.cumulativeCrankRevolutions = { value: crankRevolutions, unit: 'revolutions' };
      result.lastCrankEventTime = { value: crankTime, unit: 's' };
      result.crankCounter = crankCounter;
      result.cadence = { value: cadence, unit: 'rpm' };

      index += 4;
    }


    this.setState({ cscMeasurement: result });
  }

  render() {
    return (
      <Card>
        <CardContent>
          <Stack spacing={2}>

            <Typography variant="h4" marginTop={3} marginBottom={3} align='center'>
              Cadence sensor
            </Typography>

            {this.state.busyConnecting &&
              <CircularProgress />
            }

            {this.state.cyclingSpeedAndCadenceService ?
              <Typography variant="h5" marginTop={3} marginBottom={3} align='center'>
                Connected to: '{this.state.cyclingSpeedAndCadenceService.device.name}'
              </Typography>
              :
              <Button variant="contained" onClick={this.buttonConnectDevice} >
                Connect
              </Button>
            }

            {this.state.cscMeasurement && this.state.cscMeasurement.distance &&
              <>
                <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
                  Distance: {this.state.cscMeasurement.distance.value} {this.state.cscMeasurement.distance.unit}
                </Typography>

                <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
                  Speed: {this.state.cscMeasurement.speed.value.toFixed(9)} {this.state.cscMeasurement.speed.unit}
                </Typography>
              </>
            }

            {this.state.cscMeasurement && this.state.cscMeasurement.cadence &&
              <>
                <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
                  Cadence: {this.state.cscMeasurement.cadence.value.toFixed(1)} {this.state.cscMeasurement.cadence.unit}
                </Typography>
              </>
            }

            {this.state.showTechnicalData &&
              <>
                {this.state.flags &&
                  <Typography variant="h2" marginTop={3} marginBottom={3} align='center'>
                    flags: {this.state.flags}
                  </Typography>
                }

                {this.state.raw &&
                  <Typography variant="h2" marginTop={3} marginBottom={3} align='center'>
                    raw data: {this.state.raw}
                  </Typography>
                }

                {this.state.fields &&
                  <List dense={true}>
                    {this.state.fields.map((item, index) => (
                      <ListItem key={index}>
                        <ListItemText primaryTypographyProps={{ variant: 'h3' }}
                          primary={item}
                        />
                      </ListItem>
                    ))}
                  </List>
                }

                {this.state.sensorLocation &&
                  <Typography variant="h5" marginTop={3} marginBottom={3} align='center'>
                    Sensor location: {this.state.sensorLocation}
                  </Typography>
                }
              </>}

          </Stack>
        </CardContent>
      </Card>
    );
  }
}

export default Cadence;