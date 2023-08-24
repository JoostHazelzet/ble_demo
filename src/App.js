import React from 'react';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  Container, Typography, Stack, Button, CircularProgress
} from '@mui/material';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

class App extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      chosenHeartRateService: null,
      busyConnecting: false,
      sensorLocation: null,
      heartRateInfo: null,
    };
  }

  buttonBleConnect = () => {
    if (this.state.chosenHeartRateService === null) {
      this.setState({ busyConnecting: true });
      navigator.bluetooth.requestDevice({
        filters: [{
          services: ['heart_rate'],
        }]
      }).then(device => device.gatt.connect())
        .then(server => server.getPrimaryService('heart_rate'))
        .then(service => {
          this.setState({ busyConnecting: false });
          this.setState({ chosenHeartRateService: service });
          return Promise.all([
            service.getCharacteristic('body_sensor_location')
              .then(this.handleBodySensorLocationCharacteristic),
            service.getCharacteristic('heart_rate_measurement')
              .then(this.handleHeartRateMeasurementCharacteristic),
          ]);
        });
    }
  }

  handleBodySensorLocationCharacteristic = (characteristic) => {
    if (characteristic === null) {
      console.log("Unknown sensor location.");
      return Promise.resolve();
    }
    return characteristic.readValue()
      .then(sensorLocationData => {
        const sensorLocation = sensorLocationData.getUint8(0);
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
    const characteristic = event.target;
    this.parseHeartRateInfo(characteristic.value);
  }

  parseHeartRateInfo = (data) => {
    const flags = data.getUint8(0);
    const rate16Bits = flags & 0x1;
    const result = {};
    let index = 1;
    if (rate16Bits) {
      result.heartRate = data.getUint16(index, /*littleEndian=*/true);
      index += 2;
    } else {
      result.heartRate = data.getUint8(index);
      index += 1;
    }
    const contactDetected = flags & 0x2;
    const contactSensorPresent = flags & 0x4;
    if (contactSensorPresent) {
      result.contactDetected = !!contactDetected;
    }
    const energyPresent = flags & 0x8;
    if (energyPresent) {
      result.energyExpended = data.getUint16(index, /*littleEndian=*/true);
      index += 2;
    }
    const rrIntervalPresent = flags & 0x10;
    if (rrIntervalPresent) {
      const rrIntervals = [];
      for (; index + 1 < data.byteLength; index += 2) {
        rrIntervals.push(data.getUint16(index, /*littleEndian=*/true));
      }
      result.rrIntervals = rrIntervals;
    }
    this.setState({ heartRateInfo: result });
  }


  render() {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Container maxWidth="xl" fixed={false}>
          <Stack spacing={2}>
            <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
              Heart rate monitor
            </Typography>

            {this.state.busyConnecting &&
              <CircularProgress />
            }
            
            <>
              {this.state.chosenHeartRateService ?
                <Typography variant="h4" marginTop={3} marginBottom={3} align='center'>
                  Connected to '{this.state.chosenHeartRateService.device.name}'
                </Typography>
                :
                <Button variant="contained" onClick={this.buttonBleConnect}>Connect BLE device</Button>
              }
            </>

            {this.state.sensorLocation &&
              <Typography variant="h4" marginTop={3} marginBottom={3} align='center'>
                Sensor location: {this.state.sensorLocation}
              </Typography>
            }

            {this.state.heartRateInfo && !this.state.heartRateInfo.contactDetected &&
              <Typography variant="h4" marginTop={3} marginBottom={3} align='center'>
                Lost contact with the heart beat, is sensor correctly placed?
              </Typography>
            }

            {this.state.heartRateInfo && this.state.heartRateInfo.heartRate &&
              <Typography variant="h1" marginTop={3} marginBottom={3} align='center'>
                {this.state.heartRateInfo.heartRate}
              </Typography>}

          </Stack>
        </Container>
      </ThemeProvider>
    );
  }
}

export default App;
