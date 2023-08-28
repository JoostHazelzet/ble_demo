import React from 'react';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  Container, Typography, Stack
} from '@mui/material';

import HeartRateSensor from './components/HeartRateSensor';
import CyclePower from './components/CyclePower';
import Cadence from './components/Cadence';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

class App extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      bluetoothSupported: false,
      wheelCircumference: {value: 2.125, unit: 'm'},
    };
  }

  componentDidMount() {
    navigator.bluetooth.getAvailability().then((available) => {
      this.setState({ bluetoothSupported: available });

    });
  }

  render() {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Container maxWidth="xl" fixed={false}>
          {this.state.bluetoothSupported ?
          <Stack spacing={2}>
            <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
              BLE devices
            </Typography>

            <HeartRateSensor/>

            <CyclePower wheelCircumference={this.state.wheelCircumference} />

            <Cadence wheelCircumference={this.state.wheelCircumference} />

          </Stack>
          :
          <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
            This device does not support Bluetooth!
          </Typography>
          }
        </Container>
      </ThemeProvider>
    );
  }
}

export default App;
