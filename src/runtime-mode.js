import {sensorTopics,productionSensorTopic} from './sensor-message.js';
import {rfidTopics,productionRfidTopic} from './rfid-message.js';
export function dataMode(value='archive') {
 if(!['archive','operational'].includes(value))throw new Error('invalid_data_mode');
 return value;
}
export function subscribedTopics(mode,testTopic) {
 return dataMode(mode)==='operational'?[productionSensorTopic,productionRfidTopic]:[testTopic,...sensorTopics,...rfidTopics];
}
