import React from 'react';

import { Typography, Stack, Button, CircularProgress, Card, CardContent, List, ListItem, ListItemText } from '@mui/material';

import { sensorLocationLookup, uint8ArrayToHexString } from './bleFunctions';

class CyclePower extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      busyConnecting: false,
      deviceInformation: null,
      wheelCircumference: { value: 2.125, unit: 'm' },
      cyclingPowerService: null,
      sensorLocation: null,
      powerMeasurement: null,
      powerFeatures: null,

      fitnessMachineService: null,
      writeTofittnessMachine: null,
      indoorBikeData: null,
      fitnessMachineFeatures: null,
      targetSettingsFeatures: null,
      supportedResistanceLevel: null,
      supportedPowerRange: null,

      showTechnicalData: false,
      rawCyclingPower: null,
      rawFitnessMachine: null,
      fieldsCyclingPower: null,
      flagsFitsnessMachine: null,
      fieldsFitnessMachine: null
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (this.state.wheelCircumference !== nextProps.wheelCircumference) {
      this.setState({ wheelCircumference: nextProps.wheelCircumference });
    }
    return true;
  }

  buttonConnectDevice = async () => {
    if (this.state.cyclingPowerService === null) {

      await navigator.bluetooth.requestDevice({
        filters: [{
          services: ['cycling_power'],
        }],
        // filters: [{ services: [ 0x1818 ] }],
        acceptAllDevices: false,
        optionalServices: ['cycling_power', 'fitness_machine', 'generic_access', 'generic_attribute', 'device_information'],
      }).then(device => {
        this.setState({ busyConnecting: true });
        device.addEventListener("gattserverdisconnected", this.onDeviceDisconnected);
        return device.gatt?.connect();
      }).then(async server => {

        await server?.getPrimaryService('cycling_power').then(service => {
          service.getCharacteristic('sensor_location').then(this.handleSensorLocationCharacteristic);
          service.getCharacteristic('cycling_power_measurement').then(this.handlePowerMeasurementCharacteristic);
          service.getCharacteristic('cycling_power_feature').then(this.handlePowerFeatureCharacteristic);
          this.setState({ cyclingPowerService: service });
        }).catch(error => {
          console.error("Error during connecting cycling_power: ", error);
          this.setState({ cyclingPowerService: null });
        });

        await server?.getPrimaryService('device_information').then(this.handleDeviceInformationService).catch(error => {
          console.error("Error during connecting device_information: ", error);
        });

        await server?.getPrimaryService('fitness_machine').then(service => {
          service.getCharacteristic('fitness_machine_feature').then(this.handleFitnessMachineFeatureCharacteristic);
          service.getCharacteristic('supported_resistance_level_range').then(this.handleSupportedResistanceLevelRangeCharacteristic);
          service.getCharacteristic('supported_power_range').then(this.handleSupportedPowerRangeCharacteristic);
          service.getCharacteristic('indoor_bike_data').then(this.handleIndoorBikeDataCharacteristic);
          service.getCharacteristic('fitness_machine_control_point').then(this.handleFitnessMachineControlPointCharacteristic);
          this.setState({ fitnessMachineService: service });
          // service.getCharacteristic('training_status').then(this.handleTrainingStatusCharacteristic); // TODO
          // service.getCharacteristic('fitness_machine_status').then(this.handleFitnessMachineStatusCharacteristic); // TO DO

        }).catch(error => {
          console.error("Error during connecting fitness_machine: ", error);
          this.setState({ fitnessMachineService: null });
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
    this.setState({ cyclingPowerService: null });
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

  handlePowerMeasurementCharacteristic = (characteristic) => {
    return characteristic.startNotifications()
      .then(char => {
        characteristic.addEventListener('characteristicvaluechanged',
          this.onPowerMeasurementChanged);
      });
  }

  onPowerMeasurementChanged = (event) => {
    // https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.cycling_power_measurement.xml
    const data = event.target.value;
    const flags = data.getUint16(0, /*littleEndian=*/true);

    if (this.state.showTechnicalData) {
      //console.log("cycling_power_measurement flags", flags, `(0b${flags.toString(2).padStart(16, '0')})})`)
      const raw = uint8ArrayToHexString(new Uint8Array(data.buffer.slice(2)).buffer);
      //console.log("cycling_power_measurement data", `length=${data.byteLength}`, `content=${raw}`)
      this.setState({ rawCyclingPower: raw });

      const fields = [];
      fields.push(`Power: (${data.getUint16(2, true)})`);
      fields.push(`Accumulated Torque: (${data.getUint16(4, true)})`);
      fields.push(`Wheel rotations: (${data.getUint32(6, true)})`);
      fields.push(`Speed: (${data.getUint16(10, true)})`);
      fields.push(`Crank rotations (${data.getUint16(12, true)})`);
      fields.push(`Cadence (${data.getUint16(14, true)})`);
      this.setState({ fieldsCyclingPower: fields });
    }

    const result = {};
    let index = 2;

    result.instantaneousPower = { value: data.getInt16(index, /*littleEndian=*/true), unit: 'W' };
    index += 2;

    const pedalPowerBalancePresent = flags & 0x1;
    if (pedalPowerBalancePresent) {
      const pedalPowerBalanceReference = flags & 0x2;
      result.pedalPowerBalance = { value: data.getUint8(index), unit: '%', reference: pedalPowerBalanceReference ? 'Left' : 'Unknown' };
      index += 1;
    }

    const accumulatedTorquePresent = flags & 0x4;
    if (accumulatedTorquePresent) {
      const accumulatedTorqueSource = flags & 0x8;
      result.accumulatedTorque = { value: data.getUint16(index, /*littleEndian=*/true) * Math.pow(10, -5), unit: 'Nm', source: accumulatedTorqueSource ? 'Wheel' : 'Crank' };
      index += 2;
    }

    const wheelRevolutionDataPresent = flags & 0x10;
    if (wheelRevolutionDataPresent) {
      const prevWheelTime = this.state.powerMeasurement?.lastWheelEventTime?.value || 0;
      const prevWheelRevolutions = this.state.powerMeasurement?.cumulativeWheelRevolutions?.value || 0;
      let wheelRpm = this.state.powerMeasurement?.wheelRpm?.value || 0;
      let speedCounter = (this.state.powerMeasurement?.speedCounter || 0) + 1;

      const wheelTime = data.getUint16(index + 4, /*littleEndian=*/true);
      const wheelRevolutions = data.getUint32(index, /*littleEndian=*/true);

      const deltaRotations = wheelRevolutions - prevWheelRevolutions;
      let deltaTime = wheelTime - prevWheelTime;
      if (deltaTime < 0) { deltaTime += 65536; }

      if (deltaTime !== 0 && deltaRotations !== 0) {
        wheelRpm = 2048 * deltaRotations / deltaTime * 60;
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
      result.wheelRpm = { value: wheelRpm, unit: 'rpm'};
      result.speedCounter = speedCounter;
      result.distance = distance;
      result.speed = speed;

      index += 6;
    }

    const crankRevolutionDataPresent = flags & 0x20;
    if (crankRevolutionDataPresent) {
      const prevCrankTime = this.state.powerMeasurement?.lastCrankEventTime?.value || 0;
      const prevCrankRevolutions = this.state.powerMeasurement?.cumulativeCrankRevolutions?.value || 0;
      let cadence = this.state.powerMeasurement?.cadence?.value || 0;
      let crankCounter = (this.state.powerMeasurement?.crankCounter || 0) + 1;

      const crankTime = data.getUint16(index + 2, /*littleEndian=*/true);
      const crankRevolutions = data.getUint16(index, /*littleEndian=*/true);

      const deltaRotations = crankRevolutions - prevCrankRevolutions;
      let deltaTime = crankTime - prevCrankTime;
      if (deltaTime < 0) { deltaTime += 65536; }

      if (deltaTime !== 0 && deltaRotations !== 0) {
        cadence = 1024 * deltaRotations / deltaTime * 60;
        crankCounter = 0; // Reset
      }

      if (crankCounter > 10) {
        cadence = 0;
      }

      result.cumulativeCrankRevolutions = { value: crankRevolutions, unit: 'revolutions' };
      result.lastCrankEventTime = { value: crankTime, unit: 's' };
      result.crankCounter = crankCounter;
      result.cadence = { value: cadence, unit: 'rpm' };
      
      index += 4;
    }

    // TODO: remaining fields 
    // Extreme Force Magnitudes - Maximum Force Magnitude, Minimum Force Magnitude
    // Extreme Torque Magnitudes - Maximum Torque Magnitude, Minimum Torque Magnitude
    // Extreme Angles - Maximum Angle, Minimum Angle
    // Top Dead Spot Angle, Bottom Dead Spot Angle
    // Accumulated Energy

    this.setState({ powerMeasurement: result });
  }

  handlePowerFeatureCharacteristic = (characteristic) => {
    return characteristic.readValue()
      .then(data => {
        //https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.cycling_power_feature.xml

        let flags = 0;
        if (data.byteLength === 4) {
          flags = data.getUint32(0, /*littleEndian=*/true);
          //console.log("cycling_power_feature flags", flags, `(0b${flags.toString(2).padStart(32, '0')})})`)
        }
        else {
          flags = data.getUint16(0, /*littleEndian=*/true);
          //console.log("cycling_power_feature flags", flags, `(0b${flags.toString(2).padStart(16, '0')})})`)
        }

        const result = {};
        if (flags & 0x1) {
          result.pedalPowerBalanceSupported = true;
        }
        if (flags & 0x2) {
          result.accumulatedTorqueSupported = true;
        }
        if (flags & 0x4) {
          result.wheelRevolutionDataSupported = true;
        }
        if (flags & 0x8) {
          result.crankRevolutionDataSupported = true;
        }
        if (flags & 0x10) {
          result.extremeMagnitudesSupported = true;
        }
        if (flags & 0x20) {
          result.extremeAnglesSupported = true;
        }
        if (flags & 0x40) {
          result.topAndBottomDeadSpotAnglesSupported = true;
        }
        if (flags & 0x80) {
          result.accumulatedEnergySupported = true;
        }
        if (flags & 0x100) {
          result.offsetCompensationIndicatorSupported = true;
        }
        if (flags & 0x200) {
          result.offsetCompensationSupported = true;
        }
        if (flags & 0x400) {
          result.cyclingPowerMeasurementCharacteristicContentMaskingSupported = true;
        }
        if (flags & 0x800) {
          result.multipleSensorLocationsSupported = true;
        }
        if (flags & 0x1000) {
          result.crankLengthAdjustmentSupported = true;
        }
        if (flags & 0x2000) {
          result.chainLengthAdjustmentSupported = true;
        }
        if (flags & 0x4000) {
          result.chainWeightAdjustmentSupported = true;
        }
        if (flags & 0x8000) {
          result.spanLengthAdjustmentSupported = true;
        }
        this.setState({ powerFeatures: result });
      });
  }

  handleFitnessMachineFeatureCharacteristic = (characteristic) => {
    return characteristic.readValue()
      .then(data => {
        // See 4.3 Fitness Machine Feature
        const fitnessMachineFeatures = data.getUint32(0, /*littleEndian=*/true);
        //console.log("fitness_machine_feature", fitnessMachineFeatures, `(0b${fitnessMachineFeatures.toString(2).padStart(32, '0')})})`)
        const targetSettingsFeatures = data.getUint32(4, /*littleEndian=*/true);
        //console.log("fitness_machine_feature", targetSettingsFeatures, `(0b${targetSettingsFeatures.toString(2).padStart(32, '0')})})`)

        const resultMachineFeatures = {};
        if (fitnessMachineFeatures & 0x1) {
          resultMachineFeatures.averageSpeedSupported = true;
        }
        if (fitnessMachineFeatures & 0x2) {
          resultMachineFeatures.cadenceSupported = true;
        }
        if (fitnessMachineFeatures & 0x4) {
          resultMachineFeatures.totalDistanceSupported = true;
        }
        if (fitnessMachineFeatures & 0x8) {
          resultMachineFeatures.inclinationSupported = true;
        }
        if (fitnessMachineFeatures & 0x10) {
          resultMachineFeatures.elevationGainSupported = true;
        }
        if (fitnessMachineFeatures & 0x20) {
          resultMachineFeatures.paceSupported = true;
        }
        if (fitnessMachineFeatures & 0x40) {
          resultMachineFeatures.stepCountSupported = true;
        }
        if (fitnessMachineFeatures & 0x80) {
          resultMachineFeatures.resistanceLevelSupported = true;
        }
        if (fitnessMachineFeatures & 0x100) {
          resultMachineFeatures.strideCountSupported = true;
        }
        if (fitnessMachineFeatures & 0x200) {
          resultMachineFeatures.expendedEnergySupported = true;
        }
        if (fitnessMachineFeatures & 0x400) {
          resultMachineFeatures.heartRateMeasurementSupported = true;
        }
        if (fitnessMachineFeatures & 0x800) {
          resultMachineFeatures.metabolicEquivalentSupported = true;
        }
        if (fitnessMachineFeatures & 0x1000) {
          resultMachineFeatures.elapsedTimeSupported = true;
        }
        if (fitnessMachineFeatures & 0x2000) {
          resultMachineFeatures.remainingTimeSupported = true;
        }
        if (fitnessMachineFeatures & 0x4000) {
          resultMachineFeatures.powerMeasurementSupported = true;
        }
        if (fitnessMachineFeatures & 0x8000) {
          resultMachineFeatures.forceOnBeltAndPowerOutputSupported = true;
        }
        if (fitnessMachineFeatures & 0x10000) {
          resultMachineFeatures.userDataRetenstionSupported = true;
        }
        this.setState({ fitnessMachineFeatures: resultMachineFeatures });

        const resultTargetSettingsFeatures = {};
        if (targetSettingsFeatures & 0x1) {
          resultTargetSettingsFeatures.speedTargetSettingSupported = true;
        }
        if (targetSettingsFeatures & 0x2) {
          resultTargetSettingsFeatures.inclineTargetSettingSupported = true;
        }
        if (targetSettingsFeatures & 0x4) {
          resultTargetSettingsFeatures.resistanceTargetSettingSupported = true;
        }
        if (targetSettingsFeatures & 0x8) {
          resultTargetSettingsFeatures.powerTargetSettingSupported = true;
        }
        if (targetSettingsFeatures & 0x10) {
          resultTargetSettingsFeatures.heartRateTargetSettingSupported = true;
        }
        if (targetSettingsFeatures & 0x20) {
          resultTargetSettingsFeatures.targetedExpendedEnergyConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x40) {
          resultTargetSettingsFeatures.targetedStepNumberConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x80) {
          resultTargetSettingsFeatures.targetedStrideNumberConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x100) {
          resultTargetSettingsFeatures.targetedDistanceConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x200) {
          resultTargetSettingsFeatures.targetedTrainingTimeConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x400) {
          resultTargetSettingsFeatures.targetedTimeInTwoHeartRateZonesConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x800) {
          resultTargetSettingsFeatures.targetedTimeInThreeHeartRateZonesConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x1000) {
          resultTargetSettingsFeatures.targetedTimeInFiveHeartRateZonesConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x2000) {
          resultTargetSettingsFeatures.indoorBikeSimulationParametersSupported = true;
        }
        if (targetSettingsFeatures & 0x4000) {
          resultTargetSettingsFeatures.wheelCircumferenceConfigurationSupported = true;
        }
        if (targetSettingsFeatures & 0x8000) {
          resultTargetSettingsFeatures.spinDownControlSupported = true;
        }
        if (targetSettingsFeatures & 0x10000) {
          resultTargetSettingsFeatures.targetedCadenceConfigurationSupported = true;
        }
        this.setState({ targetSettingsFeatures: resultTargetSettingsFeatures });
      });
  }

  handleSupportedResistanceLevelRangeCharacteristic = (characteristic) => {
    return characteristic.readValue()
      .then(data => {
        // https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.supported_resistance_level_range.xml
        const minimumResistanceLevel = data.getInt16(0, /*littleEndian=*/true);
        const maximumResistanceLevel = data.getInt16(2, /*littleEndian=*/true);
        const minimumIncrement = data.getUint16(4, /*littleEndian=*/true);
        this.setState({ supportedResistanceLevel: { minimum: minimumResistanceLevel, maximum: maximumResistanceLevel, increment: minimumIncrement } });
      });
  }

  handleFitnessMachineControlPointCharacteristic = (characteristic) => {
    return characteristic.startNotifications()
      .then(char => {
        characteristic.addEventListener('characteristicvaluechanged',
          this.onFitnessMachineControlPointChanged);
      });
  }

  onFitnessMachineControlPointChanged = (event) => {    
    const data = event.target.value;
    if (data.getUint8(0) === 0x80/*OpCode result=*/) {
      switch (data.getUint8(1)) {
        case 0x00:
          if (data.getUint8(2) === 0x01) {
          // Request accepted, next call the procedure 
          const service = this.state.fitnessMachineService;
          service.getCharacteristic('fitness_machine_control_point').then(characteristic => {
            characteristic.writeValue(this.state.writeTofittnessMachine).then(() => {
              this.setState({ writeTofittnessMachine: null });
            }).catch(error => {
              console.error("onFitnessMachineControlPointChanged: Error during writing fitness_machine_control_point: ", error);
            });
          }
          ).catch(error => {
            console.error("onFitnessMachineControlPointChanged: Error during connecting to fitness_machine_control_point: ", error);
          });
        }
        else {
          console.error("onFitnessMachineControlPointChanged: ", "Request Control failed");
        }
          return;
        case 0x04:
          if (data.getUint8(2) === 0x01) {
            console.log("Resistance is changed")
          }
          else {
            console.error("onFitnessMachineControlPointChanged: ", "Set Target Resistance failed");
          }
          return;
        default:
          console.error("onFitnessMachineControlPointChanged: ", `Opcode ${data.getUint8(1)} is not implemented`)
        }
    }
    console.log("fitness_machine_control_point", data);
  }


  handleSupportedPowerRangeCharacteristic = (characteristic) => {
    return characteristic.readValue()
      .then(data => {
        // https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.supported_power_range.xml
        const minimumPower = data.getInt16(0, /*littleEndian=*/true);
        const maximumPower = data.getInt16(2, /*littleEndian=*/true);
        const minimumIncrement = data.getUint16(4, /*littleEndian=*/true);
        this.setState({ supportedPowerRange: { minimum: { value: minimumPower, unit: 'Watt' }, maximum: { value: maximumPower, unit: 'Watt' }, increment: { value: minimumIncrement, unit: 'Watt' } } });
      });
  }

  handleIndoorBikeDataCharacteristic = (characteristic) => {
    return characteristic.startNotifications()
      .then(char => {
        characteristic.addEventListener('characteristicvaluechanged',
          this.onIndoorBikeDataChanged);
      });
  }

  onIndoorBikeDataChanged = (event) => {
    // https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.indoor_bike_data.xml
    const data = event.target.value;
    const flags = data.getUint16(0, /*littleEndian=*/true);

    this.setState({flagsFitsnessMachine : `0b${flags.toString(2).padStart(16, '0')}`});
    const raw = uint8ArrayToHexString(new Uint8Array(data.buffer.slice(2)).buffer);
    this.setState({ rawFitnessMachine: raw });

    const fields = [];
    fields.push(`Speed: (${data.getUint16(2, true)})`);
    fields.push(`Cadence: (${data.getUint16(4, true)})`);
    fields.push(` (${data.getUint16(6, true)})`);
    this.setState({ fieldsFitnessMachine: fields });

    const result = {};
    let index = 2;

    const moreData = flags & 0x1;
    // This is a weird flag because if it is zero then instantaneousSpeed is present
    if (!moreData) {
      result.instantaneousSpeed = { value: data.getUint16(index, /*littleEndian=*/true) / 100, unit: 'km/h' };
      index += 2;
    }

    const averageSpeedPresent = flags & 0x2;
    if (averageSpeedPresent) {
      result.averageSpeed = { value: data.getUint16(index, /*littleEndian=*/true) / 100, unit: 'm/s' };
      index += 2;
    }

    const instantaneousCadencePresent = flags & 0x4;
    if (instantaneousCadencePresent) {
      result.instantaneousCadence = { value: data.getUint16(index, /*littleEndian=*/true) / 20, unit: 'rpm' };
      index += 2;
    }

    const averageCadencePresent = flags & 0x8;
    if (averageCadencePresent) {
      result.averageCadence = { value: data.getUint16(index, /*littleEndian=*/true) / 20, unit: 'rpm' };
      index += 2;
    }

    const totalDistancePresent = flags & 0x10;
    // This specified as a 24 bit field
    if (totalDistancePresent) {
      result.totalDistance = { value: data.getUint32(index, /*littleEndian=*/true) * data.getUint8(index + 2), unit: 'm' };
      index += 3;
    }

    const resistanceLevelPresent = flags & 0x20;
    if (resistanceLevelPresent) {
      result.resistanceLevel = { value: data.getInt16(index, /*littleEndian=*/true), unit: '%' };
      index += 2;
    }

    const instantaneousPowerPresent = flags & 0x40;
    if (instantaneousPowerPresent) {
      result.instantaneousPower = { value: data.getInt16(index, /*littleEndian=*/true), unit: 'W' };
      index += 2;
    }

    // TODO: remaining fields
    // Average Power present
    // Expended Energy present
    // Heart Rate present
    // Metabolic Equivalent present
    // Elapsed Time present
    // Remaining Time present

    this.setState({ indoorBikeData: result });

  }

  handleDeviceInformationService = async (service) => {
    service.getCharacteristics().then(async characteristics => {
      const result = {};
      for (const characteristic of characteristics) {
        const data = await characteristic.readValue();
        switch (Number('0x' + characteristic.uuid.substring(0, 8))) {
          case 0x2a23:
            result.systemId = new TextDecoder().decode(data.buffer);
            break;
          case 0x2a24:
            result.modelNumber = new TextDecoder().decode(data.buffer);
            break;
          case 0x2a25:
            result.serialNumber = new TextDecoder().decode(data.buffer);
            break;
          case 0x2a26:
            result.firmwareRevision = new TextDecoder().decode(data.buffer);
            break;
          case 0x2a27:
            result.hardwareRevision = new TextDecoder().decode(data.buffer);
            break;
          case 0x2a28:
            result.softwareRevision = new TextDecoder().decode(data.buffer);
            break;
          case 0x2a29:
            result.manufacturerName = new TextDecoder().decode(data.buffer);
            break;
          case 0x2a2a:
            result.ieee11073_20601RegulatoryCertificationDataList = new TextDecoder().decode(data.buffer);
            break;
          case 0x2a50:
            result.pnpId = new TextDecoder().decode(data.buffer);
            break;
          default:
            break;
        }
        //console.log("\tcharacteristic", characteristic.uuid.substring(0, 8), new TextDecoder().decode(data.buffer));
      }
      this.setState({ deviceInformation: result });
    });
  }

  handleButtonSetResistance = (resistance) => () => {
    const service = this.state.fitnessMachineService;
    service.getCharacteristic('fitness_machine_control_point').then(characteristic => {
      characteristic.writeValue(new Uint8Array([0x0]/*Request control=*/)).then(() => {
        const data = new Uint8Array(3);
        data.set([0x4, 0x0, resistance], 0);  
        this.setState({ writeTofittnessMachine: data });
      }).catch(error => {
        console.error("Error during writing fitness_machine_control_point: ", error);
      });
    }
    ).catch(error => {
      console.error("Error during connecting to fitness_machine_control_point: ", error);
    });
  }

  render() {
    return (
      <Card>
        <CardContent>
          <Stack spacing={2}>

            <Typography variant="h4" marginTop={3} marginBottom={3} align='center'>
              Cycling Power
            </Typography>

            {this.state.busyConnecting &&
              <CircularProgress />
            }

            {this.state.cyclingPowerService ?
            <>
              <Typography variant="h5" marginTop={3} marginBottom={3} align='center'>
                Connected to: '{this.state.cyclingPowerService.device.name}'
              </Typography>
              <Stack spacing={2} direction="row" >
                <Button onClick={this.handleButtonSetResistance(1)} variant="contained" style={{width:20}} >1</Button>
                <Button onClick={this.handleButtonSetResistance(25)} variant="contained" style={{width:20}} >100</Button>
                <Button onClick={this.handleButtonSetResistance(255)} variant="contained" style={{width:20}} >255</Button>
              </Stack>
            </>
              :
              <Button variant="contained" onClick={this.buttonConnectDevice} >
                Connect
              </Button>
            }


            {this.state.powerMeasurement &&
              <Stack spacing={2} direction="row" >

                {this.state.powerMeasurement.instantaneousPower &&
                  <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
                    Power: {this.state.powerMeasurement.instantaneousPower.value} {this.state.powerMeasurement.instantaneousPower.unit}
                  </Typography>
                }

                {this.state.powerMeasurement && this.state.powerMeasurement.accumulatedTorque &&
                  <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
                    Accumulated Torque: ({this.state.powerMeasurement.accumulatedTorque.source}) {this.state.powerMeasurement.accumulatedTorque.value.toFixed(3)} {this.state.powerMeasurement.accumulatedTorque.unit}
                  </Typography>
                }

              </Stack>
            }

            {this.state.powerMeasurement && this.state.indoorBikeData &&
              <Stack spacing={2} direction="row" >

                  <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
                    Distance: {this.state.powerMeasurement.distance.value.toFixed(1)} {this.state.powerMeasurement.distance.unit}
                  </Typography>

                  <Typography variant="h3" marginTop={3} marginBottom={3} align='center'>
                    Speed: {this.state.indoorBikeData.instantaneousSpeed.value.toFixed(1)} {this.state.indoorBikeData.instantaneousSpeed.unit}
                  </Typography>

              </Stack>
            }

            {this.state.showTechnicalData &&
              <>
                {this.state.fieldsCyclingPower && this.state.fieldsCyclingPower &&
                <>
                  <Typography variant="h2" marginTop={3} marginBottom={3} align='center'>
                    {this.state.rawCyclingPower}
                  </Typography>

                  <List dense={true}>
                  {this.state.fieldsCyclingPower.map((item, index) => (
                    <ListItem key={index}>
                      <ListItemText primaryTypographyProps={{ variant: 'h3' }}
                        primary={item}
                      />
                    </ListItem>
                  ))}
                  </List>
                  </>
                }

                {this.state.fieldsFitnessMachine && this.state.fieldsFitnessMachine &&
                <>
                  <Typography variant="h2" marginTop={3} marginBottom={3} align='center'>
                    flags: {this.state.flagsFitsnessMachine}
                  </Typography>

                  <Typography variant="h2" marginTop={3} marginBottom={3} align='center'>
                    raw data: {this.state.rawFitnessMachine}
                  </Typography>

                  <List dense={true}>
                  {this.state.fieldsFitnessMachine.map((item, index) => (
                    <ListItem key={index}>
                      <ListItemText primaryTypographyProps={{ variant: 'h3' }}
                        primary={item}
                      />
                    </ListItem>
                  ))}
                  </List>
                  </>
                }

                {this.state.powerFeatures &&
                  <Typography variant="body" marginTop={3} marginBottom={3} align='center'>
                    Power Features: {JSON.stringify(this.state.powerFeatures)}
                  </Typography>
                }

                {this.state.deviceInformation &&
                  <Typography variant="body" marginTop={3} marginBottom={3} align='center'>
                    Device Information: {JSON.stringify(this.state.deviceInformation)}
                  </Typography>
                }

                {this.state.fitnessMachineFeatures &&
                  <Typography variant="body" marginTop={3} marginBottom={3} align='center'>
                    Fitness Machine Features: {JSON.stringify(this.state.fitnessMachineFeatures)}
                  </Typography>
                }

                {this.state.targetSettingsFeatures &&
                  <Typography variant="body" marginTop={3} marginBottom={3} align='center'>
                    Target Settings Features: {JSON.stringify(this.state.targetSettingsFeatures)}
                  </Typography>
                }

                {this.state.supportedResistanceLevel &&
                  <Typography variant="body" marginTop={3} marginBottom={3} align='center'>
                    Supported Resistance Level: {JSON.stringify(this.state.supportedResistanceLevel)}
                  </Typography>
                }

                {this.state.supportedPowerRange &&
                  <Typography variant="body" marginTop={3} marginBottom={3} align='center'>
                    Supported Power Range: {JSON.stringify(this.state.supportedPowerRange)}
                  </Typography>
                }

              </>}

          </Stack>
        </CardContent>
      </Card>
    );
  }
}

export default CyclePower;