
function uint8ArrayToHexString(buffer) { // buffer is an ArrayBuffer
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join(' ');
  }

function sensorLocationLookup(value) {
    // https://github.com/oesmith/gatt-xml/blob/master/org.bluetooth.characteristic.sensor_location.xml
    switch (value) {
        case 0: return 'Other';
        case 1: return 'Top of shoe';
        case 2: return 'In shoe';
        case 3: return 'Hip';
        case 4: return 'Front Wheel';
        case 5: return 'Left Crank';
        case 6: return 'Right Crank';
        case 7: return 'Left Pedal';
        case 8: return 'Right Pedal';
        case 9: return 'Front Hub';
        case 10: return 'Rear Dropout';
        case 11: return 'Chainstay';
        case 12: return 'Rear Wheel';
        case 13: return 'Rear Hub';
        case 14: return 'Chest';
        case 15: return 'Spider';
        case 16: return 'Chain Ring';
        default: return 'Unknown';
      }
}

module.exports = { uint8ArrayToHexString, sensorLocationLookup }
